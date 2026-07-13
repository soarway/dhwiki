# backend/app/crud/crawl.py
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.models.crawl import CrawlJob, CrawlStatus


def create_crawl_job(db: Session, url: str, created_by: Optional[int]) -> CrawlJob:
    job = CrawlJob(url=url, created_by=created_by, created_at=datetime.utcnow())
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_crawl_job(db: Session, job_id: int) -> Optional[CrawlJob]:
    return db.query(CrawlJob).filter(CrawlJob.id == job_id).first()


def list_crawl_jobs(db: Session, skip: int = 0, limit: int = 50) -> list[CrawlJob]:
    return (
        db.query(CrawlJob)
        .order_by(CrawlJob.created_at.desc())
        .offset(skip).limit(limit).all()
    )


def update_crawl_job_status(
    db: Session,
    job_id: int,
    status: CrawlStatus,
    title: Optional[str] = None,
    chunk_count: int = 0,
    error: Optional[str] = None,
) -> Optional[CrawlJob]:
    job = get_crawl_job(db, job_id)
    if not job:
        return None
    job.status = status
    if title is not None:
        job.title = title
    if chunk_count:
        job.chunk_count = chunk_count
    if error is not None:
        job.error = error
    db.commit()
    db.refresh(job)
    return job
