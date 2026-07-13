# backend/app/api/internal.py
"""
内部管理接口 —— 仅允许从本机（127.0.0.1 / ::1）访问。
Nginx 已在路由层屏蔽 /api/internal/ 路径，外网无法触达。

生产环境注入主密钥的标准操作：
  # 非 Docker 部署（直接在服务器上执行）：
  curl -s -X POST http://127.0.0.1:8000/internal/master-key \
       -H "Content-Type: application/json" \
       -d '{"key": "<BASE64_32字节密钥>"}'

  # Docker Compose 部署（在容器内执行，确保来源 IP 为 127.0.0.1）：
  docker exec <backend容器名> curl -s -X POST http://127.0.0.1:8000/internal/master-key \
       -H "Content-Type: application/json" \
       -d '{"key": "<BASE64_32字节密钥>"}'

生成密钥：
  python -c "import os, base64; print(base64.b64encode(os.urandom(32)).decode())"
"""
import base64
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# 允许访问此接口的来源 IP（仅本机回环地址）
_ALLOWED_HOSTS = {"127.0.0.1", "::1", "localhost"}


def _require_localhost(request: Request) -> None:
    client_ip = request.client.host if request.client else ""
    if client_ip not in _ALLOWED_HOSTS:
        logger.warning("拒绝来自 %s 的 /internal/ 请求（非本机来源）", client_ip)
        raise HTTPException(status_code=403, detail="此接口仅允许本机（127.0.0.1）访问")


class MasterKeyRequest(BaseModel):
    key: str  # Base64 编码的 32 字节主密钥


@router.post("/master-key")
def inject_master_key(request: Request, body: MasterKeyRequest):
    """
    将主密钥注入内存。密钥**不会**写入磁盘，服务重启后需重新注入。

    仅允许来自 127.0.0.1 的请求。
    """
    _require_localhost(request)

    try:
        key_bytes = base64.b64decode(body.key)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"key 不是合法的 Base64 字符串：{exc}")

    from app.services.crypto import set_master_key, FILE_KEY_SIZE

    if len(key_bytes) != FILE_KEY_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"密钥解码后必须为 32 字节，当前为 {len(key_bytes)} 字节",
        )

    set_master_key(key_bytes)
    logger.info("主密钥已成功注入内存（来源：%s）", request.client.host if request.client else "unknown")
    return {"status": "ok", "message": "主密钥已加载到内存，加密/解密功能已启用"}


@router.get("/status")
def encryption_status(request: Request):
    """
    查询加密模块状态（是否已加载主密钥）。仅允许本机访问。
    """
    _require_localhost(request)

    from app.services.crypto import is_key_loaded
    loaded = is_key_loaded()
    return {
        "encryption_enabled": loaded,
        "message": "主密钥已加载，文件加密/解密正常" if loaded else "主密钥未加载，加密文件无法解密",
    }
