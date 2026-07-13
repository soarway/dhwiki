"""
License 验证模块

校验流程：
1. 加载 license.json（默认路径：backend/license.json）
2. 用 RSA 公钥验证签名
3. 校验硬件指纹（如 license 中指定了绑定机器）
4. 获取可信时间（NTP + DNS欺骗检测）
5. 判断到期状态

缓存策略（Redis + 内存双重兜底）：
- 每天第一次登录触发一次完整校验
- 结果写入 Redis（key: license:check:{YYYY-MM-DD}，TTL 到次日零点）
- 同时更新 license:last_known（永久保留，Redis 不可用时的兜底）
- 内存缓存：应对 Redis 短暂不可用
"""
import json
import logging
import threading
from base64 import b64decode
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── 路径配置 ─────────────────────────────────────────────────────
_BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent  # backend/
LICENSE_FILE = _BASE_DIR / "license.json"
PUBLIC_KEY_FILE = Path(__file__).resolve().parent / "license_public.pem"

# ── Redis 缓存键 ──────────────────────────────────────────────────
_REDIS_KEY_TODAY = "license:check:{date}"
_REDIS_KEY_LAST = "license:last_known"

# ── 内存缓存（同进程兜底） ───────────────────────────────────────
_mem_cache: dict[str, dict] = {}
_mem_lock = threading.Lock()

# ── 30天警告阈值 ─────────────────────────────────────────────────
WARN_DAYS = 30


# ══════════════════════════════════════════════════════════════════
# LicenseStatus 数据类
# ══════════════════════════════════════════════════════════════════

class LicenseStatus:
    __slots__ = (
        "valid", "expired", "days_left", "expire_date",
        "customer_name", "customer_id", "max_users",
        "warn", "message", "time_source",
    )

    def __init__(
        self,
        valid: bool,
        expired: bool,
        days_left: int,
        expire_date: str,
        customer_name: str,
        customer_id: str,
        max_users: int,
        warn: bool,
        message: str,
        time_source: str,
    ):
        self.valid = valid
        self.expired = expired
        self.days_left = days_left
        self.expire_date = expire_date
        self.customer_name = customer_name
        self.customer_id = customer_id
        self.max_users = max_users
        self.warn = warn
        self.message = message
        self.time_source = time_source

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "expired": self.expired,
            "days_left": self.days_left,
            "expire_date": self.expire_date,
            "customer_name": self.customer_name,
            "customer_id": self.customer_id,
            "max_users": self.max_users,
            "warn": self.warn,
            "message": self.message,
            "time_source": self.time_source,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "LicenseStatus":
        return cls(
            valid=d.get("valid", False),
            expired=d.get("expired", True),
            days_left=d.get("days_left", 0),
            expire_date=d.get("expire_date", "N/A"),
            customer_name=d.get("customer_name", "未知"),
            customer_id=d.get("customer_id", ""),
            max_users=d.get("max_users", 0),
            warn=d.get("warn", True),
            message=d.get("message", ""),
            time_source=d.get("time_source", "local"),
        )


def _err(message: str, time_source: str = "local") -> LicenseStatus:
    """快速构造一个无效（已过期）的状态对象。"""
    return LicenseStatus(
        valid=False, expired=True, days_left=0,
        expire_date="N/A", customer_name="未知", customer_id="",
        max_users=0, warn=True, message=message, time_source=time_source,
    )


# ══════════════════════════════════════════════════════════════════
# RSA 签名验证
# ══════════════════════════════════════════════════════════════════

def _load_public_key():
    """加载 RSA 公钥，失败时返回 None。"""
    try:
        from cryptography.hazmat.primitives import serialization
        return serialization.load_pem_public_key(PUBLIC_KEY_FILE.read_bytes())
    except FileNotFoundError:
        logger.error("授权公钥文件不存在: %s", PUBLIC_KEY_FILE)
        return None
    except Exception as e:
        logger.error("加载授权公钥失败: %s", e)
        return None


def _verify_signature(license_data: dict) -> bool:
    """
    验证 license JSON 的 RSA-PSS 签名。
    签名字段 'signature' 覆盖除自身之外的所有字段（按 key 排序的 JSON）。
    """
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.exceptions import InvalidSignature

    pub_key = _load_public_key()
    if pub_key is None:
        return False

    try:
        sig_b64 = license_data.get("signature", "")
        if not sig_b64:
            return False
        signature = b64decode(sig_b64)
        payload = {k: v for k, v in license_data.items() if k != "signature"}
        payload_bytes = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
        pub_key.verify(
            signature,
            payload_bytes,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            hashes.SHA256(),
        )
        return True
    except InvalidSignature:
        logger.warning("授权文件签名验证失败")
        return False
    except Exception as e:
        logger.error("签名验证异常: %s", e)
        return False


# ══════════════════════════════════════════════════════════════════
# 核心校验逻辑
# ══════════════════════════════════════════════════════════════════

def check_license() -> LicenseStatus:
    """
    执行完整的 License 校验（可能耗时 2-5 秒，含 NTP 查询）。
    """
    # 1. 加载 license 文件
    if not LICENSE_FILE.exists():
        return _err("授权文件不存在，请将 license.json 放置到 backend/ 目录后重启服务")

    try:
        license_data = json.loads(LICENSE_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        return _err(f"授权文件读取失败：{e}")

    # 2. 验证签名
    if not _verify_signature(license_data):
        if _load_public_key() is None:
            return _err(
                "授权公钥未配置。请将 license_public.pem 放置到 "
                "app/services/license/ 目录后重启服务"
            )
        return _err("授权文件签名无效，文件可能被篡改，请联系服务商重新获取授权")

    customer_name = license_data.get("customer_name", "未知")
    customer_id = license_data.get("customer_id", "")
    max_users = int(license_data.get("max_users", 0))
    expire_str = license_data.get("expire_date", "")

    # 3. 硬件指纹校验
    expected_fp = license_data.get("hardware_fingerprint", "any")
    if expected_fp and expected_fp.lower() != "any":
        from app.services.license.hardware import get_hardware_fingerprint
        actual_fp = get_hardware_fingerprint()
        if actual_fp != expected_fp:
            logger.warning(
                "硬件指纹不匹配: expected=%s actual=%s", expected_fp[:16], actual_fp[:16]
            )
            return LicenseStatus(
                valid=False, expired=True, days_left=0,
                expire_date=expire_str,
                customer_name=customer_name, customer_id=customer_id,
                max_users=max_users, warn=True,
                message="硬件指纹不匹配，本授权文件不适用于当前服务器，请联系服务商",
                time_source="local",
            )

    # 4. 获取可信时间（含 DNS 欺骗检测）
    from app.services.license.time_checker import get_reliable_time
    time_result = get_reliable_time()

    if time_result.dns_spoofing:
        return LicenseStatus(
            valid=False, expired=True, days_left=0,
            expire_date=expire_str,
            customer_name=customer_name, customer_id=customer_id,
            max_users=max_users, warn=True,
            message="检测到 DNS/Hosts 欺骗（NTP 服务器被重定向到内网），授权验证失败",
            time_source="dns_spoofed",
        )

    now = time_result.time

    # 5. 解析到期日
    try:
        expire_dt = datetime.strptime(expire_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return _err(f"授权文件中的到期日期格式有误：{expire_str!r}", time_result.source)

    # 6. 计算剩余天数
    delta = expire_dt - now
    days_left = delta.days  # 负数 = 已过期
    expired = days_left < 0
    warn = not expired and days_left <= WARN_DAYS

    if expired:
        message = (
            f"授权已于 {expire_str} 到期，系统已停止服务。"
            f"请联系服务商（客户编号：{customer_id}）续期"
        )
    elif warn:
        message = (
            f"授权将在 {days_left} 天后到期（{expire_str}），"
            f"请尽快联系服务商续期，以免影响正常使用"
        )
    else:
        message = f"授权有效，剩余 {days_left} 天"

    return LicenseStatus(
        valid=not expired,
        expired=expired,
        days_left=max(days_left, 0),
        expire_date=expire_str,
        customer_name=customer_name,
        customer_id=customer_id,
        max_users=max_users,
        warn=expired or warn,
        message=message,
        time_source=time_result.source,
    )


# ══════════════════════════════════════════════════════════════════
# Redis + 内存缓存层
# ══════════════════════════════════════════════════════════════════

def _seconds_until_midnight() -> int:
    """计算到今日午夜的剩余秒数（至少 60 秒）。"""
    now = datetime.now()
    from datetime import timedelta
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(int((midnight - now).total_seconds()), 60)


def _redis_get(key: str) -> Optional[str]:
    try:
        from app.core.deps import _redis
        return _redis().get(key)
    except Exception:
        return None


def _redis_set(key: str, value: str, ttl: int) -> None:
    try:
        from app.core.deps import _redis
        _redis().setex(key, ttl, value)
    except Exception:
        pass


def _mem_get(key: str) -> Optional[dict]:
    with _mem_lock:
        return _mem_cache.get(key)


def _mem_set(key: str, value: dict) -> None:
    with _mem_lock:
        _mem_cache[key] = value


def _save_result(status: LicenseStatus) -> None:
    """将结果写入 Redis（今日 + last_known）和内存缓存。"""
    today = date.today().isoformat()
    today_key = _REDIS_KEY_TODAY.format(date=today)
    encoded = json.dumps(status.to_dict(), ensure_ascii=False)
    ttl = _seconds_until_midnight()

    _redis_set(today_key, encoded, ttl)
    _redis_set(_REDIS_KEY_LAST, encoded, 365 * 86400)  # last_known 保留1年

    _mem_set(today_key, status.to_dict())
    _mem_set(_REDIS_KEY_LAST, status.to_dict())


def _load_cached() -> Optional[LicenseStatus]:
    """尝试从缓存（Redis 或 内存）加载今日结果。"""
    today = date.today().isoformat()
    today_key = _REDIS_KEY_TODAY.format(date=today)

    # 优先 Redis
    raw = _redis_get(today_key)
    if raw:
        try:
            return LicenseStatus.from_dict(json.loads(raw))
        except Exception:
            pass

    # 内存缓存
    cached = _mem_get(today_key)
    if cached:
        return LicenseStatus.from_dict(cached)

    return None


def _load_last_known() -> Optional[LicenseStatus]:
    """加载最近一次有效的校验结果（跨天兜底）。"""
    raw = _redis_get(_REDIS_KEY_LAST)
    if raw:
        try:
            return LicenseStatus.from_dict(json.loads(raw))
        except Exception:
            pass
    cached = _mem_get(_REDIS_KEY_LAST)
    if cached:
        return LicenseStatus.from_dict(cached)
    return None


def get_license_status_cached(timeout: float = 5.0) -> LicenseStatus:
    """
    获取 License 状态（带缓存）。

    - 今日已有缓存 → 直接返回（毫秒级）
    - 今日无缓存（每天首次登录）→ 执行完整校验（最多 timeout 秒）
      - 校验超时 → 返回 last_known 结果（或降级为"未知"状态）
    """
    # 1. 今日缓存命中
    cached = _load_cached()
    if cached is not None:
        return cached

    # 2. 执行校验（限时）
    import concurrent.futures
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(check_license)
        try:
            status = future.result(timeout=timeout)
        except concurrent.futures.TimeoutError:
            logger.warning("License 校验超时（%.1fs），使用上次已知结果", timeout)
            last = _load_last_known()
            if last is not None:
                return last
            # 真正第一次且超时，进行快速的签名+有效期检查（不含NTP）
            status = _quick_check_no_ntp()

    # 3. 缓存结果
    _save_result(status)
    return status


def _quick_check_no_ntp() -> LicenseStatus:
    """
    快速校验（仅检查文件存在性和签名，不做 NTP 查询）。
    用于 NTP 超时时的兜底，采用本机时间。
    """
    if not LICENSE_FILE.exists():
        return _err("授权文件不存在")
    try:
        license_data = json.loads(LICENSE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return _err("授权文件读取失败")

    if not _verify_signature(license_data):
        return _err("授权文件签名无效")

    expire_str = license_data.get("expire_date", "")
    customer_name = license_data.get("customer_name", "未知")
    customer_id = license_data.get("customer_id", "")
    max_users = int(license_data.get("max_users", 0))

    try:
        expire_dt = datetime.strptime(expire_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        return _err(f"授权文件到期日期格式错误：{expire_str!r}")

    now = datetime.now(timezone.utc)
    days_left = (expire_dt - now).days
    expired = days_left < 0
    warn = not expired and days_left <= WARN_DAYS

    if expired:
        message = f"授权已于 {expire_str} 到期（使用本机时间判断），请联系服务商续期"
    elif warn:
        message = f"授权将在 {days_left} 天后到期（{expire_str}），请尽快联系服务商续期"
    else:
        message = f"授权有效，剩余约 {days_left} 天（本机时间，NTP 查询超时）"

    return LicenseStatus(
        valid=not expired,
        expired=expired,
        days_left=max(days_left, 0),
        expire_date=expire_str,
        customer_name=customer_name,
        customer_id=customer_id,
        max_users=max_users,
        warn=expired or warn,
        message=message,
        time_source="local(ntp_timeout)",
    )
