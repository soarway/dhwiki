# backend/tests/test_approval_crud.py
from app.crud.approval import (
    create_approval_request,
    approve_request,
    reject_request,
    list_approval_requests,
    get_pending_for_file,
)
from app.models.approval import ApprovalStatus
from app.models.file import File, Folder, WatchDirectory, ProcessStatus
from tests.conftest import TestingSessionLocal


def make_file(db) -> File:
    wd = WatchDirectory(name="test_wd", fs_path="/mnt/approval_test")
    db.add(wd)
    db.flush()
    folder = Folder(name="root", fs_path="/mnt/approval_test", watch_dir_id=wd.id)
    db.add(folder)
    db.flush()
    f = File(
        name="doc.pdf",
        fs_path="/mnt/approval_test/doc.pdf",
        file_type="pdf",
        file_size=1024,
        folder_id=folder.id,
    )
    db.add(f)
    db.commit()
    return f


def test_create_approval():
    db = TestingSessionLocal()
    f = make_file(db)
    req = create_approval_request(db, file_id=f.id, requester_note="Please review")
    file_id = f.id
    db.close()
    assert req.id is not None
    assert req.file_id == file_id
    assert req.status == ApprovalStatus.pending
    assert req.requester_note == "Please review"
    assert req.reviewer_id is None
    assert req.reviewed_at is None


def test_approve_request():
    db = TestingSessionLocal()
    f = make_file(db)
    req = create_approval_request(db, file_id=f.id)
    approved = approve_request(db, id=req.id, reviewer_id=1, note="Looks good")
    db.close()
    assert approved is not None
    assert approved.status == ApprovalStatus.approved
    assert approved.reviewer_id == 1
    assert approved.reviewer_note == "Looks good"
    assert approved.reviewed_at is not None


def test_reject_request():
    db = TestingSessionLocal()
    f = make_file(db)
    req = create_approval_request(db, file_id=f.id)
    rejected = reject_request(db, id=req.id, reviewer_id=1, note="Inappropriate content")
    file_id = f.id
    rejected_id = rejected.id
    rejected_status = rejected.status
    db.expire_all()
    updated_file = db.query(File).filter(File.id == file_id).first()
    db.close()
    assert rejected_id is not None
    assert rejected_status == ApprovalStatus.rejected
    assert updated_file.process_status == ProcessStatus.failed
    assert "审批拒绝" in updated_file.process_error


def test_list_by_status():
    db = TestingSessionLocal()
    f1 = make_file(db)
    folder = db.query(Folder).filter(Folder.fs_path == "/mnt/approval_test").first()
    f2 = File(
        name="doc2.pdf",
        fs_path="/mnt/approval_test/doc2.pdf",
        file_type="pdf",
        file_size=512,
        folder_id=folder.id,
    )
    db.add(f2)
    db.commit()
    req1 = create_approval_request(db, file_id=f1.id)
    req2 = create_approval_request(db, file_id=f2.id)
    approve_request(db, id=req1.id, reviewer_id=1)
    pending = list_approval_requests(db, status=ApprovalStatus.pending)
    all_reqs = list_approval_requests(db)
    f2_id = f2.id
    db.close()
    assert len(pending) == 1
    assert pending[0].file_id == f2_id
    assert len(all_reqs) == 2


def test_get_pending_for_file():
    db = TestingSessionLocal()
    f = make_file(db)
    req = create_approval_request(db, file_id=f.id)
    found = get_pending_for_file(db, file_id=f.id)
    assert found is not None
    assert found.id == req.id
    approve_request(db, id=req.id, reviewer_id=1)
    not_found = get_pending_for_file(db, file_id=f.id)
    db.close()
    assert not_found is None


# Append to backend/tests/test_approval_crud.py
from unittest.mock import patch, MagicMock
from pathlib import Path


def _make_watch_dir_with_flag(db, require_approval: bool, path: str):
    wd = WatchDirectory(
        name=f"sync_test_{path.replace('/', '_')}",
        fs_path=path,
        require_approval=require_approval,
    )
    db.add(wd)
    db.flush()
    folder = Folder(name="root", fs_path=path, watch_dir_id=wd.id)
    db.add(folder)
    db.flush()
    db.commit()
    return wd, folder


def test_sync_creates_approval_when_required():
    from app.watcher.scanner import _process_file_entry
    from app.crud.approval import get_pending_for_file

    db = TestingSessionLocal()
    wd, folder = _make_watch_dir_with_flag(db, require_approval=True, path="/mnt/sync_approval")

    mock_path = MagicMock(spec=Path)
    mock_path.name = "sync_test.pdf"
    mock_path.__str__ = lambda self: "/mnt/sync_approval/sync_test.pdf"
    mock_path.suffix = ".pdf"
    mock_stat = MagicMock()
    mock_stat.st_size = 1024
    mock_stat.st_mtime = 1700000000.0
    mock_path.stat.return_value = mock_stat

    stats = {"new": 0, "updated": 0, "unchanged": 0, "errors": 0}

    with patch("app.watcher.scanner.compute_file_hash", return_value="abc123"), \
         patch("app.tasks.process_document.process_document.delay") as mock_delay:
        _process_file_entry(db, mock_path, folder, stats, wd)

    new_file = db.query(File).filter(File.fs_path == "/mnt/sync_approval/sync_test.pdf").first()
    assert new_file is not None
    file_id = new_file.id
    approval = get_pending_for_file(db, file_id)
    db.close()

    assert stats["new"] == 1
    assert approval is not None
    mock_delay.assert_not_called()


def test_sync_processes_directly_when_not_required():
    from app.watcher.scanner import _process_file_entry
    from app.crud.approval import get_pending_for_file

    db = TestingSessionLocal()
    wd, folder = _make_watch_dir_with_flag(db, require_approval=False, path="/mnt/sync_direct")

    mock_path = MagicMock(spec=Path)
    mock_path.name = "direct_test.pdf"
    mock_path.__str__ = lambda self: "/mnt/sync_direct/direct_test.pdf"
    mock_path.suffix = ".pdf"
    mock_stat = MagicMock()
    mock_stat.st_size = 512
    mock_stat.st_mtime = 1700000000.0
    mock_path.stat.return_value = mock_stat

    stats = {"new": 0, "updated": 0, "unchanged": 0, "errors": 0}

    with patch("app.watcher.scanner.compute_file_hash", return_value="def456"), \
         patch("app.tasks.process_document.process_document.delay") as mock_delay:
        _process_file_entry(db, mock_path, folder, stats, wd)

    new_file = db.query(File).filter(File.fs_path == "/mnt/sync_direct/direct_test.pdf").first()
    assert new_file is not None
    file_id = new_file.id
    approval = get_pending_for_file(db, file_id)
    db.close()

    assert stats["new"] == 1
    assert approval is None
    mock_delay.assert_called_once_with(file_id)
