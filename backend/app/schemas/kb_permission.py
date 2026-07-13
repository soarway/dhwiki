from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel


class KbPermissionCreate(BaseModel):
    kb_id: int
    subject_type: Literal["user", "role"]
    subject_id: int
    permission: Literal["read", "write", "admin"] = "read"


class KbPermissionResponse(BaseModel):
    id: int
    kb_id: int
    subject_type: str
    subject_id: int
    permission: str
    created_at: datetime
    model_config = {"from_attributes": True}


class FilePermissionCreate(BaseModel):
    file_id: int
    subject_type: Literal["user", "role"]
    subject_id: int
    permission: Literal["read", "write"] = "read"


class FilePermissionResponse(BaseModel):
    id: int
    file_id: int
    subject_type: str
    subject_id: int
    permission: str
    created_at: datetime
    model_config = {"from_attributes": True}


class UserKbPermResponse(BaseModel):
    perm_id: int
    user_id: int
    username: str
    real_name: str
    permission: str


class BatchUserPermUpdate(BaseModel):
    user_ids: list[int]
    permission: str = "read"


class SystemSettingUpdate(BaseModel):
    value: Optional[str] = None


class SystemSettingResponse(BaseModel):
    id: int
    key: str
    value: Optional[str]
    description: Optional[str]
    updated_at: datetime
    model_config = {"from_attributes": True}
