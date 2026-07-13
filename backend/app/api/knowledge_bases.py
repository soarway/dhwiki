from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud import knowledge_base as kb_crud
from app.crud import kb_permission as perm_crud
from app.crud.department import get_department
from app.models.user import User
from app.schemas.knowledge_base import KbCreate, KbUpdate, KbResponse, GlobalStats, KbPermissionsUpdate
from app.services.permission_service import get_user_context

router = APIRouter()


def _build_kb_dict(db, kb):
    """Build KbResponse dict including dept_id(s) and dept_manager_user_id."""
    stats = kb_crud.get_kb_stats(db, kb.id)
    dept_ids_all = perm_crud.get_kb_dept_ids(db, kb.id)
    dept_id = dept_ids_all[0] if dept_ids_all else None
    dept_manager_user_id = None
    if dept_id:
        dept = get_department(db, dept_id)
        if dept:
            dept_manager_user_id = dept.manager_user_id
    return {
        "id": kb.id,
        "name": kb.name,
        "icon": kb.icon,
        "description": kb.description,
        "is_default_visible": kb.is_default_visible,
        "created_by": kb.created_by,
        "created_at": kb.created_at,
        "updated_at": kb.updated_at,
        "dept_id": dept_id,
        "dept_ids": dept_ids_all,
        "dept_manager_user_id": dept_manager_user_id,
        "dir_tag": kb.dir_tag,
        "sort_order": kb.sort_order,
        **stats,
    }


@router.get("/stats", response_model=GlobalStats)
def global_stats(
    dir_tag: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return kb_crud.get_global_stats(db, dir_tag=dir_tag)


@router.get("", response_model=list[KbResponse])
@router.get("/", response_model=list[KbResponse], include_in_schema=False)
def list_kbs(
    search: str = "",
    dir_tag: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ctx = get_user_context(db, current_user)
    kbs = kb_crud.get_kb_list(db, search, dir_tag=dir_tag)
    accessible = [
        kb for kb in kbs
        if perm_crud.can_user_access_kb(
            db, kb.id, kb.is_default_visible,
            ctx["user_id"], ctx["dept_ids"], ctx["role_ids"], ctx["is_super_admin"],
        )
    ]
    return [KbResponse.model_validate(_build_kb_dict(db, kb)) for kb in accessible]


@router.get("/{kb_id}", response_model=KbResponse)
def get_kb(
    kb_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kb = kb_crud.get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    ctx = get_user_context(db, current_user)
    if not perm_crud.can_user_access_kb(
        db, kb.id, kb.is_default_visible,
        ctx["user_id"], ctx["dept_ids"], ctx["role_ids"], ctx["is_super_admin"],
    ):
        raise HTTPException(status_code=403, detail="无权访问此知识库")
    return KbResponse.model_validate(_build_kb_dict(db, kb))


@router.post("", response_model=KbResponse, status_code=201)
@router.post("/", response_model=KbResponse, status_code=201, include_in_schema=False)
def create_kb(
    body: KbCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    effective_dept_ids = body.dept_ids if body.dept_ids else (
        [body.dept_id] if body.dept_id is not None else []
    )
    is_visible = len(effective_dept_ids) == 0 and not body.user_ids and body.is_default_visible
    kb = kb_crud.create_kb(
        db,
        name=body.name,
        created_by=current_user.id,
        description=body.description,
        is_default_visible=is_visible,
        dir_tag=body.dir_tag,
    )
    for did in effective_dept_ids:
        perm_crud.set_kb_permission(db, kb.id, "dept", did, "read")
    for uid in body.user_ids:
        if uid != current_user.id:
            perm_crud.set_kb_permission(db, kb.id, "user", uid, "read")
    # 非公开知识库：确保创建人本人也能访问（write 权限，含删除）
    if not is_visible:
        perm_crud.set_kb_permission(db, kb.id, "user", current_user.id, "write")
    return KbResponse.model_validate(_build_kb_dict(db, kb))


@router.put("/{kb_id}", response_model=KbResponse)
def update_kb(
    kb_id: int,
    body: KbUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    update_data = body.model_dump(exclude_unset=True)
    # Pull dept_id out — handle separately
    _UNCHANGED = object()
    dept_id_update = update_data.pop("dept_id", _UNCHANGED)
    # Pull dir_tag out — must allow null to clear the field
    dir_tag_update = update_data.pop("dir_tag", _UNCHANGED)
    sort_order_update = update_data.pop("sort_order", _UNCHANGED)

    kb = kb_crud.update_kb(db, kb_id, **update_data)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    if dept_id_update is not _UNCHANGED:
        perm_crud.delete_kb_dept_permission(db, kb_id)
        if dept_id_update is not None:
            perm_crud.set_kb_permission(db, kb.id, "dept", dept_id_update, "read")
            kb.is_default_visible = False
        else:
            kb.is_default_visible = True
        db.commit()

    # Handle dir_tag explicitly — null is valid (clears the tag, moves KB to general)
    if dir_tag_update is not _UNCHANGED:
        kb.dir_tag = dir_tag_update
        db.commit()
        db.refresh(kb)

    # Handle sort_order explicitly — null is valid (clears the order, moves KB to bottom)
    if sort_order_update is not _UNCHANGED:
        kb.sort_order = sort_order_update
        db.commit()
        db.refresh(kb)

    return KbResponse.model_validate(_build_kb_dict(db, kb))


@router.delete("/{kb_id}", status_code=204)
def delete_kb(
    kb_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kb = kb_crud.get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    # File count check — always required
    stats = kb_crud.get_kb_stats(db, kb_id)
    if stats["file_count"] >= 5:
        raise HTTPException(status_code=403, detail="知识库文件数量不少于5个，无法删除")

    ctx = get_user_context(db, current_user)
    is_super_admin = ctx["is_super_admin"]

    if not is_super_admin:
        dept_id = perm_crud.get_kb_dept_id(db, kb_id)
        if dept_id is not None:
            raise HTTPException(status_code=403, detail="无权删除部门知识库")
        if kb.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="无权删除此知识库")

    if not kb_crud.delete_kb(db, kb_id):
        raise HTTPException(status_code=404, detail="知识库不存在")


@router.put("/{kb_id}/permissions", status_code=204)
def update_kb_permissions(
    kb_id: int,
    body: KbPermissionsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """全量更新知识库权限类型（单部门/多部门/跨部门多人/私有）。"""
    kb = kb_crud.get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")

    # 清除所有现有部门及用户权限
    perm_crud.delete_kb_dept_permission(db, kb_id)
    perm_crud.replace_kb_user_permissions(db, kb_id, [], "read")

    is_visible = False

    if body.kb_type == "single":
        for did in body.dept_ids[:1]:
            perm_crud.set_kb_permission(db, kb_id, "dept", did, "read")
    elif body.kb_type == "multi":
        for did in body.dept_ids:
            perm_crud.set_kb_permission(db, kb_id, "dept", did, "read")
    elif body.kb_type == "users":
        for uid in body.user_ids:
            if uid != kb.created_by:
                perm_crud.set_kb_permission(db, kb_id, "user", uid, "read")
    # private: 无额外权限记录

    # 非公开知识库：确保创建人始终有 write 权限
    if not is_visible:
        perm_crud.set_kb_permission(db, kb_id, "user", kb.created_by, "write")

    kb_crud.update_kb(db, kb_id, is_default_visible=is_visible)
