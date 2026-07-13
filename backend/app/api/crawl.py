# backend/app/api/crawl.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_super_admin
from app.crud.crawl import create_crawl_job, list_crawl_jobs
from app.models.user import User
from app.schemas.crawl import CrawlJobCreate, CrawlJobResponse
from app.tasks.crawl_url import crawl_url

router = APIRouter()


@router.post("", response_model=CrawlJobResponse, status_code=status.HTTP_202_ACCEPTED)
def enqueue_crawl(
    data: CrawlJobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    """Enqueue a URL crawl job (super_admin only)."""
    url_str = str(data.url)
    job = create_crawl_job(db, url=url_str, created_by=current_user.id)
    # Enqueue Celery task
    crawl_url.delay(job.id, url_str)
    return job


@router.get("", response_model=list[CrawlJobResponse])
def get_crawl_jobs(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """List crawl jobs (super_admin only)."""
    return list_crawl_jobs(db, skip=skip, limit=limit)
