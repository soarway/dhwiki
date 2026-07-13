from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    username: str
    real_name: str
    email: EmailStr
    password: str
    gender: Optional[str] = None
    phone: Optional[str] = None


class UserUpdate(BaseModel):
    real_name: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None


class UserStatusUpdate(BaseModel):
    status: bool


class UserFreezeUpdate(BaseModel):
    is_frozen: bool


class UserResponse(BaseModel):
    id: int
    username: str
    real_name: str
    email: str
    avatar: Optional[str]
    gender: Optional[str]
    phone: Optional[str]
    status: bool
    is_frozen: bool
    auth_source: str
    last_login_at: Optional[datetime]
    created_at: datetime
    dept_names: list[str] = []
    dept_ids: list[int] = []

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
