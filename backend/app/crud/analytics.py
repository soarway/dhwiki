# backend/app/crud/analytics.py
import json
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.analytics import QueryLog


def create_query_log(
    db: Session,
    user_id: Optional[int],
    conversation_id: Optional[int],
    query_text: str,
    answer_text: str,
    sources: Optional[list],
    response_ms: Optional[int],
) -> QueryLog:
    log = QueryLog(
        user_id=user_id,
        conversation_id=conversation_id,
        query_text=query_text,
        answer_text=answer_text,
        sources_json=json.dumps(sources, ensure_ascii=False) if sources else None,
        response_ms=response_ms,
        created_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def list_query_logs(db: Session, skip: int = 0, limit: int = 100) -> list[QueryLog]:
    return (
        db.query(QueryLog)
        .order_by(QueryLog.created_at.desc())
        .offset(skip).limit(limit).all()
    )


def get_stats(db: Session) -> dict:
    total = db.query(func.count(QueryLog.id)).scalar() or 0
    avg_ms = db.query(func.avg(QueryLog.response_ms)).scalar()
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    rows = (
        db.query(
            func.date(QueryLog.created_at).label("day"),
            func.count(QueryLog.id).label("count"),
        )
        .filter(QueryLog.created_at >= seven_days_ago)
        .group_by(func.date(QueryLog.created_at))
        .order_by(func.date(QueryLog.created_at))
        .all()
    )
    daily_counts = [{"date": str(r.day), "count": r.count} for r in rows]
    return {
        "total_queries": total,
        "avg_response_ms": round(float(avg_ms), 2) if avg_ms else None,
        "daily_counts": daily_counts,
    }
