import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import (
    verify_password, get_password_hash, create_access_token, create_refresh_token, decode_refresh_token
)
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, UserInfo, ChangePasswordRequest, UpdateAvatarRequest, LicenseInfo
from app.services.permission_service import get_user_context
from app.api.captcha import verify_captcha_token
from app.crud.kb_permission import get_setting_value

logger = logging.getLogger(__name__)
router = APIRouter()


def _get_license_info() -> LicenseInfo | None:
    """
    获取 License 状态并封装为响应体。

    - 如果 license.json 和 license_public.pem 均不存在，视为开发/测试模式，返回 None
    - 否则执行完整校验（Redis 缓存，每天仅第一次登录耗时）
    """
    from pathlib import Path
    from app.services.license.validator import (
        LICENSE_FILE, PUBLIC_KEY_FILE, get_license_status_cached
    )

    # 两者均不存在 → 未部署授权文件，开发模式，跳过校验
    pub_key_is_placeholder = (
        PUBLIC_KEY_FILE.exists()
        and PUBLIC_KEY_FILE.read_text(encoding="utf-8", errors="ignore").startswith("#")
    )
    if not LICENSE_FILE.exists() and (not PUBLIC_KEY_FILE.exists() or pub_key_is_placeholder):
        return None

    try:
        lic = get_license_status_cached(timeout=5.0)
        return LicenseInfo(
            valid=lic.valid,
            expired=lic.expired,
            days_left=lic.days_left,
            expire_date=lic.expire_date,
            customer_name=lic.customer_name,
            max_users=lic.max_users,
            warn=lic.warn,
            message=lic.message,
            time_source=lic.time_source,
        )
    except Exception as e:
        logger.error("License 校验异常: %s", e, exc_info=True)
        return LicenseInfo(
            valid=False, expired=True, days_left=0,
            expire_date="N/A", customer_name="未知", max_users=0,
            warn=True,
            message=f"授权校验异常：{e}，请联系服务商",
            time_source="error",
        )


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    # 1. 验证码校验
    captcha_enabled = get_setting_value(db, "captcha_enabled", "true") == "true"
    if captcha_enabled:
        if not request.captcha_token or not request.captcha_code:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="请输入验证码")
        if not verify_captcha_token(request.captcha_token, request.captcha_code):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="验证码错误或已过期")

    # 2. 用户名/密码校验
    user = db.query(User).filter(User.username == request.username).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    if not user.status:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号已被禁用",
        )
    if user.is_frozen:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已被冻结，请联系管理员",
        )

    # 3. License 校验（每天首次登录触发，后续读 Redis 缓存，不阻塞登录体验）
    license_info = _get_license_info()

    if license_info is not None and license_info.expired:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=license_info.message,
        )

    # 4. 读取会话超时配置（单位：小时）
    raw_hours = get_setting_value(db, "session_expire_hours", "8")
    try:
        expire_hours = max(1, min(int(raw_hours), 720))  # 限制在 1~720 小时之间
    except (ValueError, TypeError):
        expire_hours = 8

    # 5. 更新登录时间并签发 Token
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    ctx = get_user_context(db, user)
    return TokenResponse(
        access_token=create_access_token(
            user.username,
            is_super_admin=ctx["is_super_admin"],
            expire_minutes=expire_hours * 60,
        ),
        refresh_token=create_refresh_token(user.username),
        license_info=license_info,
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(request: RefreshRequest, db: Session = Depends(get_db)):
    username = decode_refresh_token(request.refresh_token)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的刷新令牌"
        )
    user = db.query(User).filter(User.username == username, User.status == True).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在"
        )
    return TokenResponse(
        access_token=create_access_token(username),
        refresh_token=create_refresh_token(username),
    )


@router.post("/change-password", status_code=204)
def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(request.old_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="原密码错误")
    current_user.password_hash = get_password_hash(request.new_password)
    db.commit()


@router.put("/me/avatar", status_code=204)
def update_avatar(
    request: UpdateAvatarRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.avatar = request.avatar
    db.commit()


@router.get("/me", response_model=UserInfo)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    import json
    ctx = get_user_context(db, current_user)
    # Merge menu_permissions from all roles the user belongs to
    perm_set: set[str] = set()
    for ur in current_user.roles:
        if ur.role and ur.role.menu_permissions:
            try:
                keys = json.loads(ur.role.menu_permissions)
                if isinstance(keys, list):
                    perm_set.update(keys)
            except Exception:
                pass
    return {
        "id": current_user.id,
        "username": current_user.username,
        "real_name": current_user.real_name,
        "email": current_user.email,
        "avatar": current_user.avatar,
        "is_super_admin": ctx["is_super_admin"],
        "menu_permissions": list(perm_set),
    }
