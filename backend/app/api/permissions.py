# backend/app/api/permissions.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_super_admin
from app.crud.permission import (
    grant_permission, revoke_permission,
    get_permissions_for_resource, get_affected_file_ids_for_resource,
)
from app.models.permission import Permission, ResourceType
from app.models.user import User
from app.schemas.permission import PermissionCreate, PermissionResponse

router = APIRouter()


@router.get("/", response_model=list[PermissionResponse])
def list_permissions(
    resource_type: ResourceType,
    resource_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    return get_permissions_for_resource(db, resource_type, resource_id)


@router.post("/", response_model=PermissionResponse, status_code=201)
def create_permission(
    data: PermissionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    perm = grant_permission(
        db,
        resource_type=data.resource_type,
        resource_id=data.resource_id,
        subject_type=data.subject_type,
        subject_id=data.subject_id,
        permission_level=data.permission_level,
        created_by=current_user.id,
    )
    affected_file_ids = get_affected_file_ids_for_resource(
        db, data.resource_type, data.resource_id
    )
    if affected_file_ids:
        from app.tasks.sync_permissions import sync_file_permissions
        for file_id in affected_file_ids:
            sync_file_permissions.delay(file_id)
    return perm


@router.delete("/{permission_id}", status_code=204)
def delete_permission(
    permission_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    perm_record = db.query(Permission).filter(Permission.id == permission_id).first()
    if not perm_record:
        raise HTTPException(status_code=404, detail="权限记录不存在")

    affected_file_ids = get_affected_file_ids_for_resource(
        db, perm_record.resource_type, perm_record.resource_id
    )
    revoke_permission(db, permission_id)

    if affected_file_ids:
        from app.tasks.sync_permissions import sync_file_permissions
        for file_id in affected_file_ids:
            sync_file_permissions.delay(file_id)
