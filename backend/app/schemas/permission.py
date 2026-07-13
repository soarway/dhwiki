# backend/app/schemas/permission.py
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.permission import PermissionLevel, ResourceType, SubjectType


class PermissionCreate(BaseModel):
    resource_type: ResourceType
    resource_id: int
    subject_type: SubjectType
    subject_id: int
    permission_level: PermissionLevel


class PermissionResponse(BaseModel):
    id: int
    resource_type: ResourceType
    resource_id: int
    subject_type: SubjectType
    subject_id: int
    permission_level: PermissionLevel
    created_by: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}
