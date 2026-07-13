# backend/app/schemas/crawl.py
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.crawl import CrawlStatus


class CrawlJobCreate(BaseModel):
    url: str


class CrawlJobResponse(BaseModel):
    id: int
    url: str
    title: Optional[str]
    status: CrawlStatus
    error: Optional[str]
    chunk_count: int
    created_by: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}
