#!/usr/bin/env python3
"""
企业AI知识库 — License 签发工具（在您本机运行）
=================================================
工作流程：
  1. 客户运行 get_hardware_info.py，将生成的 JSON 文件发给您
  2. 您在本机编写客户配置文件（参考模板），将客户发来的硬件指纹填入
  3. 运行本脚本签发 license，将 license.json 发给客户

用法：
  # 首次使用：生成密钥对（此后私钥永远保留在本机，切勿外传）
  python gen_license.py --keygen

  # 从硬件信息文件自动填充指纹，签发绑定机器的 license
  python gen_license.py --config customer_A.json --hardware hardware_info_xxx.json

  # 签发不绑定机器的 license（hardware_fingerprint = "any"）
  python gen_license.py --config customer_A.json

  # 生成配置模板（首次为新客户配置时使用）
  python gen_license.py --new-config customer_A.json

输出：
  license.json    → 发送给客户，放到 backend/ 根目录
  keys/private.pem → 严格保密，永远留在您本机！
  keys/public.pem  → 首次生成后复制到 app/services/license/license_public.pem 并部署
"""

import argparse
import base64
import json
import logging
import os
import platform
import sys
from datetime import date, timedelta
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa
except ImportError:
    log.error("缺少依赖：pip install cryptography")
    sys.exit(1)


# ══════════════════════════════════════════════════════════════════
# 密钥管理
# ══════════════════════════════════════════════════════════════════

def generate_key_pair(keys_dir: Path):
    """生成 RSA-2048 密钥对并保存到 keys/ 目录。"""
    keys_dir.mkdir(parents=True, exist_ok=True)
    priv_path = keys_dir / "private.pem"
    pub_path = keys_dir / "public.pem"

    if priv_path.exists():
        ans = input(
            f"\n  [!] 私钥已存在：{priv_path}\n"
            "      重新生成将使所有已签发的 license 全部失效！\n"
            "      确认重新生成？(输入 yes 继续，其他任意键取消): "
        ).strip().lower()
        if ans != "yes":
            log.info("  已取消，使用现有密钥")
            return load_private_key(priv_path)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    priv_path.write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    pub_path.write_bytes(
        private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    if platform.system() != "Windows":
        os.chmod(priv_path, 0o600)

    log.info("  [+] 密钥对已生成")
    log.info("      私钥: %s", priv_path.resolve())
    log.info("      公钥: %s", pub_path.resolve())

    # 自动同步公钥到 app 目录（如果在项目中运行）
    app_pub = Path(__file__).parent.parent / "app" / "services" / "license" / "license_public.pem"
    if app_pub.parent.exists():
        import shutil
        shutil.copy2(pub_path, app_pub)
        log.info("  [+] 公钥已同步到应用目录: %s", app_pub.resolve())

    log.info("\n  ⚠️  请重新部署应用以使新公钥生效。")
    return private_key


def load_private_key(path: Path):
    if not path.exists():
        log.error("私钥文件不存在：%s\n请先运行 --keygen 生成密钥对", path.resolve())
        sys.exit(1)
    with open(path, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)


# ══════════════════════════════════════════════════════════════════
# 签名
# ══════════════════════════════════════════════════════════════════

def sign_license(payload: dict, private_key) -> str:
    """RSA-PSS + SHA-256 签名（按 key 排序后序列化，排除 signature 字段）。"""
    payload_bytes = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    signature = private_key.sign(
        payload_bytes,
        padding.PSS(
            mgf=padding.MGF1(hashes.SHA256()),
            salt_length=padding.PSS.MAX_LENGTH,
        ),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("ascii")


# ══════════════════════════════════════════════════════════════════
# 配置模板
# ══════════════════════════════════════════════════════════════════

def default_config() -> dict:
    today = date.today()
    return {
        "customer_name": "客户公司全称",
        "customer_id": f"CUST-{today.strftime('%Y%m%d')}-001",
        "software_name": "企业AI知识库",
        "software_version": "1.0.0",
        "license_type": "enterprise",          # trial（试用）/ standard（标准）/ enterprise（企业）
        "issue_date": today.isoformat(),
        "expire_date": (today + timedelta(days=365)).isoformat(),
        "max_users": 50,
        "hardware_fingerprint": "any",         # "any" = 不绑定机器；从 hardware_info.json 中填入具体值
        "features": [
            "rag",
            "open_api",
            "analytics",
            "social",
            "watch_dirs",
            "approval",
        ],
        "issued_by": "上海四九信息科技有限公司",
        "contact_email": "license@fournine.com",
        "notes": "",
    }


# ══════════════════════════════════════════════════════════════════
# CLI
# ══════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="企业AI知识库 License 签发工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--config", "-c", metavar="FILE",
                        help="客户授权配置文件（JSON）")
    parser.add_argument("--hardware", metavar="FILE",
                        help="客户发来的硬件信息文件（hardware_info_xxx.json），自动填充指纹")
    parser.add_argument("--output", "-o", metavar="FILE", default="license.json",
                        help="输出授权文件路径（默认：license.json）")
    parser.add_argument("--keys-dir", metavar="DIR", default="keys",
                        help="密钥目录（默认：keys/）")
    parser.add_argument("--keygen", action="store_true",
                        help="生成新的 RSA 密钥对（慎用：会使所有已签发 license 失效）")
    parser.add_argument("--new-config", metavar="FILE",
                        help="生成一份新的配置模板文件后退出")
    args = parser.parse_args()

    print("\n=== 企业AI知识库 License 签发工具 ===\n")

    # ── 生成配置模板 ──────────────────────────────────────────────
    if args.new_config:
        path = Path(args.new_config)
        if path.exists():
            log.error("文件已存在：%s", path)
            sys.exit(1)
        path.write_text(
            json.dumps(default_config(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        log.info("  [+] 配置模板已生成：%s", path.resolve())
        log.info("      请填写客户信息后运行：")
        log.info("      python gen_license.py --config %s --hardware hardware_info_xxx.json", args.new_config)
        return

    # ── 密钥 ─────────────────────────────────────────────────────
    keys_dir = Path(args.keys_dir)
    priv_path = keys_dir / "private.pem"

    if args.keygen:
        private_key = generate_key_pair(keys_dir)
    elif not priv_path.exists():
        log.error("私钥不存在，请先运行：python gen_license.py --keygen")
        sys.exit(1)
    else:
        log.info("  [i] 使用已有私钥：%s", priv_path.resolve())
        private_key = load_private_key(priv_path)

    # ── 加载客户配置 ──────────────────────────────────────────────
    if not args.config:
        log.error("请指定配置文件：--config customer.json")
        log.error("（使用 --new-config customer.json 生成模板）")
        sys.exit(1)

    config_path = Path(args.config)
    if not config_path.exists():
        log.error("配置文件不存在：%s", config_path)
        sys.exit(1)

    config: dict = json.loads(config_path.read_text(encoding="utf-8"))
    log.info("  [i] 加载配置：%s", config_path.resolve())

    # ── 从 hardware_info.json 填入硬件指纹 ───────────────────────
    if args.hardware:
        hw_path = Path(args.hardware)
        if not hw_path.exists():
            log.error("硬件信息文件不存在：%s", hw_path)
            sys.exit(1)
        hw_data: dict = json.loads(hw_path.read_text(encoding="utf-8"))
        fingerprint = hw_data.get("hardware_fingerprint", "")
        if not fingerprint:
            log.error("硬件信息文件中未找到 hardware_fingerprint 字段")
            sys.exit(1)
        config["hardware_fingerprint"] = fingerprint
        # 记录一下是哪台机器的信息
        si = hw_data.get("system_info", {})
        log.info("  [+] 已从硬件信息文件填入指纹")
        log.info("      来源机器: %s (%s %s)", si.get("hostname", "?"), si.get("os", "?"), si.get("os_release", "?"))
        log.info("      指纹前16位: %s...", fingerprint[:16])

    # ── 签名 ─────────────────────────────────────────────────────
    log.info("  [i] 正在签名...")
    signature = sign_license(config, private_key)
    license_data = {**config, "signature": signature}

    # ── 输出 ─────────────────────────────────────────────────────
    output_path = Path(args.output)
    output_path.write_text(
        json.dumps(license_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # ── 摘要 ─────────────────────────────────────────────────────
    hw = config.get("hardware_fingerprint", "any")
    bound = hw.lower() != "any"

    print()
    print("=" * 60)
    print("  授权文件签发成功")
    print("=" * 60)
    print(f"  输出文件:   {output_path.resolve()}")
    print()
    print("  授权摘要:")
    print(f"    客户名称:   {config.get('customer_name')}")
    print(f"    客户编号:   {config.get('customer_id')}")
    print(f"    软件版本:   {config.get('software_name')} v{config.get('software_version')}")
    print(f"    授权类型:   {config.get('license_type')}")
    print(f"    签发日期:   {config.get('issue_date')}")
    print(f"    到期日期:   {config.get('expire_date')}")
    print(f"    最大用户:   {config.get('max_users')} 人")
    print(f"    硬件绑定:   {'是（' + hw[:16] + '...）' if bound else '否（任意机器）'}")
    print(f"    授权功能:   {', '.join(config.get('features', []))}")
    print()
    print("  发送给客户:")
    print(f"    ✓  {output_path.resolve()}")
    print(f"       → 客户放到 backend/ 根目录后重启服务生效")
    print()


if __name__ == "__main__":
    main()
