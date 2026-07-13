from typing import Optional
from sqlalchemy.orm import Session

from app.models.file_summary import FileSummary


def get_by_file_id(db: Session, file_id: int) -> Optional[FileSummary]:
    return db.query(FileSummary).filter(FileSummary.file_id == file_id).first()


def create_summary(db: Session, file_id: int, summary_path: str) -> FileSummary:
    record = FileSummary(file_id=file_id, summary_path=summary_path)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
