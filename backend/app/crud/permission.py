# backend/app/crud/permission.py
from collections import deque
from typing import Optional
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.models.permission import Permission, PermissionLevel, ResourceType, SubjectType
from app.models.file import File, Folder
from app.models.role import Role


def grant_permission(
    db: Session,
    resource_type: ResourceType,
    resource_id: int,
    subject_type: SubjectType,
    subject_id: int,
    permission_level: PermissionLevel,
    created_by: Optional[int] = None,
) -> Permission:
    """授予权限（若已存在则更新权限级别）"""
    existing = db.query(Permission).filter(
        Permission.resource_type == resource_type,
        Permission.resource_id == resource_id,
        Permission.subject_type == subject_type,
        Permission.subject_id == subject_id,
    ).first()

    if existing:
        existing.permission_level = permission_level
        db.commit()
        db.refresh(existing)
        return existing

    perm = Permission(
        resource_type=resource_type,
        resource_id=resource_id,
        subject_type=subject_type,
        subject_id=subject_id,
        permission_level=permission_level,
        created_by=created_by,
    )
    db.add(perm)
    db.commit()
    db.refresh(perm)
    return perm


def revoke_permission(db: Session, permission_id: int) -> None:
    perm = db.query(Permission).filter(Permission.id == permission_id).first()
    if perm:
        db.delete(perm)
        db.commit()


def get_permissions_for_resource(
    db: Session, resource_type: ResourceType, resource_id: int
) -> list[Permission]:
    return db.query(Permission).filter(
        Permission.resource_type == resource_type,
        Permission.resource_id == resource_id,
    ).all()


def get_folder_ancestor_ids(db: Session, folder_id: Optional[int]) -> list[int]:
    """返回 folder_id 及其所有祖先 folder 的 id 列表（从近到远）"""
    ids: list[int] = []
    current_id = folder_id
    visited: set[int] = set()
    while current_id is not None and current_id not in visited:
        ids.append(current_id)
        visited.add(current_id)
        folder = db.query(Folder).filter(Folder.id == current_id).first()
        if folder is None:
            break
        current_id = folder.parent_id
    return ids


def resolve_file_allowed_ids(db: Session, file_id: int) -> dict:
    """
    计算文件的有效权限集合（含继承自父/祖先文件夹）。
    返回：{
        "allowed_user_ids": list[int],
        "allowed_dept_ids": list[int],
        "allowed_role_ids": list[int],
        "is_public": bool,
    }
    is_public=True 当且仅当存在 subject_type=role 且角色 name="member" 的权限记录。
    """
    file_record = db.query(File).filter(File.id == file_id).first()
    if not file_record:
        return {"allowed_user_ids": [], "allowed_dept_ids": [],
                "allowed_role_ids": [], "is_public": False}

    all_perms: list[Permission] = []
    all_perms.extend(get_permissions_for_resource(db, ResourceType.file, file_id))

    ancestor_ids = get_folder_ancestor_ids(db, file_record.folder_id)
    for fid in ancestor_ids:
        all_perms.extend(get_permissions_for_resource(db, ResourceType.folder, fid))

    member_role = db.query(Role).filter(Role.name == "member").first()
    member_role_id = member_role.id if member_role else None

    user_ids: set[int] = set()
    dept_ids: set[int] = set()
    role_ids: set[int] = set()
    is_public = False

    for perm in all_perms:
        if perm.subject_type == SubjectType.user:
            user_ids.add(perm.subject_id)
        elif perm.subject_type == SubjectType.department:
            dept_ids.add(perm.subject_id)
        elif perm.subject_type == SubjectType.role:
            role_ids.add(perm.subject_id)
            if perm.subject_id == member_role_id:
                is_public = True

    return {
        "allowed_user_ids": list(user_ids),
        "allowed_dept_ids": list(dept_ids),
        "allowed_role_ids": list(role_ids),
        "is_public": is_public,
    }


def get_affected_file_ids_for_resource(
    db: Session, resource_type: ResourceType, resource_id: int
) -> list[int]:
    """
    权限变更时返回受影响的所有文件 ID。
    文件：返回 [file_id]
    文件夹：递归返回该文件夹及子文件夹下所有文件 ID
    """
    if resource_type == ResourceType.file:
        return [resource_id]

    file_ids: list[int] = []
    folder_queue = deque([resource_id])
    visited: set[int] = set()

    while folder_queue:
        current_folder_id = folder_queue.popleft()
        if current_folder_id in visited:
            continue
        visited.add(current_folder_id)

        files = db.query(File).filter(File.folder_id == current_folder_id).all()
        file_ids.extend(f.id for f in files)

        children = db.query(Folder).filter(Folder.parent_id == current_folder_id).all()
        folder_queue.extend(c.id for c in children)

    return file_ids


def get_accessible_doc_ids(
    db: Session,
    user_id: int,
    dept_ids: list[int],
    role_ids: list[int],
    is_super_admin: bool,
) -> Optional[list[int]]:
    """
    返回当前用户可访问的所有 file_id 列表。
    super_admin 返回 None（不限制）。
    无任何权限时返回空列表 []。
    """
    if is_super_admin:
        return None

    conditions = [
        and_(Permission.subject_type == SubjectType.user, Permission.subject_id == user_id),
    ]
    if dept_ids:
        conditions.append(
            and_(
                Permission.subject_type == SubjectType.department,
                Permission.subject_id.in_(dept_ids),
            )
        )
    if role_ids:
        conditions.append(
            and_(
                Permission.subject_type == SubjectType.role,
                Permission.subject_id.in_(role_ids),
            )
        )

    perms = db.query(Permission).filter(or_(*conditions)).all()

    file_ids: set[int] = set()
    for perm in perms:
        ids = get_affected_file_ids_for_resource(db, perm.resource_type, perm.resource_id)
        file_ids.update(ids)

    return list(file_ids)
