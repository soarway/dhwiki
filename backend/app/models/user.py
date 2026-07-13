from datetime import datetime
from typing import Optional
import enum
from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class AuthSource(str, enum.Enum):
    local = "local"
    ldap = "ldap"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    real_name: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar: Mapped[Optional[str]] = mapped_column(MEDIUMTEXT, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)   # 'male'/'female'/None
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_frozen: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auth_source: Mapped[AuthSource] = mapped_column(
        Enum(AuthSource), default=AuthSource.local, nullable=False
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    departments: Mapped[list["UserDepartment"]] = relationship(
        "UserDepartment", back_populates="user", lazy="joined"
    )
    roles: Mapped[list["UserRole"]] = relationship(
        "UserRole", back_populates="user", lazy="joined"
    )

    @property
    def dept_names(self) -> list[str]:
        return [ud.department.name for ud in self.departments if ud.department]

    @property
    def dept_ids(self) -> list[int]:
        return [ud.dept_id for ud in self.departments]


class UserDepartment(Base):
    __tablename__ = "user_departments"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), primary_key=True
    )
    dept_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("departments.id"), primary_key=True
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="departments")
    department: Mapped["Department"] = relationship("Department", lazy="joined")


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), primary_key=True
    )
    role_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("roles.id"), primary_key=True
    )

    user: Mapped["User"] = relationship("User", back_populates="roles")
    role: Mapped["Role"] = relationship("Role", lazy="joined")
