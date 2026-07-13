# backend/app/crud/approval.py
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.approval import ApprovalRequest, ApprovalStatus
from app.models.file import File, ProcessStatus


def create_approval_request(
    db: Session,
    file_id: int,
    requester_note: Optional[str] = None,
) -> ApprovalRequest:
    req = ApprovalRequest(
        file_id=file_id,
        status=ApprovalStatus.pending,
        requester_note=requester_note,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def get_approval_request(db: Session, id: int) -> Optional[ApprovalRequest]:
    return db.query(ApprovalRequest).filter(ApprovalRequest.id == id).first()


def list_approval_requests(
    db: Session,
    status: Optional[ApprovalStatus] = None,
    skip: int = 0,
    limit: int = 20,
) -> list[ApprovalRequest]:
    query = db.query(ApprovalRequest)
    if status is not None:
        query = query.filter(ApprovalRequest.status == status)
    return query.offset(skip).limit(limit).all()


def approve_request(
    db: Session,
    id: int,
    reviewer_id: int,
    note: Optional[str] = None,
) -> Optional[ApprovalRequest]:
    req = get_approval_request(db, id)
    if not req:
        return None
    req.status = ApprovalStatus.approved
    req.reviewer_id = reviewer_id
    req.reviewer_note = note
    req.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    return req


def reject_request(
    db: Session,
    id: int,
    reviewer_id: int,
    note: Optional[str] = None,
) -> Optional[ApprovalRequest]:
    req = get_approval_request(db, id)
    if not req:
        return None
    req.status = ApprovalStatus.rejected
    req.reviewer_id = reviewer_id
    req.reviewer_note = note
    req.reviewed_at = datetime.utcnow()

    file_record: Optional[File] = db.query(File).filter(File.id == req.file_id).first()
    if file_record:
        file_record.process_status = ProcessStatus.failed
        file_record.process_error = f"审批拒绝: {note or '无备注'}"

    db.commit()
    db.refresh(req)
    return req


def get_pending_for_file(db: Session, file_id: int) -> Optional[ApprovalRequest]:
    return (
        db.query(ApprovalRequest)
        .filter(
            ApprovalRequest.file_id == file_id,
            ApprovalRequest.status == ApprovalStatus.pending,
        )
        .first()
    )
