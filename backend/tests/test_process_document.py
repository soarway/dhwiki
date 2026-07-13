# backend/tests/test_process_document.py
import pytest
from unittest.mock import patch, MagicMock
from tests.conftest import TestingSessionLocal, engine
from app.core.database import Base
from app.models.file import File, Folder, WatchDirectory, ProcessStatus


@pytest.fixture(autouse=True)
def setup_file_tables():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def make_test_file(db, tmp_path) -> File:
    """在临时目录创建测试文件并写入DB"""
    test_file = tmp_path / "test.txt"
    test_file.write_text("这是测试文档内容。第一段。\n\n第二段内容。更多文字。")

    watch_dir = WatchDirectory(name="test", fs_path=str(tmp_path))
    db.add(watch_dir)
    db.flush()

    folder = Folder(name="root", fs_path=str(tmp_path), watch_dir_id=watch_dir.id)
    db.add(folder)
    db.flush()

    file_record = File(
        name="test.txt",
        folder_id=folder.id,
        fs_path=str(test_file),
        file_type="txt",
        file_size=test_file.stat().st_size,
        process_status=ProcessStatus.pending,
    )
    db.add(file_record)
    db.commit()
    return file_record


def test_process_document_success(tmp_path):
    """成功处理文档后状态变为 completed"""
    db = TestingSessionLocal()
    file_record = make_test_file(db, tmp_path)
    file_id = file_record.id
    db.close()

    def fake_embed(texts, **kwargs):
        return [[0.1] * 1024] * len(texts)

    with (
        patch("app.tasks.process_document.SessionLocal", TestingSessionLocal),
        patch("app.tasks.process_document.insert_chunks") as mock_milvus,
        patch("app.tasks.process_document.index_chunks") as mock_meili,
        patch("app.tasks.process_document.embed_texts", side_effect=fake_embed),
    ):
        from app.tasks.process_document import process_document_sync
        process_document_sync(file_id)

    db = TestingSessionLocal()
    updated = db.query(File).filter(File.id == file_id).first()
    db.close()

    assert updated.process_status == ProcessStatus.completed
    assert updated.chunk_count > 0
    mock_milvus.assert_called_once()
    mock_meili.assert_called_once()


def test_process_document_file_not_found():
    """文件不存在时状态变为 failed"""
    db = TestingSessionLocal()
    file_record = File(
        name="ghost.txt",
        fs_path="/nonexistent/ghost.txt",
        file_type="txt",
        file_size=0,
        process_status=ProcessStatus.pending,
    )
    db.add(file_record)
    db.commit()
    file_id = file_record.id
    db.close()

    with patch("app.tasks.process_document.SessionLocal", TestingSessionLocal):
        from app.tasks.process_document import process_document_sync
        process_document_sync(file_id)

    db = TestingSessionLocal()
    updated = db.query(File).filter(File.id == file_id).first()
    db.close()
    assert updated.process_status == ProcessStatus.failed
    assert updated.process_error is not None


def test_process_document_uses_file_permissions(tmp_path):
    """处理后 Milvus 分块应携带文件的真实权限元数据"""
    from app.models.permission import Permission, ResourceType, SubjectType, PermissionLevel
    from app.core.database import Base
    from tests.conftest import engine
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    file_record = make_test_file(db, tmp_path)
    file_id = file_record.id
    perm = Permission(
        resource_type=ResourceType.file,
        resource_id=file_id,
        subject_type=SubjectType.user,
        subject_id=7,
        permission_level=PermissionLevel.view,
    )
    db.add(perm)
    db.commit()
    db.close()

    captured_chunks = []

    def fake_insert(chunks):
        captured_chunks.extend(chunks)

    def fake_embed(texts, **kwargs):
        return [[0.1] * 1024] * len(texts)

    with (
        patch("app.tasks.process_document.SessionLocal", TestingSessionLocal),
        patch("app.tasks.process_document.insert_chunks", side_effect=fake_insert),
        patch("app.tasks.process_document.index_chunks"),
        patch("app.tasks.process_document.embed_texts", side_effect=fake_embed),
    ):
        from app.tasks.process_document import process_document_sync
        process_document_sync(file_id)

    assert len(captured_chunks) > 0
    for chunk in captured_chunks:
        assert 7 in chunk["allowed_user_ids"]
        assert chunk["is_public"] is False
