# backend/app/schemas/approval.py
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.approval import ApprovalStatus


class ApprovalResponse(BaseModel):
    id: int
    file_id: int
    status: ApprovalStatus
    requester_note: Optional[str]
    reviewer_id: Optional[int]
    reviewer_note: Optional[str]
    created_at: datetime
    reviewed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ApprovalAction(BaseModel):
    note: Optional[str] = None
