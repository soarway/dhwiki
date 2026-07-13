"""
可信时间获取模块

策略（优先级从高到低）：
1. 并行查询多个 NTP 服务器，取首个成功响应
2. 若 NTP 服务器域名解析到内网 IP → 判定为 DNS/Hosts 欺骗
3. 若所有 NTP 均超时（无互联网）→ 回退使用本机时间

DNS 欺骗判定规则：
- 任意一个 NTP 服务器的全部解析 IP 均属于私有地址段
  → 该服务器被重定向到内网，视为欺骗，跳过
- 若所有 NTP 服务器都被重定向到内网（全部欺骗）→ 返回 spoofing=True
"""
import ipaddress
import logging
import socket
import time as _time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── 受信任的 NTP 服务器列表 ──────────────────────────────────────
NTP_SERVERS = [
    "ntp.aliyun.com",       # 阿里云 NTP
    "ntp.tencent.com",      # 腾讯云 NTP
    "ntp.ntsc.ac.cn",       # 中国国家授时中心
    "time.cloudflare.com",  # Cloudflare NTP
]

# ── 私有 / 回环 / 链路本地 网段 ──────────────────────────────────
_PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),   # Carrier-grade NAT
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

DNS_TIMEOUT = 2.0   # 秒：域名解析超时
NTP_TIMEOUT = 2.5   # 秒：NTP UDP 超时
TOTAL_TIMEOUT = 5.0 # 秒：并行总超时


def _is_private_ip(ip_str: str) -> bool:
    """判断 IP 是否属于私有/回环/链路本地地址段。"""
    try:
        addr = ipaddress.ip_address(ip_str)
        return any(addr in net for net in _PRIVATE_NETS)
    except ValueError:
        return True  # 无法解析视为可疑


def _resolve_hostname(hostname: str) -> list[str]:
    """
    解析主机名为 IP 列表。
    返回空列表表示解析失败。
    """
    try:
        old_timeout = socket.getdefaulttimeout()
        socket.setdefaulttimeout(DNS_TIMEOUT)
        try:
            infos = socket.getaddrinfo(hostname, None)
            return list({info[4][0] for info in infos})
        finally:
            socket.setdefaulttimeout(old_timeout)
    except Exception:
        return []


def _is_dns_spoofed(hostname: str) -> Optional[bool]:
    """
    检查某个 NTP 服务器是否被 DNS 欺骗。
    返回:
      True  → 所有解析 IP 均为私有地址（已欺骗）
      False → 至少有一个公网 IP（未欺骗）
      None  → DNS 解析失败（无法判断，视为无互联网而非欺骗）
    """
    ips = _resolve_hostname(hostname)
    if not ips:
        return None  # 解析失败，不能判断是欺骗
    if all(_is_private_ip(ip) for ip in ips):
        logger.warning("DNS 欺骗检测：%s 解析到私有 IP %s", hostname, ips)
        return True
    return False


def _query_ntp(hostname: str) -> Optional[datetime]:
    """
    向单个 NTP 服务器查询时间。
    失败返回 None。
    """
    try:
        import ntplib
        client = ntplib.NTPClient()
        response = client.request(hostname, version=3, timeout=NTP_TIMEOUT)
        return datetime.fromtimestamp(response.tx_time, tz=timezone.utc)
    except Exception as e:
        logger.debug("NTP 查询失败 %s: %s", hostname, e)
        return None


def _check_server(hostname: str) -> tuple[Optional[datetime], str]:
    """
    完整检查单个 NTP 服务器（DNS欺骗检测 + 时间查询）。
    返回 (time_or_None, status_str)
    status_str: "ok:<hostname>" / "spoofed" / "unreachable"
    """
    spoofed = _is_dns_spoofed(hostname)
    if spoofed is True:
        return None, "spoofed"
    if spoofed is None:
        return None, "unreachable"
    # DNS 正常，查询 NTP
    t = _query_ntp(hostname)
    if t is not None:
        return t, f"ntp:{hostname}"
    return None, "unreachable"


class TimeCheckResult:
    __slots__ = ("time", "source", "dns_spoofing")

    def __init__(self, time: datetime, source: str, dns_spoofing: bool):
        self.time = time
        self.source = source
        self.dns_spoofing = dns_spoofing


def get_reliable_time() -> TimeCheckResult:
    """
    并行查询所有 NTP 服务器，返回首个可信时间。

    - 任一服务器 DNS 解析到私有 IP → 记录为欺骗嫌疑
    - 若所有服务器均报告 DNS 欺骗 → dns_spoofing=True
    - 若所有服务器超时/不可达（无网络）→ 回退本机时间，dns_spoofing=False
    """
    spoofed_count = 0
    unreachable_count = 0

    with ThreadPoolExecutor(max_workers=len(NTP_SERVERS), thread_name_prefix="ntp") as pool:
        futures = {pool.submit(_check_server, srv): srv for srv in NTP_SERVERS}
        deadline = _time.monotonic() + TOTAL_TIMEOUT

        for future in as_completed(futures, timeout=TOTAL_TIMEOUT):
            remaining = deadline - _time.monotonic()
            if remaining <= 0:
                break
            try:
                t, status = future.result(timeout=max(remaining, 0.1))
            except Exception:
                unreachable_count += 1
                continue

            if status == "spoofed":
                spoofed_count += 1
            elif status == "unreachable":
                unreachable_count += 1
            else:
                # 成功获取 NTP 时间
                logger.debug("可信时间来源: %s", status)
                return TimeCheckResult(time=t, source=status, dns_spoofing=False)

    # 所有 NTP 均未成功
    total = len(NTP_SERVERS)
    if spoofed_count > 0 and (spoofed_count + unreachable_count) >= total:
        # 有欺骗迹象，且没有任何服务器能正常解析到公网地址
        logger.warning(
            "DNS 欺骗检测：%d/%d 个 NTP 服务器被重定向到内网，判定为授权篡改",
            spoofed_count, total,
        )
        return TimeCheckResult(
            time=datetime.now(timezone.utc),
            source="dns_spoofed",
            dns_spoofing=True,
        )

    # 无网络，回退本机时间
    logger.info("NTP 全部不可达（离线环境），使用本机时间")
    return TimeCheckResult(
        time=datetime.now(timezone.utc),
        source="local",
        dns_spoofing=False,
    )
