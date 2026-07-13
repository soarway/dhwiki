# backend/app/crud/file_wiki.py
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.file_wiki import FileWiki, WikiStatus


def get_by_file_id(db: Session, file_id: int) -> Optional[FileWiki]:
    return db.query(FileWiki).filter(FileWiki.file_id == file_id).first()


def create_or_reset(db: Session, file_id: int) -> FileWiki:
    """创建新记录或将已有记录重置为 processing 状态（用于重试）。"""
    record = get_by_file_id(db, file_id)
    if record:
        record.wiki_status = WikiStatus.processing
        record.wiki_error = None
        record.wiki_path = None
        record.generated_at = None
        record.retry_count = (record.retry_count or 0) + 1
    else:
        record = FileWiki(
            file_id=file_id,
            wiki_status=WikiStatus.processing,
            retry_count=0,
        )
        db.add(record)
    db.commit()
    db.refresh(record)
    return record


def mark_completed(db: Session, file_id: int, wiki_path: str) -> None:
    record = get_by_file_id(db, file_id)
    if record:
        record.wiki_status = WikiStatus.completed
        record.wiki_path = wiki_path
        record.wiki_error = None
        record.generated_at = datetime.utcnow()
        db.commit()


def mark_failed(db: Session, file_id: int, error: str) -> None:
    record = get_by_file_id(db, file_id)
    if record:
        record.wiki_status = WikiStatus.failed
        record.wiki_error = error
        db.commit()


def reset_to_pending(db: Session, file_id: int) -> FileWiki:
    """手动重试：重置为 pending，重入队列。"""
    record = get_by_file_id(db, file_id)
    if record:
        record.wiki_status = WikiStatus.pending
        record.wiki_error = None
        db.commit()
        db.refresh(record)
        return record
    record = FileWiki(file_id=file_id, wiki_status=WikiStatus.pending, retry_count=0)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
