# backend/app/api/approval.py
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_super_admin
from app.crud.approval import (
    approve_request,
    get_approval_request,
    list_approval_requests,
    reject_request,
)
from app.models.approval import ApprovalStatus
from app.models.user import User
from app.schemas.approval import ApprovalAction, ApprovalResponse
from app.tasks.process_document import process_document

router = APIRouter()


@router.get("/", response_model=list[ApprovalResponse])
def list_approvals(
    status: Optional[ApprovalStatus] = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    return list_approval_requests(db, status=status, skip=skip, limit=limit)


@router.post("/{id}/approve", response_model=ApprovalResponse)
def approve_approval(
    id: int,
    action: ApprovalAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    req = get_approval_request(db, id)
    if not req:
        raise HTTPException(status_code=404, detail="审批请求不存在")
    if req.status != ApprovalStatus.pending:
        raise HTTPException(status_code=400, detail="该审批请求已被处理")
    updated = approve_request(db, id=id, reviewer_id=current_user.id, note=action.note)
    process_document.delay(updated.file_id)
    return updated


@router.post("/{id}/reject", response_model=ApprovalResponse)
def reject_approval(
    id: int,
    action: ApprovalAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    req = get_approval_request(db, id)
    if not req:
        raise HTTPException(status_code=404, detail="审批请求不存在")
    if req.status != ApprovalStatus.pending:
        raise HTTPException(status_code=400, detail="该审批请求已被处理")
    updated = reject_request(db, id=id, reviewer_id=current_user.id, note=action.note)
    return updated
