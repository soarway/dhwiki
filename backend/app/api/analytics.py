# backend/app/api/analytics.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_super_admin
from app.crud.analytics import list_query_logs, get_stats
from app.models.user import User
from app.schemas.analytics import QueryLogResponse, AnalyticsStats

router = APIRouter()


@router.get("/queries", response_model=list[QueryLogResponse])
def get_recent_queries(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Return recent query logs (super_admin only)."""
    return list_query_logs(db, skip=skip, limit=limit)


@router.get("/stats", response_model=AnalyticsStats)
def get_analytics_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Return aggregate stats (super_admin only)."""
    return get_stats(db)
