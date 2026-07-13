# backend/tests/test_approval_api.py
from unittest.mock import patch

from app.crud.approval import create_approval_request
from app.models.file import File, Folder, WatchDirectory, ProcessStatus
from tests.conftest import TestingSessionLocal


def make_pending_approval(db):
    wd = WatchDirectory(name="api_test_wd", fs_path="/mnt/api_approval_test")
    db.add(wd)
    db.flush()
    folder = Folder(name="root", fs_path="/mnt/api_approval_test", watch_dir_id=wd.id)
    db.add(folder)
    db.flush()
    f = File(
        name="report.pdf",
        fs_path="/mnt/api_approval_test/report.pdf",
        file_type="pdf",
        file_size=2048,
        folder_id=folder.id,
    )
    db.add(f)
    db.commit()
    req = create_approval_request(db, file_id=f.id, requester_note="Auto-discovered")
    file_id = f.id
    req_id = req.id
    db.close()
    return req_id, file_id


def test_list_approvals_admin_only(client, admin_token):
    db = TestingSessionLocal()
    make_pending_approval(db)
    resp = client.get("/approvals/", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["status"] == "pending"


def test_list_approvals_unauthorized_returns_403(client):
    resp = client.get("/approvals/")
    assert resp.status_code == 403


def test_approve_triggers_processing(client, admin_token):
    db = TestingSessionLocal()
    req_id, file_id = make_pending_approval(db)
    with patch("app.api.approval.process_document.delay") as mock_delay:
        resp = client.post(
            f"/approvals/{req_id}/approve",
            json={"note": "Approved by admin"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "approved"
    assert data["reviewer_note"] == "Approved by admin"
    mock_delay.assert_called_once_with(file_id)


def test_reject_marks_file_failed(client, admin_token):
    db = TestingSessionLocal()
    req_id, file_id = make_pending_approval(db)
    resp = client.post(
        f"/approvals/{req_id}/reject",
        json={"note": "Does not meet policy"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "rejected"
    db2 = TestingSessionLocal()
    file_record = db2.query(File).filter(File.id == file_id).first()
    db2.close()
    assert file_record.process_status == ProcessStatus.failed


def test_approve_nonexistent_returns_404(client, admin_token):
    resp = client.post(
        "/approvals/99999/approve",
        json={},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_approve_already_processed_returns_400(client, admin_token):
    db = TestingSessionLocal()
    req_id, _ = make_pending_approval(db)
    with patch("app.api.approval.process_document.delay"):
        client.post(
            f"/approvals/{req_id}/approve",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    with patch("app.api.approval.process_document.delay"):
        resp = client.post(
            f"/approvals/{req_id}/approve",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 400
