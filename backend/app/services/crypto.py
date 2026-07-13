# backend/app/services/crypto.py
"""
文件加密存储模块。
算法：AES-256-GCM（文件内容）+ AES-256-GCM（密钥信封，用主密钥包裹文件密钥）。

.enc 文件格式（大端字节序）：
  [4 bytes]  Magic       = b'KBEF'
  [2 bytes]  Version     = 0x0001
  [12 bytes] Content IV  （固定长度，无长度前缀）
  [2 bytes]  Key Envelope Length
  [N bytes]  Key Envelope = key_wrap_iv(12) + AESGCM(master_key).encrypt(file_key)(48)
  [2 bytes]  Filename Length
  [M bytes]  Original Filename  (UTF-8)
  [remaining] Encrypted Content + 16-byte GCM Tag（AESGCM 自动附加）
"""
import base64
import os
import struct
import tempfile
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"KBEF"
VERSION = 1
CONTENT_IV_SIZE = 12
KEY_WRAP_IV_SIZE = 12
FILE_KEY_SIZE = 32  # AES-256


class FileEncryptor:
    def __init__(self, master_key: bytes) -> None:
        if len(master_key) != FILE_KEY_SIZE:
            raise ValueError("主密钥必须为 32 字节")
        self._master_key = master_key

    # ------------------------------------------------------------------
    # 加密
    # ------------------------------------------------------------------

    def encrypt_file(self, src_path: str, original_name: str) -> str:
        """
        将 src_path 处的明文文件加密，写入 src_path + '.enc' 并返回加密文件路径。
        调用方负责删除原始明文文件。
        """
        enc_path = src_path + ".enc"

        file_key = os.urandom(FILE_KEY_SIZE)
        content_iv = os.urandom(CONTENT_IV_SIZE)
        key_wrap_iv = os.urandom(KEY_WRAP_IV_SIZE)

        try:
            with open(src_path, "rb") as f:
                plaintext = f.read()

            # 加密文件内容（输出 = 密文 + 16字节 GCM Tag）
            encrypted_content = AESGCM(file_key).encrypt(content_iv, plaintext, None)

            # 用主密钥包裹文件密钥（输出 = 加密文件密钥32字节 + 16字节 GCM Tag = 48字节）
            wrapped_key = AESGCM(self._master_key).encrypt(key_wrap_iv, file_key, None)
            key_envelope = key_wrap_iv + wrapped_key  # 12 + 48 = 60 bytes

            filename_bytes = original_name.encode("utf-8")

            header = (
                struct.pack(">4sH", MAGIC, VERSION)  # 6 bytes
                + content_iv                         # 12 bytes
                + struct.pack(">H", len(key_envelope))
                + key_envelope
                + struct.pack(">H", len(filename_bytes))
                + filename_bytes
            )

            with open(enc_path, "wb") as f:
                f.write(header)
                f.write(encrypted_content)
        finally:
            # 尽力清零内存中的文件密钥（Python 局限性：bytes 不可变，bytearray 可清零）
            key_arr = bytearray(file_key)
            for i in range(len(key_arr)):
                key_arr[i] = 0

        return enc_path

    # ------------------------------------------------------------------
    # 解密
    # ------------------------------------------------------------------

    def decrypt_to_bytes(self, enc_path: str) -> tuple[bytes, str]:
        """
        解密 .enc 文件，返回 (明文字节, 原始文件名)。
        """
        with open(enc_path, "rb") as f:
            data = f.read()

        offset = 0

        magic, version = struct.unpack_from(">4sH", data, offset)
        if magic != MAGIC:
            raise ValueError(f"不是合法的加密文件（Magic 不匹配）：{enc_path}")
        offset += 6

        content_iv = data[offset: offset + CONTENT_IV_SIZE]
        offset += CONTENT_IV_SIZE

        (key_env_len,) = struct.unpack_from(">H", data, offset)
        offset += 2
        key_envelope = data[offset: offset + key_env_len]
        offset += key_env_len

        (filename_len,) = struct.unpack_from(">H", data, offset)
        offset += 2
        original_name = data[offset: offset + filename_len].decode("utf-8")
        offset += filename_len

        encrypted_content = data[offset:]

        # 解包文件密钥
        key_wrap_iv = key_envelope[:KEY_WRAP_IV_SIZE]
        wrapped_key = key_envelope[KEY_WRAP_IV_SIZE:]
        file_key = AESGCM(self._master_key).decrypt(key_wrap_iv, wrapped_key, None)

        # 解密文件内容
        plaintext = AESGCM(file_key).decrypt(content_iv, encrypted_content, None)

        # 尽力清零文件密钥
        key_arr = bytearray(file_key)
        for i in range(len(key_arr)):
            key_arr[i] = 0

        return plaintext, original_name

    def decrypt_to_tempfile(self, enc_path: str, tmp_dir: str) -> tuple[str, str]:
        """
        解密到临时文件。返回 (临时文件路径, 原始文件名)。
        调用方必须在使用后删除临时文件。
        """
        content, original_name = self.decrypt_to_bytes(enc_path)
        suffix = Path(original_name).suffix

        os.makedirs(tmp_dir, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(suffix=suffix, dir=tmp_dir)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(content)
        except Exception:
            try:
                os.close(fd)
            except OSError:
                pass
            raise

        return tmp_path, original_name


# ------------------------------------------------------------------
# 全局单例
# ------------------------------------------------------------------

_encryptor: FileEncryptor | None = None
# 标记是否已尝试从配置加载（避免重复读取 settings）
_config_loaded: bool = False


def get_encryptor() -> FileEncryptor | None:
    """
    返回全局 FileEncryptor 实例。

    优先级：
      1. 通过 set_master_key() 在运行时注入的密钥（生产推荐）
      2. FILE_ENCRYPT_KEY 环境变量（仅用于开发/测试，不建议在生产中使用）

    未注入密钥时返回 None（加密禁用）。
    """
    global _encryptor, _config_loaded

    # 已通过 API 注入密钥，直接返回
    if _encryptor is not None:
        return _encryptor

    # 尝试从配置加载（dev 回退，仅执行一次）
    if _config_loaded:
        return None

    _config_loaded = True
    from app.core.config import settings  # 延迟导入，避免循环依赖

    key_b64 = settings.file_encrypt_key.strip()
    if not key_b64:
        return None

    try:
        key_bytes = base64.b64decode(key_b64)
    except Exception as exc:
        raise ValueError(f"FILE_ENCRYPT_KEY 不是合法的 Base64 字符串：{exc}") from exc

    if len(key_bytes) != FILE_KEY_SIZE:
        raise ValueError(
            f"FILE_ENCRYPT_KEY 解码后必须为 32 字节，当前为 {len(key_bytes)} 字节。"
        )

    _encryptor = FileEncryptor(key_bytes)
    return _encryptor


def set_master_key(key_bytes: bytes) -> None:
    """
    在运行时注入主密钥（密钥仅存于内存，服务重启后失效）。
    由 POST /internal/master-key 接口调用。
    """
    global _encryptor, _config_loaded
    if len(key_bytes) != FILE_KEY_SIZE:
        raise ValueError(
            f"主密钥必须为 32 字节，当前为 {len(key_bytes)} 字节。"
            f"生成命令：python -c \"import os,base64; print(base64.b64encode(os.urandom(32)).decode())\""
        )
    _encryptor = FileEncryptor(key_bytes)
    _config_loaded = True  # 不再读取配置，注入值优先


def is_key_loaded() -> bool:
    """返回主密钥是否已加载到内存。"""
    return _encryptor is not None
