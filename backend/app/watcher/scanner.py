# backend/app/watcher/scanner.py
"""
全量目录扫描器：将磁盘目录树同步到 MySQL 数据库并关联到指定知识库。
"""
import hashlib
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from app.models.file import File, Folder, WatchDirectory, ProcessStatus
from app.tasks.process_document import process_document

SUPPORTED_EXTENSIONS = {
    ".pdf", ".docx", ".doc", ".xlsx", ".xls",
    ".pptx", ".ppt", ".txt", ".md", ".html", ".htm", ".sql",
}


def compute_file_hash(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def get_or_create_folder(
    db: Session,
    fs_path: str,
    watch_dir: WatchDirectory,
    parent: Optional[Folder] = None,
) -> Folder:
    folder = db.query(Folder).filter(Folder.fs_path == fs_path).first()
    if not folder:
        folder = Folder(
            name=Path(fs_path).name or fs_path,
            parent_id=parent.id if parent else None,
            fs_path=fs_path,
            watch_dir_id=watch_dir.id,
        )
        db.add(folder)
        db.flush()
    return folder


def get_or_create_kb_folder(
    db: Session,
    kb_id: int,
    name: str,
    parent_id: Optional[int] = None,
    created_by: int = 1,
):
    from app.models.knowledge_base import KbFolder
    existing = db.query(KbFolder).filter(
        KbFolder.kb_id == kb_id,
        KbFolder.name == name,
        KbFolder.parent_id == parent_id,
        KbFolder.is_deleted == False,
    ).first()
    if not existing:
        existing = KbFolder(kb_id=kb_id, name=name, parent_id=parent_id, created_by=created_by)
        db.add(existing)
        db.flush()
    return existing


def _count_files(base_path: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(str(base_path)):
        total += sum(1 for f in files if Path(f).suffix.lower() in SUPPORTED_EXTENSIONS)
    return total


def scan_watch_directory(db: Session, watch_dir: WatchDirectory) -> dict:
    """
    全量扫描单个监控目录，返回统计信息：
    {"new": int, "updated": int, "unchanged": int, "errors": int}
    """
    stats = {"new": 0, "updated": 0, "unchanged": 0, "errors": 0}
    base_path = Path(watch_dir.fs_path)

    if not base_path.exists():
        return stats

    # 先统计总文件数以支持进度显示
    total_files = _count_files(base_path)
    watch_dir.scan_total = total_files
    watch_dir.scan_done = 0
    watch_dir.scan_failed = 0
    db.commit()

    # 为知识库创建根文件夹（watch_dir.name 作为 KB 内的顶层文件夹）
    root_kb_folder_id: Optional[int] = None
    creator_id = watch_dir.created_by or 1
    if watch_dir.kb_id:
        root_kb_folder = get_or_create_kb_folder(
            db, watch_dir.kb_id, watch_dir.name, created_by=creator_id
        )
        db.commit()
        root_kb_folder_id = root_kb_folder.id

    # 确保根 watcher 文件夹存在
    root_folder = get_or_create_folder(db, str(base_path), watch_dir)
    db.commit()

    def _update_progress():
        watch_dir.scan_done = stats["new"] + stats["updated"] + stats["unchanged"]
        watch_dir.scan_failed = stats["errors"]
        db.commit()

    def scan_dir(dir_path: Path, parent_folder: Folder, kb_folder_id: Optional[int]):
        try:
            entries = list(dir_path.iterdir())
        except PermissionError:
            return

        for entry in entries:
            if entry.is_dir():
                sub_folder = get_or_create_folder(db, str(entry), watch_dir, parent_folder)
                db.commit()
                sub_kb_folder_id = kb_folder_id
                if watch_dir.kb_id:
                    sub_kb_folder = get_or_create_kb_folder(
                        db, watch_dir.kb_id, entry.name, kb_folder_id, created_by=creator_id
                    )
                    db.commit()
                    sub_kb_folder_id = sub_kb_folder.id
                scan_dir(entry, sub_folder, sub_kb_folder_id)
            elif entry.is_file() and entry.suffix.lower() in SUPPORTED_EXTENSIONS:
                _process_file_entry(db, entry, parent_folder, stats, watch_dir, kb_folder_id, creator_id)
                _update_progress()

    scan_dir(base_path, root_folder, root_kb_folder_id)

    watch_dir.last_scan_at = datetime.utcnow()
    _update_progress()

    return stats


def _process_file_entry(
    db: Session,
    file_path: Path,
    folder: Folder,
    stats: dict,
    watch_dir: WatchDirectory,
    kb_folder_id: Optional[int] = None,
    creator_id: int = 1,
) -> None:
    try:
        file_hash = compute_file_hash(str(file_path))
        stat = file_path.stat()

        existing: Optional[File] = db.query(File).filter(
            File.fs_path == str(file_path)
        ).first()

        if existing is None:
            file_record = File(
                name=file_path.name,
                folder_id=folder.id,
                kb_id=watch_dir.kb_id,
                kb_folder_id=kb_folder_id,
                is_manual_upload=False,
                uploaded_by=creator_id,
                fs_path=str(file_path),
                file_hash=file_hash,
                file_type=file_path.suffix.lstrip(".").lower(),
                file_size=stat.st_size,
                process_status=ProcessStatus.pending,
                last_modified_at=datetime.fromtimestamp(stat.st_mtime),
            )
            db.add(file_record)
            db.flush()
            if watch_dir.require_approval:
                from app.crud.approval import create_approval_request
                create_approval_request(db, file_id=file_record.id)
            else:
                process_document.delay(file_record.id)
            stats["new"] += 1

        elif existing.file_hash != file_hash:
            existing.file_hash = file_hash
            existing.file_size = stat.st_size
            existing.process_status = ProcessStatus.pending
            existing.process_error = None
            existing.chunk_count = 0
            existing.last_modified_at = datetime.fromtimestamp(stat.st_mtime)
            # 确保 kb 关联和创建人正确
            if watch_dir.kb_id and not existing.kb_id:
                existing.kb_id = watch_dir.kb_id
                existing.kb_folder_id = kb_folder_id
            if not existing.uploaded_by:
                existing.uploaded_by = creator_id
            db.flush()
            process_document.delay(existing.id)
            stats["updated"] += 1

        else:
            # 文件内容未变化，补充缺失的 kb 关联和创建人
            changed = False
            if watch_dir.kb_id and (not existing.kb_id or existing.kb_folder_id is None):
                existing.kb_id = watch_dir.kb_id
                existing.kb_folder_id = kb_folder_id
                changed = True
            if not existing.uploaded_by:
                existing.uploaded_by = creator_id
                changed = True
            if changed:
                db.flush()
            stats["unchanged"] += 1

        db.commit()
    except Exception:
        stats["errors"] += 1
        db.rollback()
