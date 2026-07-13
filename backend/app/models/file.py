# backend/app/models/file.py
from datetime import datetime
from typing import Optional
import enum
from sqlalchemy import Integer, String, BigInteger, Boolean, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ProcessStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class WatchDirectory(Base):
    __tablename__ = "watch_directories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    fs_path: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    require_approval: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    kb_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("knowledge_bases.id", ondelete="SET NULL"), nullable=True
    )
    last_scan_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    scan_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    scan_done: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    scan_failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    folders: Mapped[list["Folder"]] = relationship("Folder", back_populates="watch_directory")


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("folders.id"), nullable=True
    )
    fs_path: Mapped[str] = mapped_column(String(500), nullable=False)
    watch_dir_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("watch_directories.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    parent: Mapped[Optional["Folder"]] = relationship(
        "Folder", back_populates="children", remote_side=[id]
    )
    children: Mapped[list["Folder"]] = relationship("Folder", back_populates="parent")
    files: Mapped[list["File"]] = relationship("File", back_populates="folder")
    watch_directory: Mapped[Optional["WatchDirectory"]] = relationship(
        "WatchDirectory", back_populates="folders"
    )


class File(Base):
    __tablename__ = "files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    folder_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("folders.id"), nullable=True
    )
    # 知识库关联字段
    kb_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("knowledge_bases.id"), nullable=True
    )
    kb_folder_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("kb_folders.id"), nullable=True
    )
    uploaded_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    is_manual_upload: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    fs_path: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    file_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    process_status: Mapped[ProcessStatus] = mapped_column(
        Enum(ProcessStatus), default=ProcessStatus.pending, nullable=False
    )
    process_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_modified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    folder: Mapped[Optional["Folder"]] = relationship("Folder", back_populates="files")
