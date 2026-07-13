from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class RoleCreate(BaseModel):
    name: str
    code: str = ""
    description: Optional[str] = ""


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None


class RoleMenuPermissionsUpdate(BaseModel):
    menu_permissions: Optional[str] = None  # JSON string of selected permission keys


class RoleResponse(BaseModel):
    id: int
    name: str
    code: str
    description: str
    is_system: bool
    created_at: datetime
    menu_permissions: Optional[str] = None

    model_config = {"from_attributes": True}
