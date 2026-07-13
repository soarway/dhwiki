"""
硬件指纹模块
综合 machine-id / BIOS UUID / MAC 地址 / 主机名 生成 SHA-256 指纹。
跨平台支持：Linux / Windows / macOS。
"""
import hashlib
import platform
import socket
import subprocess
import uuid


def _get_machine_id() -> str:
    """获取平台唯一机器标识。"""
    system = platform.system()
    if system == "Linux":
        try:
            with open("/etc/machine-id") as f:
                value = f.read().strip()
            if value:
                return value
        except OSError:
            pass
        try:
            with open("/var/lib/dbus/machine-id") as f:
                value = f.read().strip()
            if value:
                return value
        except OSError:
            pass

    elif system == "Windows":
        try:
            result = subprocess.run(
                ["wmic", "csproduct", "get", "uuid"],
                capture_output=True, text=True, timeout=5,
            )
            lines = [l.strip() for l in result.stdout.splitlines() if l.strip()]
            # lines[0] is header "UUID", lines[1] is value
            if len(lines) >= 2 and lines[1].upper() not in ("", "UUID", "NONE"):
                return lines[1]
        except Exception:
            pass
        # Fallback: registry MachineGuid
        try:
            import winreg
            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Cryptography",
            )
            value, _ = winreg.QueryValueEx(key, "MachineGuid")
            winreg.CloseKey(key)
            if value:
                return value
        except Exception:
            pass

    elif system == "Darwin":
        try:
            result = subprocess.run(
                ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                if "IOPlatformUUID" in line:
                    parts = line.split('"')
                    if len(parts) >= 4:
                        return parts[-2]
        except Exception:
            pass

    return ""


def _get_primary_mac() -> str:
    """获取主要网卡 MAC 地址（排除 00:00:00:00:00:00 和全F地址）。"""
    mac_int = uuid.getnode()
    # uuid.getnode() returns a 48-bit integer; check if it's valid
    if mac_int == 0 or mac_int == (2**48 - 1):
        return ""
    return ":".join(f"{(mac_int >> (8 * i)) & 0xFF:02x}" for i in range(5, -1, -1))


def get_hardware_fingerprint() -> str:
    """
    计算硬件指纹：machine-id + MAC + hostname → SHA-256 hex digest。
    如果某项无法获取则跳过，保证至少有一项可用。
    """
    parts: list[str] = []

    machine_id = _get_machine_id()
    if machine_id:
        parts.append(f"mid:{machine_id}")

    mac = _get_primary_mac()
    if mac:
        parts.append(f"mac:{mac}")

    hostname = socket.gethostname()
    if hostname:
        parts.append(f"host:{hostname}")

    if not parts:
        # 最终兜底：使用 uuid.getnode() 的原始整数
        parts.append(f"node:{uuid.getnode()}")

    combined = "|".join(parts)
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()
