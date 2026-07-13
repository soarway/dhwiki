import pytest
from app.models.file import File, ProcessStatus


def test_list_files_empty(client, admin_token):
    response = client.get("/files/", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    assert response.json()["total"] == 0


def test_list_folders_empty(client, admin_token):
    response = client.get("/files/folders", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_nonexistent_file_404(client, admin_token):
    response = client.get("/files/9999", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 404


def test_create_watch_dir_invalid_path(client, admin_token):
    response = client.post(
        "/watch-dirs/",
        json={"name": "测试目录", "fs_path": "/nonexistent/path/xyz"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400


def test_list_files_with_data(client, admin_token):
    """创建一条文件记录后，列表接口能返回"""
    from tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    file_record = File(
        name="report.pdf",
        fs_path="/mnt/nas/report.pdf",
        file_type="pdf",
        file_size=1024,
        process_status=ProcessStatus.completed,
        chunk_count=5,
    )
    db.add(file_record)
    db.commit()
    db.close()

    response = client.get("/files/", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["name"] == "report.pdf"
