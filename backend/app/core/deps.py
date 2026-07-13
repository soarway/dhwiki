# backend/app/core/deps.py
import time
from datetime import datetime
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)

# ── Redis 限流工具 ──────────────────────────────────────────────
def _get_redis():
    """按需创建 Redis 连接（共享模块级单例）。"""
    import redis as redis_lib
    from app.core.config import settings
    return redis_lib.from_url(settings.redis_url, decode_responses=True)

_redis_client = None

def _redis():
    global _redis_client
    if _redis_client is None:
        _redis_client = _get_redis()
    return _redis_client


def check_rate_limit(key: str, limit: int, window: int = 60) -> bool:
    """
    滑动窗口限流（Redis ZADD/ZCOUNT）。
    返回 True 表示允许，False 表示超限。
    如果 Redis 不可用则放行（fail-open）。
    """
    try:
        r = _redis()
        now = time.time()
        pipe = r.pipeline()
        pipe.zadd(key, {str(now): now})
        pipe.zremrangebyscore(key, 0, now - window)
        pipe.zcard(key)
        pipe.expire(key, window + 1)
        results = pipe.execute()
        return results[2] <= limit
    except Exception:
        return True  # Redis 不可用时放行，不影响正常服务


def get_api_key_obj(request: Request, db: Session = Depends(get_db)):
    """
    从 X-API-Key 头部提取并验证 API Key，同时执行滑动窗口限流。
    返回 ApiKey ORM 对象（含 owner_id、allowed_kb_ids 等）。
    """
    from app.models.api_key import ApiKey
    api_key_value = request.headers.get("X-API-Key")
    if not api_key_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少 X-API-Key 请求头",
        )
    key_obj = db.query(ApiKey).filter(
        ApiKey.key == api_key_value, ApiKey.is_active == True
    ).first()
    if not key_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效或已停用的 API Key",
        )
    # 滑动窗口限流
    rl_key = f"rl:apikey:{key_obj.id}"
    if not check_rate_limit(rl_key, key_obj.rate_limit_per_min):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"请求频率超限（上限 {key_obj.rate_limit_per_min} 次/分钟）",
            headers={"Retry-After": "60"},
        )
    # 更新最后使用时间
    key_obj.last_used_at = datetime.utcnow()
    db.commit()
    return key_obj


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少认证凭据",
        )
    token = credentials.credentials
    username = decode_access_token(token)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭据",
        )
    user = db.query(User).filter(User.username == username, User.status == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已被禁用",
        )
    return user


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    role_names = [ur.role.name for ur in current_user.roles]
    if "super_admin" not in role_names:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要超级管理员权限",
        )
    return current_user


def get_current_user_or_api_key(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Dual-auth dependency: accepts either:
      - Authorization: Bearer <JWT>
      - X-API-Key: <64-char key>

    Tries JWT first, then falls back to X-API-Key.
    Raises 401 if neither is valid.
    """
    # Try JWT
    if credentials is not None:
        token = credentials.credentials
        username = decode_access_token(token)
        if username:
            user = db.query(User).filter(
                User.username == username, User.status == True
            ).first()
            if user:
                return user

    # Try X-API-Key
    api_key_value = request.headers.get("X-API-Key")
    if api_key_value:
        from app.models.api_key import ApiKey
        key_obj = (
            db.query(ApiKey)
            .filter(ApiKey.key == api_key_value, ApiKey.is_active == True)
            .first()
        )
        if key_obj:
            key_obj.last_used_at = datetime.utcnow()
            db.commit()

            user = db.query(User).filter(
                User.id == key_obj.owner_id, User.status == True
            ).first()
            if user:
                return user

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭据，请提供有效的 Bearer token 或 X-API-Key",
        headers={"WWW-Authenticate": "Bearer"},
    )
