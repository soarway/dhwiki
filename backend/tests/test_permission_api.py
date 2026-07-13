# backend/tests/test_permission_api.py
from unittest.mock import patch
from app.models.file import File, Folder, WatchDirectory
from app.models.permission import Permission, ResourceType, SubjectType, PermissionLevel
from tests.conftest import TestingSessionLocal


def make_file(db) -> File:
    wd = WatchDirectory(name="test", fs_path="/mnt/test")
    db.add(wd)
    db.flush()
    folder = Folder(name="root", fs_path="/mnt/test", watch_dir_id=wd.id)
    db.add(folder)
    db.flush()
    f = File(name="doc.pdf", fs_path="/mnt/test/doc.pdf",
             file_type="pdf", file_size=100, folder_id=folder.id)
    db.add(f)
    db.commit()
    return f


def test_list_permissions_empty(client, admin_token):
    db = TestingSessionLocal()
    f = make_file(db)
    file_id = f.id
    db.close()
    resp = client.get(
        f"/permissions/?resource_type=file&resource_id={file_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_permission(client, admin_token):
    db = TestingSessionLocal()
    f = make_file(db)
    file_id = f.id
    db.close()
    with patch("app.tasks.sync_permissions.sync_file_permissions.delay"):
        resp = client.post(
            "/permissions/",
            json={
                "resource_type": "file",
                "resource_id": file_id,
                "subject_type": "user",
                "subject_id": 2,
                "permission_level": "view",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 201
    data = resp.json()
    assert data["subject_id"] == 2
    assert data["permission_level"] == "view"


def test_create_then_list_permission(client, admin_token):
    db = TestingSessionLocal()
    f = make_file(db)
    file_id = f.id
    db.close()
    with patch("app.tasks.sync_permissions.sync_file_permissions.delay"):
        client.post(
            "/permissions/",
            json={
                "resource_type": "file",
                "resource_id": file_id,
                "subject_type": "user",
                "subject_id": 3,
                "permission_level": "download",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    resp = client.get(
        f"/permissions/?resource_type=file&resource_id={file_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_delete_permission(client, admin_token):
    db = TestingSessionLocal()
    f = make_file(db)
    perm = Permission(
        resource_type=ResourceType.file,
        resource_id=f.id,
        subject_type=SubjectType.user,
        subject_id=5,
        permission_level=PermissionLevel.view,
    )
    db.add(perm)
    db.commit()
    perm_id = perm.id
    db.close()
    with patch("app.tasks.sync_permissions.sync_file_permissions.delay"):
        resp = client.delete(
            f"/permissions/{perm_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 204


def test_delete_nonexistent_permission(client, admin_token):
    resp = client.delete(
        "/permissions/9999",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404
