from typing import Optional
from pydantic import BaseModel


class DepartmentCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None
    manager_user_id: Optional[int] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    manager_user_id: Optional[int] = None


class DepartmentResponse(BaseModel):
    id: int
    name: str
    parent_id: Optional[int]
    manager_user_id: Optional[int]
    manager_user_name: Optional[str] = None

    model_config = {"from_attributes": True}


class DepartmentTree(DepartmentResponse):
    children: list["DepartmentTree"] = []

    model_config = {"from_attributes": True}
