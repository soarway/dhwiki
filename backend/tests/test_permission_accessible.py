# backend/tests/test_permission_accessible.py
from app.core.database import Base
from app.models.file import File, Folder, WatchDirectory
from app.models.permission import Permission, ResourceType, SubjectType, PermissionLevel
from tests.conftest import TestingSessionLocal


def make_folder_with_file(db):
    wd = WatchDirectory(name="wd", fs_path="/mnt")
    db.add(wd)
    db.flush()
    folder = Folder(name="root", fs_path="/mnt", watch_dir_id=wd.id)
    db.add(folder)
    db.flush()
    f = File(name="doc.txt", fs_path="/mnt/doc.txt",
             file_type="txt", file_size=10, folder_id=folder.id)
    db.add(f)
    db.commit()
    return folder, f


def test_super_admin_returns_none():
    from app.crud.permission import get_accessible_doc_ids
    db = TestingSessionLocal()
    result = get_accessible_doc_ids(db, user_id=1, dept_ids=[], role_ids=[], is_super_admin=True)
    db.close()
    assert result is None


def test_user_with_direct_file_permission():
    from app.crud.permission import get_accessible_doc_ids
    db = TestingSessionLocal()
    _, f = make_folder_with_file(db)
    file_id = f.id
    db.add(Permission(
        resource_type=ResourceType.file, resource_id=file_id,
        subject_type=SubjectType.user, subject_id=5,
        permission_level=PermissionLevel.view,
    ))
    db.commit()
    result = get_accessible_doc_ids(db, user_id=5, dept_ids=[], role_ids=[], is_super_admin=False)
    db.close()
    assert file_id in result


def test_user_with_folder_permission_gets_child_files():
    from app.crud.permission import get_accessible_doc_ids
    db = TestingSessionLocal()
    folder, f = make_folder_with_file(db)
    db.add(Permission(
        resource_type=ResourceType.folder, resource_id=folder.id,
        subject_type=SubjectType.user, subject_id=7,
        permission_level=PermissionLevel.view,
    ))
    db.commit()
    result = get_accessible_doc_ids(db, user_id=7, dept_ids=[], role_ids=[], is_super_admin=False)
    db.close()
    assert f.id in result


def test_no_permission_returns_empty_list():
    from app.crud.permission import get_accessible_doc_ids
    db = TestingSessionLocal()
    make_folder_with_file(db)
    result = get_accessible_doc_ids(db, user_id=99, dept_ids=[], role_ids=[], is_super_admin=False)
    db.close()
    assert result == []
