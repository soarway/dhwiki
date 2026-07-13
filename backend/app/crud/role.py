import uuid
from typing import Optional
from sqlalchemy.orm import Session

from app.models.role import Role
from app.models.user import User, UserRole
from app.schemas.role import RoleCreate, RoleUpdate


def get_roles(db: Session) -> list[Role]:
    return db.query(Role).all()


def get_role(db: Session, role_id: int) -> Optional[Role]:
    return db.query(Role).filter(Role.id == role_id).first()


def create_role(db: Session, data: RoleCreate) -> Role:
    code = data.code.strip() if data.code else ""
    if not code:
        code = uuid.uuid4().hex[:8]
    role = Role(name=data.name, code=code, description=data.description or "", is_system=False)
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


def update_role(db: Session, role: Role, data: RoleUpdate) -> Role:
    if data.name is not None:
        role.name = data.name
    if data.code is not None:
        role.code = data.code.strip() or uuid.uuid4().hex[:8]
    if data.description is not None:
        role.description = data.description
    db.commit()
    db.refresh(role)
    return role


def delete_role(db: Session, role: Role) -> None:
    db.delete(role)
    db.commit()


def save_menu_permissions(db: Session, role: Role, menu_permissions: str) -> Role:
    role.menu_permissions = menu_permissions
    db.commit()
    db.refresh(role)
    return role


def get_role_users(db: Session, role_id: int) -> list[User]:
    return (
        db.query(User)
        .join(UserRole, UserRole.user_id == User.id)
        .filter(UserRole.role_id == role_id)
        .all()
    )


def assign_user_to_role(db: Session, role_id: int, user_id: int) -> None:
    exists = db.query(UserRole).filter(
        UserRole.role_id == role_id, UserRole.user_id == user_id
    ).first()
    if not exists:
        db.add(UserRole(role_id=role_id, user_id=user_id))
        db.commit()


def remove_user_from_role(db: Session, role_id: int, user_id: int) -> None:
    db.query(UserRole).filter(
        UserRole.role_id == role_id, UserRole.user_id == user_id
    ).delete()
    db.commit()
