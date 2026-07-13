# backend/app/models/permission.py
from datetime import datetime
from typing import Optional
import enum
from sqlalchemy import Integer, DateTime, ForeignKey, Enum, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PermissionLevel(str, enum.Enum):
    view = "view"
    download = "download"
    edit = "edit"
    manage = "manage"


class ResourceType(str, enum.Enum):
    folder = "folder"
    file = "file"


class SubjectType(str, enum.Enum):
    user = "user"
    department = "department"
    role = "role"


class Permission(Base):
    __tablename__ = "permissions"
    __table_args__ = (
        UniqueConstraint(
            "resource_type", "resource_id", "subject_type", "subject_id",
            name="uq_permission_resource_subject"
        ),
        Index("ix_permissions_resource", "resource_type", "resource_id"),
        Index("ix_permissions_subject", "subject_type", "subject_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    resource_type: Mapped[ResourceType] = mapped_column(
        Enum(ResourceType), nullable=False
    )
    resource_id: Mapped[int] = mapped_column(Integer, nullable=False)
    subject_type: Mapped[SubjectType] = mapped_column(
        Enum(SubjectType), nullable=False
    )
    subject_id: Mapped[int] = mapped_column(Integer, nullable=False)
    permission_level: Mapped[PermissionLevel] = mapped_column(
        Enum(PermissionLevel), nullable=False
    )
    created_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
