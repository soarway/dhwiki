from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class KbPermission(Base):
    """知识库级别权限：控制用户/角色对某个知识库的访问权限"""
    __tablename__ = "kb_permissions"
    __table_args__ = (
        UniqueConstraint("kb_id", "subject_type", "subject_id", name="uq_kb_perm_subject"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kb_id: Mapped[int] = mapped_column(Integer, ForeignKey("knowledge_bases.id"), nullable=False)
    # subject_type: "user" | "role"
    subject_type: Mapped[str] = mapped_column(String(10), nullable=False)
    subject_id: Mapped[int] = mapped_column(Integer, nullable=False)
    # permission: "read" | "write" | "admin"
    permission: Mapped[str] = mapped_column(String(20), nullable=False, default="read")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class FilePermission(Base):
    """文件级别权限：控制用户/角色对某个文件的访问权限"""
    __tablename__ = "file_permissions"
    __table_args__ = (
        UniqueConstraint("file_id", "subject_type", "subject_id", name="uq_file_perm_subject"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_id: Mapped[int] = mapped_column(Integer, ForeignKey("files.id"), nullable=False)
    subject_type: Mapped[str] = mapped_column(String(10), nullable=False)
    subject_id: Mapped[int] = mapped_column(Integer, nullable=False)
    permission: Mapped[str] = mapped_column(String(20), nullable=False, default="read")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class SystemSetting(Base):
    """系统全局配置（key-value）"""
    __tablename__ = "system_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    value: Mapped[Optional[str]] = mapped_column(MEDIUMTEXT, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
