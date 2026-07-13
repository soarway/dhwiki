from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class LikeResponse(BaseModel):
    id: int
    file_id: int
    user_id: int
    created_at: datetime
    model_config = {"from_attributes": True}


class FavoriteResponse(BaseModel):
    id: int
    file_id: int
    user_id: int
    created_at: datetime
    model_config = {"from_attributes": True}


class CommentCreate(BaseModel):
    file_id: int
    content: str
    parent_id: Optional[int] = None


class CommentUpdate(BaseModel):
    content: str


class CommentResponse(BaseModel):
    id: int
    file_id: int
    user_id: int
    parent_id: Optional[int]
    content: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class AccessLogResponse(BaseModel):
    id: int
    file_id: int
    user_id: int
    accessed_at: datetime
    model_config = {"from_attributes": True}


class ShareCreate(BaseModel):
    file_id: int
    expires_at: Optional[datetime] = None
    share_type: str = 'time'          # 'time' | 'password'
    share_password: Optional[str] = None


class ShareResponse(BaseModel):
    id: int
    file_id: int
    shared_by: int
    share_token: str
    share_type: str
    expires_at: Optional[datetime]
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class SharePublicInfo(BaseModel):
    """Public-safe share info returned without authentication."""
    share_token: str
    share_type: str
    file_id: int
    file_name: str
    file_type: str
    file_size: int
    expires_at: Optional[datetime]


class UserBrief(BaseModel):
    id: int
    username: str
    real_name: str


class FileStatsResponse(BaseModel):
    like_count: int
    favorite_count: int
    comment_count: int
    share_count: int
    liked_users: list[UserBrief]
    favorited_users: list[UserBrief]


class TagCreate(BaseModel):
    name: str


class TagResponse(BaseModel):
    id: int
    file_id: int
    name: str
    created_by: int
    created_at: datetime
    model_config = {"from_attributes": True}
