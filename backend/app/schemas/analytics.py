# backend/app/schemas/analytics.py
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class QueryLogResponse(BaseModel):
    id: int
    user_id: Optional[int]
    conversation_id: Optional[int]
    query_text: str
    answer_text: str
    response_ms: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


class AnalyticsStats(BaseModel):
    total_queries: int
    avg_response_ms: Optional[float]
    daily_counts: list[dict]
