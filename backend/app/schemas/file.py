from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class WatchDirectoryCreate(BaseModel):
    name: str
    fs_path: str
    description: Optional[str] = ""
    require_approval: bool = False
    kb_id: Optional[int] = None


class WatchDirectoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    require_approval: Optional[bool] = None


class WatchDirectoryResponse(BaseModel):
    id: int
    name: str
    fs_path: str
    description: str
    is_active: bool
    require_approval: bool
    kb_id: Optional[int]
    last_scan_at: Optional[datetime]
    scan_total: int
    scan_done: int
    scan_failed: int
    created_at: datetime

    model_config = {"from_attributes": True}


class FolderResponse(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    fs_path: str
    created_at: datetime

    model_config = {"from_attributes": True}


class FileResponse(BaseModel):
    id: int
    name: str
    folder_id: Optional[int]
    fs_path: str
    file_type: str
    file_size: int
    process_status: str
    process_error: Optional[str]
    chunk_count: int
    uploaded_by: Optional[int]
    uploader_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FileListResponse(BaseModel):
    items: list[FileResponse]
    total: int


class FileSearchResult(BaseModel):
    id: int
    name: str
    file_type: str
    file_size: int
    process_status: str
    created_at: datetime
    kb_id: Optional[int]
    kb_name: Optional[str]
    uploader_name: Optional[str]


class FileSearchResponse(BaseModel):
    items: list[FileSearchResult]
    total: int
