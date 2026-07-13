#!/usr/bin/env python3
"""
企业AI知识库 — 硬件信息采集工具
====================================
【客户执行】将此脚本发送给客户，在目标服务器上执行：

    python get_hardware_info.py

执行后会：
  1. 在屏幕打印硬件摘要和硬件指纹
  2. 在同目录生成 hardware_info_<主机名>_<日期>.json

客户将生成的 JSON 文件发回给您，即可为其签发 license。

无需安装任何第三方库，仅使用 Python 标准库（Python 3.6+）。
"""

import hashlib
import json
import os
import platform
import socket
import struct
import subprocess
import sys
import uuid
from datetime import date
from pathlib import Path


# ══════════════════════════════════════════════════════════════════
# 硬件信息采集
# （指纹算法必须与 app/services/license/hardware.py 保持完全一致）
# ══════════════════════════════════════════════════════════════════

def _get_machine_id() -> str:
    """获取平台级唯一机器标识。"""
    system = platform.system()

    if system == "Linux":
        for path in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
            try:
                with open(path) as f:
                    v = f.read().strip()
                if v:
                    return v
            except OSError:
                pass

    elif system == "Windows":
        # 方法1：wmic
        try:
            r = subprocess.run(
                ["wmic", "csproduct", "get", "uuid"],
                capture_output=True, text=True, timeout=5,
            )
            lines = [l.strip() for l in r.stdout.splitlines() if l.strip()]
            if len(lines) >= 2 and lines[1].upper() not in ("UUID", "NONE", ""):
                return lines[1]
        except Exception:
            pass
        # 方法2：注册表 MachineGuid
        try:
            import winreg
            k = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Cryptography",
            )
            v, _ = winreg.QueryValueEx(k, "MachineGuid")
            winreg.CloseKey(k)
            if v:
                return v
        except Exception:
            pass

    elif system == "Darwin":
        try:
            r = subprocess.run(
                ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                capture_output=True, text=True, timeout=5,
            )
            for line in r.stdout.splitlines():
                if "IOPlatformUUID" in line:
                    parts = line.split('"')
                    if len(parts) >= 4:
                        return parts[-2]
        except Exception:
            pass

    return ""


def _get_mac_address() -> str:
    """获取主要网卡 MAC 地址（排除全零和全F）。"""
    mac_int = uuid.getnode()
    if mac_int in (0, 2**48 - 1):
        return ""
    return ":".join(f"{(mac_int >> (8 * i)) & 0xFF:02x}" for i in range(5, -1, -1))


def get_hardware_fingerprint() -> str:
    """
    计算硬件指纹（与后端 hardware.py 算法完全一致）：
    machine-id + MAC + hostname → SHA-256 hex digest
    """
    parts: list = []

    mid = _get_machine_id()
    if mid:
        parts.append(f"mid:{mid}")

    mac = _get_mac_address()
    if mac:
        parts.append(f"mac:{mac}")

    hostname = socket.gethostname()
    if hostname:
        parts.append(f"host:{hostname}")

    if not parts:
        parts.append(f"node:{uuid.getnode()}")

    combined = "|".join(parts)
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


def _get_cpu_info() -> str:
    """获取 CPU 型号（仅供参考，不参与指纹计算）。"""
    system = platform.system()
    if system == "Linux":
        try:
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if line.startswith("model name"):
                        return line.split(":", 1)[1].strip()
        except Exception:
            pass
    elif system == "Windows":
        try:
            r = subprocess.run(
                ["wmic", "cpu", "get", "name"],
                capture_output=True, text=True, timeout=5,
            )
            lines = [l.strip() for l in r.stdout.splitlines() if l.strip()]
            if len(lines) >= 2:
                return lines[1]
        except Exception:
            pass
    elif system == "Darwin":
        try:
            r = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True, timeout=5,
            )
            return r.stdout.strip()
        except Exception:
            pass
    return platform.processor() or "未知"


def _get_memory_gb() -> str:
    """获取物理内存大小（GB）。"""
    system = platform.system()
    try:
        if system == "Linux":
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        kb = int(line.split()[1])
                        return f"{kb / 1024 / 1024:.1f} GB"
        elif system == "Windows":
            r = subprocess.run(
                ["wmic", "computersystem", "get", "totalphysicalmemory"],
                capture_output=True, text=True, timeout=5,
            )
            lines = [l.strip() for l in r.stdout.splitlines() if l.strip()]
            if len(lines) >= 2:
                bytes_ = int(lines[1])
                return f"{bytes_ / 1024**3:.1f} GB"
        elif system == "Darwin":
            r = subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True, text=True, timeout=5,
            )
            bytes_ = int(r.stdout.strip())
            return f"{bytes_ / 1024**3:.1f} GB"
    except Exception:
        pass
    return "未知"


def _get_disk_info() -> str:
    """获取根分区/系统盘总容量。"""
    try:
        import shutil
        path = "C:\\" if platform.system() == "Windows" else "/"
        total, _, _ = shutil.disk_usage(path)
        return f"{total / 1024**3:.0f} GB"
    except Exception:
        return "未知"


def _get_ip_addresses() -> list:
    """获取所有非回环 IP 地址。"""
    ips = []
    try:
        hostname = socket.gethostname()
        infos = socket.getaddrinfo(hostname, None)
        seen = set()
        for info in infos:
            ip = info[4][0]
            if ip not in seen and not ip.startswith("127.") and ip != "::1":
                ips.append(ip)
                seen.add(ip)
    except Exception:
        pass
    if not ips:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ips.append(s.getsockname()[0])
            s.close()
        except Exception:
            pass
    return ips


def _get_cpu_count() -> str:
    try:
        return str(os.cpu_count() or "未知")
    except Exception:
        return "未知"


# ══════════════════════════════════════════════════════════════════
# 主流程
# ══════════════════════════════════════════════════════════════════

def collect_all() -> dict:
    """采集全量硬件信息，返回字典。"""
    machine_id = _get_machine_id()
    mac = _get_mac_address()
    hostname = socket.gethostname()
    fingerprint = get_hardware_fingerprint()

    return {
        # ── 指纹原始分量（供排查问题用） ──
        "fingerprint_components": {
            "machine_id": machine_id or "(未能获取)",
            "mac_address": mac or "(未能获取)",
            "hostname": hostname,
        },
        # ── 硬件指纹（填入授权配置的 hardware_fingerprint 字段） ──
        "hardware_fingerprint": fingerprint,
        # ── 参考信息（不参与指纹，仅供你了解客户环境） ──
        "system_info": {
            "os": platform.system(),
            "os_version": platform.version(),
            "os_release": platform.release(),
            "architecture": platform.machine(),
            "python_version": platform.python_version(),
            "hostname": hostname,
            "ip_addresses": _get_ip_addresses(),
            "cpu_model": _get_cpu_info(),
            "cpu_cores": _get_cpu_count(),
            "memory": _get_memory_gb(),
            "disk": _get_disk_info(),
        },
        "collected_at": date.today().isoformat(),
    }


def main():
    print()
    print("=" * 60)
    print("  企业AI知识库 — 硬件信息采集工具")
    print("=" * 60)
    print("  正在采集硬件信息，请稍候...")
    print()

    info = collect_all()
    fp = info["hardware_fingerprint"]
    comp = info["fingerprint_components"]
    sys_info = info["system_info"]

    # ── 屏幕输出 ──────────────────────────────────────────────────
    print("  【系统信息】")
    print(f"    主机名:       {sys_info['hostname']}")
    print(f"    操作系统:     {sys_info['os']} {sys_info['os_release']}")
    print(f"    架构:         {sys_info['architecture']}")
    print(f"    CPU:          {sys_info['cpu_model']}")
    print(f"    CPU 核数:     {sys_info['cpu_cores']}")
    print(f"    内存:         {sys_info['memory']}")
    print(f"    系统盘:       {sys_info['disk']}")
    print(f"    IP 地址:      {', '.join(sys_info['ip_addresses']) or '未知'}")
    print()
    print("  【指纹原始分量】")
    print(f"    Machine ID:   {comp['machine_id']}")
    print(f"    MAC 地址:     {comp['mac_address']}")
    print(f"    主机名:       {comp['hostname']}")
    print()
    print("  ┌─────────────────────────────────────────────────────┐")
    print(f"  │  硬件指纹（发给服务商）：                           │")
    print(f"  │  {fp}  │")
    print("  └─────────────────────────────────────────────────────┘")
    print()

    # ── 写出 JSON 文件 ────────────────────────────────────────────
    output_filename = f"hardware_info_{sys_info['hostname']}_{date.today().isoformat()}.json"
    output_path = Path(__file__).parent / output_filename

    # 如果脚本在一个不可写目录（比如只读挂载），降级写到当前工作目录
    try:
        output_path.write_text(
            json.dumps(info, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError:
        output_path = Path.cwd() / output_filename
        output_path.write_text(
            json.dumps(info, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    print(f"  已保存到文件：{output_path}")
    print()
    print("  请将上述文件发送给服务商，用于生成您的专属授权文件。")
    print()


if __name__ == "__main__":
    main()
