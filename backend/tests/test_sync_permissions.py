# backend/tests/test_sync_permissions.py
import pytest
from unittest.mock import patch
from app.models.file import File, Folder, WatchDirectory, ProcessStatus
from app.models.permission import Permission, ResourceType, SubjectType, PermissionLevel
from tests.conftest import TestingSessionLocal


def make_completed_file(db, tmp_path) -> File:
    test_file = tmp_path / "report.txt"
    test_file.write_text("内容")
    wd = WatchDirectory(name="test", fs_path=str(tmp_path))
    db.add(wd)
    db.flush()
    folder = Folder(name="root", fs_path=str(tmp_path), watch_dir_id=wd.id)
    db.add(folder)
    db.flush()
    f = File(
        name="report.txt",
        fs_path=str(test_file),
        file_type="txt",
        file_size=10,
        process_status=ProcessStatus.completed,
        chunk_count=1,
        folder_id=folder.id,
    )
    db.add(f)
    db.commit()
    return f


def test_sync_updates_milvus_with_new_permissions(tmp_path):
    """权限同步任务应删除旧分块并重新插入带新权限的分块"""
    db = TestingSessionLocal()
    f = make_completed_file(db, tmp_path)
    db.add(Permission(
        resource_type=ResourceType.file,
        resource_id=f.id,
        subject_type=SubjectType.user,
        subject_id=9,
        permission_level=PermissionLevel.view,
    ))
    db.commit()
    file_id = f.id
    db.close()

    mock_chunks = [{
        "chunk_id": f"{file_id}_0_abc",
        "doc_id": file_id,
        "content": "内容",
        "embedding": [0.1] * 1024,
    }]

    with (
        patch("app.tasks.sync_permissions.SessionLocal", TestingSessionLocal),
        patch("app.tasks.sync_permissions.delete_by_doc_id") as mock_delete,
        patch("app.tasks.sync_permissions.query_chunks_by_doc_id", return_value=mock_chunks),
        patch("app.tasks.sync_permissions.insert_chunks") as mock_insert,
    ):
        from app.tasks.sync_permissions import sync_file_permissions_sync
        sync_file_permissions_sync(file_id)

    mock_delete.assert_called_once_with(file_id)
    mock_insert.assert_called_once()
    inserted = mock_insert.call_args[0][0]
    assert len(inserted) == 1
    assert 9 in inserted[0]["allowed_user_ids"]
    assert inserted[0]["is_public"] is False


def test_sync_skips_non_completed_files(tmp_path):
    """未完成处理的文件不执行同步"""
    db = TestingSessionLocal()
    wd = WatchDirectory(name="t", fs_path=str(tmp_path))
    db.add(wd)
    db.flush()
    folder = Folder(name="r", fs_path=str(tmp_path), watch_dir_id=wd.id)
    db.add(folder)
    db.flush()
    f = File(
        name="p.txt", fs_path=str(tmp_path / "p.txt"),
        file_type="txt", file_size=0,
        process_status=ProcessStatus.pending,
        folder_id=folder.id,
    )
    db.add(f)
    db.commit()
    file_id = f.id
    db.close()

    with (
        patch("app.tasks.sync_permissions.SessionLocal", TestingSessionLocal),
        patch("app.tasks.sync_permissions.delete_by_doc_id") as mock_delete,
        patch("app.tasks.sync_permissions.query_chunks_by_doc_id", return_value=[]),
        patch("app.tasks.sync_permissions.insert_chunks") as mock_insert,
    ):
        from app.tasks.sync_permissions import sync_file_permissions_sync
        sync_file_permissions_sync(file_id)

    mock_delete.assert_not_called()
    mock_insert.assert_not_called()
