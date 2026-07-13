from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud import kb_permission as perm_crud
from app.models.user import User
from app.schemas.kb_permission import (
    KbPermissionCreate, KbPermissionResponse,
    FilePermissionCreate, FilePermissionResponse,
    SystemSettingUpdate, SystemSettingResponse,
    UserKbPermResponse, BatchUserPermUpdate,
)

router = APIRouter()


# ---- KB 权限 ----

@router.get("/knowledge-bases/{kb_id}/permissions", response_model=list[KbPermissionResponse])
def list_kb_permissions(
    kb_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return perm_crud.get_kb_permissions(db, kb_id)


@router.post("/knowledge-bases/{kb_id}/permissions", response_model=KbPermissionResponse, status_code=201)
def set_kb_permission(
    kb_id: int,
    body: KbPermissionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return perm_crud.set_kb_permission(db, kb_id, body.subject_type, body.subject_id, body.permission)


@router.get("/knowledge-bases/{kb_id}/user-permissions", response_model=list[UserKbPermResponse])
def list_kb_user_permissions(
    kb_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return perm_crud.get_kb_user_perms_with_details(db, kb_id)


@router.put("/knowledge-bases/{kb_id}/user-permissions", status_code=204)
def replace_kb_user_permissions(
    kb_id: int,
    body: BatchUserPermUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    perm_crud.replace_kb_user_permissions(db, kb_id, body.user_ids, body.permission)


@router.delete("/kb-permissions/{perm_id}", status_code=204)
def delete_kb_permission(
    perm_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not perm_crud.delete_kb_permission(db, perm_id):
        raise HTTPException(status_code=404, detail="权限记录不存在")


# ---- 文件权限 ----

@router.get("/files/{file_id}/permissions", response_model=list[FilePermissionResponse])
def list_file_permissions(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return perm_crud.get_file_permissions(db, file_id)


@router.post("/files/{file_id}/permissions", response_model=FilePermissionResponse, status_code=201)
def set_file_permission(
    file_id: int,
    body: FilePermissionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return perm_crud.set_file_permission(db, file_id, body.subject_type, body.subject_id, body.permission)


@router.delete("/file-permissions/{perm_id}", status_code=204)
def delete_file_permission(
    perm_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not perm_crud.delete_file_permission(db, perm_id):
        raise HTTPException(status_code=404, detail="权限记录不存在")


# ---- 系统设置 ----

@router.get("/public-settings")
def get_public_settings(db: Session = Depends(get_db)):
    """无需认证，仅返回登录页所需的公开配置（logo、系统名称）。"""
    logo = perm_crud.get_setting_value(db, "system_logo", "")
    name = perm_crud.get_setting_value(db, "system_name", "icanfly")
    return {"system_logo": logo or None, "system_name": name}


@router.get("/settings", response_model=list[SystemSettingResponse])
def list_settings(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return perm_crud.get_all_settings(db)


@router.put("/settings/{key}", response_model=SystemSettingResponse)
def update_setting(
    key: str,
    body: SystemSettingUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    setting = perm_crud.update_setting(db, key, body.value or "")
    if not setting:
        raise HTTPException(status_code=404, detail="配置项不存在")
    return setting
