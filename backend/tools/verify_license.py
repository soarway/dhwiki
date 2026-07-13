#!/usr/bin/env python3
"""
企业AI知识库 — License 验证工具（在您本机运行）
=================================================
签发后用来自检，确认 license 文件签名正确、内容可读。

用法：
  python verify_license.py license.json
  python verify_license.py license.json --public-key keys/public.pem
  python verify_license.py license.json --hardware hardware_info_xxx.json  # 同时校验硬件指纹
"""

import argparse
import base64
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.exceptions import InvalidSignature
except ImportError:
    print("缺少依赖：pip install cryptography")
    sys.exit(1)


def verify_signature(license_data: dict, pub_key) -> bool:
    try:
        sig = base64.b64decode(license_data.get("signature", ""))
        payload = {k: v for k, v in license_data.items() if k != "signature"}
        payload_bytes = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
        pub_key.verify(
            sig,
            payload_bytes,
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=padding.PSS.MAX_LENGTH,
            ),
            hashes.SHA256(),
        )
        return True
    except (InvalidSignature, Exception):
        return False


def check(label: str, ok: bool, detail: str = "") -> bool:
    icon = "  ✓" if ok else "  ✗"
    suffix = f"  ({detail})" if detail else ""
    print(f"{icon}  {label}{suffix}")
    return ok


def main():
    parser = argparse.ArgumentParser(description="企业AI知识库 License 验证工具")
    parser.add_argument("license", metavar="license.json", help="待验证的授权文件")
    parser.add_argument("--public-key", metavar="FILE", default=None,
                        help="RSA 公钥文件（默认：keys/public.pem）")
    parser.add_argument("--hardware", metavar="FILE", default=None,
                        help="客户硬件信息文件，用于验证硬件指纹是否匹配")
    args = parser.parse_args()

    print("\n=== 企业AI知识库 License 验证工具 ===\n")

    all_ok = True

    # ── 1. 加载 license ──────────────────────────────────────────
    lic_path = Path(args.license)
    if not check("授权文件存在", lic_path.exists(), str(lic_path)):
        sys.exit(1)

    try:
        license_data = json.loads(lic_path.read_text(encoding="utf-8"))
        check("授权文件格式正确（合法 JSON）", True)
    except Exception as e:
        check("授权文件格式正确（合法 JSON）", False, str(e))
        sys.exit(1)

    # ── 2. 加载公钥 ──────────────────────────────────────────────
    pub_key_path = Path(args.public_key) if args.public_key else Path(__file__).parent / "keys" / "public.pem"
    if not check("公钥文件存在", pub_key_path.exists(), str(pub_key_path)):
        sys.exit(1)

    try:
        pub_key = serialization.load_pem_public_key(pub_key_path.read_bytes())
        check("公钥文件格式正确", True)
    except Exception as e:
        check("公钥文件格式正确", False, str(e))
        sys.exit(1)

    # ── 3. 验证签名 ──────────────────────────────────────────────
    sig_ok = verify_signature(license_data, pub_key)
    all_ok &= check("RSA-PSS 签名验证", sig_ok)

    if not sig_ok:
        print("\n  签名验证失败，license 文件可能被篡改或使用了不同的私钥签发。")
        sys.exit(1)

    # ── 4. 字段完整性 ────────────────────────────────────────────
    required_fields = [
        "customer_name", "customer_id", "software_name", "software_version",
        "license_type", "issue_date", "expire_date", "max_users",
        "hardware_fingerprint", "features", "signature",
    ]
    missing = [f for f in required_fields if f not in license_data]
    all_ok &= check(
        "必要字段完整",
        len(missing) == 0,
        f"缺少：{', '.join(missing)}" if missing else "",
    )

    # ── 5. 到期日期格式 ──────────────────────────────────────────
    expire_str = license_data.get("expire_date", "")
    try:
        expire_dt = datetime.strptime(expire_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        date_ok = True
    except ValueError:
        expire_dt = None
        date_ok = False
    all_ok &= check("到期日期格式（YYYY-MM-DD）", date_ok, expire_str)

    # ── 6. 有效期状态 ────────────────────────────────────────────
    if expire_dt:
        now = datetime.now(timezone.utc)
        days_left = (expire_dt - now).days
        if days_left < 0:
            all_ok &= check("授权未过期", False, f"已于 {expire_str} 过期（{-days_left} 天前）")
        elif days_left <= 30:
            # 警告但不失败（即将到期）
            check("授权未过期", True, f"注意：还有 {days_left} 天到期！")
        else:
            check("授权未过期", True, f"剩余 {days_left} 天")

    # ── 7. 硬件指纹核对（可选） ───────────────────────────────────
    expected_fp = license_data.get("hardware_fingerprint", "any")
    if args.hardware:
        hw_path = Path(args.hardware)
        if hw_path.exists():
            hw_data = json.loads(hw_path.read_text(encoding="utf-8"))
            actual_fp = hw_data.get("hardware_fingerprint", "")
            if expected_fp.lower() == "any":
                check("硬件指纹", True, "不绑定机器（any）")
            else:
                match = actual_fp == expected_fp
                all_ok &= check(
                    "硬件指纹与客户机器匹配",
                    match,
                    f"期望 {expected_fp[:16]}... | 实际 {actual_fp[:16]}...",
                )
        else:
            print(f"  -  硬件信息文件不存在：{hw_path}（跳过指纹核对）")
    else:
        if expected_fp.lower() == "any":
            check("硬件指纹", True, "不绑定机器（any）")
        else:
            check("硬件指纹已配置", True, f"{expected_fp[:16]}...")

    # ── 汇总 ─────────────────────────────────────────────────────
    print()
    print("  ┌───────────────────────────────────┐")
    if all_ok:
        print("  │  ✓  授权文件验证通过，可发给客户  │")
    else:
        print("  │  ✗  授权文件验证未通过，请检查    │")
    print("  └───────────────────────────────────┘")

    # ── 内容摘要 ─────────────────────────────────────────────────
    print()
    print("  内容摘要:")
    print(f"    客户名称:   {license_data.get('customer_name')}")
    print(f"    客户编号:   {license_data.get('customer_id')}")
    print(f"    软件版本:   {license_data.get('software_name')} v{license_data.get('software_version')}")
    print(f"    授权类型:   {license_data.get('license_type')}")
    print(f"    签发日期:   {license_data.get('issue_date')}")
    print(f"    到期日期:   {license_data.get('expire_date')}")
    print(f"    最大用户:   {license_data.get('max_users')}")
    hw = license_data.get("hardware_fingerprint", "any")
    print(f"    硬件绑定:   {'是（' + hw[:16] + '...）' if hw.lower() != 'any' else '否（任意机器）'}")
    print(f"    授权功能:   {', '.join(license_data.get('features', []))}")
    print()

    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
