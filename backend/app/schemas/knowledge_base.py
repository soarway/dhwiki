from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class KbCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_default_visible: bool = True
    dept_id: Optional[int] = None    # 单部门模式
    dept_ids: list[int] = []         # 多部门模式（非空时优先使用）
    user_ids: list[int] = []         # 跨部门多人模式：指定成员（均获 read 权限）
    dir_tag: Optional[str] = None


class KbUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    description: Optional[str] = None
    is_default_visible: Optional[bool] = None
    dept_id: Optional[int] = None  # None = no change unless explicitly set; use "dept_id": null in JSON to clear
    dir_tag: Optional[str] = None
    sort_order: Optional[int] = None


class KbResponse(BaseModel):
    id: int
    name: str
    icon: Optional[str]
    description: Optional[str]
    is_default_visible: bool
    created_by: int
    created_at: datetime
    updated_at: datetime
    file_count: int = 0
    total_size: int = 0
    dept_id: Optional[int] = None
    dept_ids: list[int] = []
    dept_manager_user_id: Optional[int] = None
    dir_tag: Optional[str] = None
    sort_order: Optional[int] = None

    model_config = {"from_attributes": True}


class KbPermissionsUpdate(BaseModel):
    kb_type: str          # 'single' | 'multi' | 'users' | 'private'
    dept_ids: list[int] = []
    user_ids: list[int] = []


class GlobalStats(BaseModel):
    kb_count: int
    file_count: int
    total_size: int


class KbFolderCreate(BaseModel):
    kb_id: int
    name: str
    parent_id: Optional[int] = None


class KbFolderResponse(BaseModel):
    id: int
    kb_id: int
    parent_id: Optional[int]
    name: str
    created_by: int
    created_at: datetime
    is_empty: bool = True

    model_config = {"from_attributes": True}
