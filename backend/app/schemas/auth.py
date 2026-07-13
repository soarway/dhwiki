from typing import Optional
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str
    captcha_token: str | None = None
    captcha_code: str | None = None


class LicenseInfo(BaseModel):
    """登录响应中携带的授权状态，供前端展示警告。"""
    valid: bool
    expired: bool
    days_left: int
    expire_date: str
    customer_name: str
    max_users: int
    warn: bool          # True = 需要展示警告（即将到期或已到期）
    message: str        # 展示给用户的提示文字
    time_source: str    # 时间来源（ntp:<server> / local / dns_spoofed）


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    license_info: Optional[LicenseInfo] = None  # None = 未启用授权校验（开发模式）


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class UpdateAvatarRequest(BaseModel):
    avatar: str  # base64 data URL


class UserInfo(BaseModel):
    id: int
    username: str
    real_name: str
    email: str
    avatar: str | None
    is_super_admin: bool = False
    menu_permissions: list[str] = []

    model_config = {"from_attributes": True}
