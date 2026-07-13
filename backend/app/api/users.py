from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_super_admin, get_current_user
from app.crud import user as crud
from app.schemas.user import (
    UserCreate, UserUpdate, UserStatusUpdate, UserFreezeUpdate, UserResponse, UserListResponse
)
from app.models.user import User
from app.crud.department import get_department

router = APIRouter()


@router.get("", response_model=UserListResponse)
@router.get("/", response_model=UserListResponse, include_in_schema=False)
def list_users(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    items, total = crud.get_users(db, skip, limit)
    return UserListResponse(items=items, total=total)


@router.post("", response_model=UserResponse, status_code=201)
@router.post("/", response_model=UserResponse, status_code=201, include_in_schema=False)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    if crud.get_user_by_username(db, data.username):
        raise HTTPException(status_code=400, detail="用户名已存在")
    if crud.get_user_by_email(db, data.email):
        raise HTTPException(status_code=400, detail="邮箱已存在")
    return crud.create_user(db, data)


@router.get("/selectable", response_model=UserListResponse)
def list_selectable_users(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """返回全量用户列表，供权限设置对话框使用，任意登录用户可调用。"""
    items, total = crud.get_users(db, skip=0, limit=10000)
    return UserListResponse(items=items, total=total)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return crud.update_user(db, user, data)


@router.patch("/{user_id}/status", response_model=UserResponse)
def update_user_status(
    user_id: int,
    data: UserStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return crud.update_user_status(db, user, data.status)


@router.put("/{user_id}/freeze", response_model=UserResponse)
def freeze_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return crud.update_user_frozen(db, user, True)


@router.put("/{user_id}/unfreeze", response_model=UserResponse)
def unfreeze_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return crud.update_user_frozen(db, user, False)


@router.post("/{user_id}/departments/{dept_id}", status_code=204)
def assign_department(
    user_id: int,
    dept_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="用户不存在")
    if not get_department(db, dept_id):
        raise HTTPException(status_code=404, detail="部门不存在")
    crud.assign_user_to_department(db, user_id, dept_id)


@router.delete("/{user_id}/departments/{dept_id}", status_code=204)
def remove_department(
    user_id: int,
    dept_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    crud.remove_user_from_department(db, user_id, dept_id)
