from typing import Optional
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models.user import User, UserDepartment
from app.schemas.user import UserCreate, UserUpdate


def get_user(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def get_users(db: Session, skip: int = 0, limit: int = 20) -> tuple[list[User], int]:
    query = db.query(User)
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return items, total


def create_user(db: Session, data: UserCreate) -> User:
    user = User(
        username=data.username,
        real_name=data.real_name,
        email=data.email,
        password_hash=get_password_hash(data.password),
        gender=data.gender,
        phone=data.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user: User, data: UserUpdate) -> User:
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def update_user_status(db: Session, user: User, status: bool) -> User:
    user.status = status
    db.commit()
    db.refresh(user)
    return user


def update_user_frozen(db: Session, user: User, is_frozen: bool) -> User:
    user.is_frozen = is_frozen
    db.commit()
    db.refresh(user)
    return user


def reset_password(db: Session, user: User, new_password: str) -> User:
    user.password_hash = get_password_hash(new_password)
    db.commit()
    return user


def assign_user_to_department(db: Session, user_id: int, dept_id: int) -> None:
    exists = db.query(UserDepartment).filter(
        UserDepartment.user_id == user_id, UserDepartment.dept_id == dept_id
    ).first()
    if not exists:
        db.add(UserDepartment(user_id=user_id, dept_id=dept_id, is_primary=True))
        db.commit()


def remove_user_from_department(db: Session, user_id: int, dept_id: int) -> None:
    db.query(UserDepartment).filter(
        UserDepartment.user_id == user_id, UserDepartment.dept_id == dept_id
    ).delete()
    db.commit()
