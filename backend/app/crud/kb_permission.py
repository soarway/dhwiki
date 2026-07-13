from typing import Optional
from sqlalchemy.orm import Session

from app.models.kb_permission import KbPermission, FilePermission, SystemSetting


# ---- KB 权限 ----

def get_kb_permissions(db: Session, kb_id: int) -> list[KbPermission]:
    return db.query(KbPermission).filter(KbPermission.kb_id == kb_id).all()


def set_kb_permission(db: Session, kb_id: int, subject_type: str, subject_id: int, permission: str) -> KbPermission:
    existing = db.query(KbPermission).filter(
        KbPermission.kb_id == kb_id,
        KbPermission.subject_type == subject_type,
        KbPermission.subject_id == subject_id,
    ).first()
    if existing:
        existing.permission = permission
        db.commit()
        db.refresh(existing)
        return existing
    perm = KbPermission(kb_id=kb_id, subject_type=subject_type, subject_id=subject_id, permission=permission)
    db.add(perm)
    db.commit()
    db.refresh(perm)
    return perm


def delete_kb_permission(db: Session, perm_id: int) -> bool:
    perm = db.get(KbPermission, perm_id)
    if not perm:
        return False
    db.delete(perm)
    db.commit()
    return True


def get_kb_dept_id(db: Session, kb_id: int):
    perm = db.query(KbPermission).filter(
        KbPermission.kb_id == kb_id,
        KbPermission.subject_type == "dept",
    ).first()
    return perm.subject_id if perm else None


def get_kb_dept_ids(db: Session, kb_id: int) -> list[int]:
    perms = db.query(KbPermission).filter(
        KbPermission.kb_id == kb_id,
        KbPermission.subject_type == "dept",
    ).all()
    return [p.subject_id for p in perms]


def delete_kb_dept_permission(db: Session, kb_id: int) -> None:
    db.query(KbPermission).filter(
        KbPermission.kb_id == kb_id,
        KbPermission.subject_type == "dept",
    ).delete()
    db.commit()


def get_kb_user_permissions(db: Session, kb_id: int) -> list[KbPermission]:
    return db.query(KbPermission).filter(
        KbPermission.kb_id == kb_id,
        KbPermission.subject_type == "user",
    ).all()


def replace_kb_user_permissions(db: Session, kb_id: int, user_ids: list[int], permission: str) -> None:
    db.query(KbPermission).filter(
        KbPermission.kb_id == kb_id,
        KbPermission.subject_type == "user",
    ).delete()
    db.commit()
    for uid in user_ids:
        db.add(KbPermission(kb_id=kb_id, subject_type="user", subject_id=uid, permission=permission))
    if user_ids:
        db.commit()


def get_kb_user_perms_with_details(db: Session, kb_id: int) -> list[dict]:
    from app.models.user import User
    perms = db.query(KbPermission).filter(
        KbPermission.kb_id == kb_id,
        KbPermission.subject_type == "user",
    ).all()
    result = []
    for p in perms:
        user = db.get(User, p.subject_id)
        if user:
            result.append({
                "perm_id": p.id,
                "user_id": p.subject_id,
                "username": user.username,
                "real_name": user.real_name,
                "permission": p.permission,
            })
    return result


def check_kb_access(db: Session, kb_id: int, user_id: int, role_ids: list[int], required: str = "read") -> bool:
    levels = {"read": 1, "write": 2, "admin": 3}
    required_level = levels.get(required, 1)
    perms = db.query(KbPermission).filter(
        KbPermission.kb_id == kb_id,
        KbPermission.subject_type.in_(["user", "role"]),
    ).all()
    for p in perms:
        if p.subject_type == "user" and p.subject_id == user_id:
            if levels.get(p.permission, 0) >= required_level:
                return True
        if p.subject_type == "role" and p.subject_id in role_ids:
            if levels.get(p.permission, 0) >= required_level:
                return True
    return False


def can_user_access_kb(
    db: Session,
    kb_id: int,
    is_default_visible: bool,
    user_id: int,
    dept_ids: list[int],
    role_ids: list[int],
    is_super_admin: bool,
) -> bool:
    """判断用户是否有权访问指定知识库。
    超级管理员 → 始终可访问。
    is_default_visible=True → 全员可访问。
    否则检查 dept / user / role 权限记录。
    """
    if is_super_admin:
        return True
    if is_default_visible:
        return True
    perms = db.query(KbPermission).filter(KbPermission.kb_id == kb_id).all()
    for p in perms:
        if p.subject_type == "user" and p.subject_id == user_id:
            return True
        if p.subject_type == "dept" and p.subject_id in dept_ids:
            return True
        if p.subject_type == "role" and p.subject_id in role_ids:
            return True
    return False


# ---- 文件权限 ----

def get_file_permissions(db: Session, file_id: int) -> list[FilePermission]:
    return db.query(FilePermission).filter(FilePermission.file_id == file_id).all()


def set_file_permission(db: Session, file_id: int, subject_type: str, subject_id: int, permission: str) -> FilePermission:
    existing = db.query(FilePermission).filter(
        FilePermission.file_id == file_id,
        FilePermission.subject_type == subject_type,
        FilePermission.subject_id == subject_id,
    ).first()
    if existing:
        existing.permission = permission
        db.commit()
        db.refresh(existing)
        return existing
    perm = FilePermission(file_id=file_id, subject_type=subject_type, subject_id=subject_id, permission=permission)
    db.add(perm)
    db.commit()
    db.refresh(perm)
    return perm


def delete_file_permission(db: Session, perm_id: int) -> bool:
    perm = db.get(FilePermission, perm_id)
    if not perm:
        return False
    db.delete(perm)
    db.commit()
    return True


# ---- 系统设置 ----

def get_all_settings(db: Session) -> list[SystemSetting]:
    return db.query(SystemSetting).order_by(SystemSetting.key).all()


def get_setting(db: Session, key: str) -> Optional[SystemSetting]:
    return db.query(SystemSetting).filter(SystemSetting.key == key).first()


def get_setting_value(db: Session, key: str, default: str = "") -> str:
    s = get_setting(db, key)
    return s.value if s and s.value is not None else default


def update_setting(db: Session, key: str, value: str) -> SystemSetting:
    s = get_setting(db, key)
    if not s:
        s = SystemSetting(key=key, value=value)
        db.add(s)
    else:
        s.value = value
    db.commit()
    db.refresh(s)
    return s
