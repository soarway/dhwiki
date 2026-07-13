# backend/tests/test_permission_crud.py
from app.models.permission import Permission, PermissionLevel, ResourceType, SubjectType
from app.models.file import File, Folder, WatchDirectory
from tests.conftest import TestingSessionLocal


def make_folder_tree(db):
    """建立: watch_dir -> root_folder -> sub_folder; sub_folder 下有 file"""
    wd = WatchDirectory(name="test", fs_path="/mnt/test")
    db.add(wd)
    db.flush()
    root = Folder(name="root", fs_path="/mnt/test", watch_dir_id=wd.id)
    db.add(root)
    db.flush()
    sub = Folder(name="sub", fs_path="/mnt/test/sub", parent_id=root.id, watch_dir_id=wd.id)
    db.add(sub)
    db.flush()
    f = File(name="doc.pdf", fs_path="/mnt/test/sub/doc.pdf",
             file_type="pdf", file_size=100, folder_id=sub.id)
    db.add(f)
    db.commit()
    return root, sub, f


def test_grant_and_get_permission():
    from app.crud.permission import grant_permission, get_permissions_for_resource
    db = TestingSessionLocal()
    root, sub, f = make_folder_tree(db)
    grant_permission(db, ResourceType.file, f.id, SubjectType.user, 1,
                     PermissionLevel.view, created_by=1)
    perms = get_permissions_for_resource(db, ResourceType.file, f.id)
    db.close()
    assert len(perms) == 1
    assert perms[0].subject_id == 1
    assert perms[0].permission_level == PermissionLevel.view


def test_grant_permission_upsert():
    """重复授权相同主体应更新权限级别，不重复创建"""
    from app.crud.permission import grant_permission, get_permissions_for_resource
    db = TestingSessionLocal()
    root, sub, f = make_folder_tree(db)
    grant_permission(db, ResourceType.file, f.id, SubjectType.user, 1,
                     PermissionLevel.view, created_by=1)
    grant_permission(db, ResourceType.file, f.id, SubjectType.user, 1,
                     PermissionLevel.download, created_by=1)
    perms = get_permissions_for_resource(db, ResourceType.file, f.id)
    db.close()
    assert len(perms) == 1
    assert perms[0].permission_level == PermissionLevel.download


def test_revoke_permission():
    from app.crud.permission import grant_permission, revoke_permission, get_permissions_for_resource
    db = TestingSessionLocal()
    root, sub, f = make_folder_tree(db)
    perm = grant_permission(db, ResourceType.file, f.id, SubjectType.user, 1,
                            PermissionLevel.view, created_by=1)
    revoke_permission(db, perm.id)
    perms = get_permissions_for_resource(db, ResourceType.file, f.id)
    db.close()
    assert len(perms) == 0


def test_resolve_file_permissions_from_parent_folder():
    """文件应继承父文件夹的权限"""
    from app.crud.permission import grant_permission, resolve_file_allowed_ids
    db = TestingSessionLocal()
    root, sub, f = make_folder_tree(db)
    grant_permission(db, ResourceType.folder, sub.id, SubjectType.user, 5,
                     PermissionLevel.view, created_by=1)
    result = resolve_file_allowed_ids(db, f.id)
    db.close()
    assert 5 in result["allowed_user_ids"]
    assert result["is_public"] is False


def test_resolve_file_permissions_from_grandparent():
    """文件应递归继承祖先文件夹的权限"""
    from app.crud.permission import grant_permission, resolve_file_allowed_ids
    db = TestingSessionLocal()
    root, sub, f = make_folder_tree(db)
    grant_permission(db, ResourceType.folder, root.id, SubjectType.department, 3,
                     PermissionLevel.view, created_by=1)
    result = resolve_file_allowed_ids(db, f.id)
    db.close()
    assert 3 in result["allowed_dept_ids"]


def test_resolve_merges_file_and_folder_permissions():
    """文件自身权限和文件夹权限都被合并收集"""
    from app.crud.permission import grant_permission, resolve_file_allowed_ids
    db = TestingSessionLocal()
    root, sub, f = make_folder_tree(db)
    grant_permission(db, ResourceType.folder, sub.id, SubjectType.user, 5,
                     PermissionLevel.view, created_by=1)
    grant_permission(db, ResourceType.file, f.id, SubjectType.user, 7,
                     PermissionLevel.download, created_by=1)
    result = resolve_file_allowed_ids(db, f.id)
    db.close()
    assert 5 in result["allowed_user_ids"]
    assert 7 in result["allowed_user_ids"]


def test_is_public_when_member_role_granted():
    """给 member 角色授权时，is_public=True"""
    from app.crud.permission import grant_permission, resolve_file_allowed_ids
    from app.models.role import Role
    db = TestingSessionLocal()
    root, sub, f = make_folder_tree(db)
    member_role = db.query(Role).filter(Role.name == "member").first()
    grant_permission(db, ResourceType.file, f.id, SubjectType.role, member_role.id,
                     PermissionLevel.view, created_by=1)
    result = resolve_file_allowed_ids(db, f.id)
    db.close()
    assert result["is_public"] is True
