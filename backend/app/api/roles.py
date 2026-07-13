from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_super_admin
from app.crud import role as crud
from app.schemas.role import RoleCreate, RoleUpdate, RoleResponse, RoleMenuPermissionsUpdate
from app.schemas.user import UserResponse
from app.models.user import User

router = APIRouter()


@router.get("", response_model=list[RoleResponse])
@router.get("/", response_model=list[RoleResponse], include_in_schema=False)
def list_roles(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    return crud.get_roles(db)


@router.post("", response_model=RoleResponse, status_code=201)
@router.post("/", response_model=RoleResponse, status_code=201, include_in_schema=False)
def create_role(
    data: RoleCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    return crud.create_role(db, data)


@router.put("/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: int,
    data: RoleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    role = crud.get_role(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    return crud.update_role(db, role, data)


@router.put("/{role_id}/menu-permissions", response_model=RoleResponse)
def save_menu_permissions(
    role_id: int,
    data: RoleMenuPermissionsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    role = crud.get_role(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    return crud.save_menu_permissions(db, role, data.menu_permissions or "[]")


@router.get("/{role_id}/users", response_model=list[UserResponse])
def get_role_users(
    role_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    role = crud.get_role(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    return crud.get_role_users(db, role_id)


@router.post("/{role_id}/users/{user_id}", status_code=204)
def assign_user_to_role(
    role_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    role = crud.get_role(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    crud.assign_user_to_role(db, role_id, user_id)


@router.delete("/{role_id}/users/{user_id}", status_code=204)
def remove_user_from_role(
    role_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    crud.remove_user_from_role(db, role_id, user_id)


@router.delete("/{role_id}", status_code=204)
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    role = crud.get_role(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    if role.is_system:
        raise HTTPException(status_code=400, detail="系统内置角色不可删除")
    crud.delete_role(db, role)
