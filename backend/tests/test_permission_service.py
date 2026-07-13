# backend/tests/test_permission_service.py
import pytest
from app.models.role import Role
from app.models.user import User, UserDepartment, UserRole
from app.models.department import Department
from tests.conftest import TestingSessionLocal


def make_user_with_dept_and_role(db):
    dept = Department(name="Engineering", parent_id=None)
    db.add(dept)
    db.flush()
    role = Role(name="engineer", description="", is_system=False)
    db.add(role)
    db.flush()
    user = User(username="alice", email="alice@example.com",
                password_hash="hash", real_name="Alice")
    db.add(user)
    db.flush()
    db.add(UserDepartment(user_id=user.id, dept_id=dept.id, is_primary=True))
    db.add(UserRole(user_id=user.id, role_id=role.id))
    db.commit()
    db.refresh(user)
    return user, dept, role


def test_get_user_context_returns_ids():
    from app.services.permission_service import get_user_context
    db = TestingSessionLocal()
    user, dept, role = make_user_with_dept_and_role(db)
    ctx = get_user_context(db, user)
    # capture ids before closing session to avoid DetachedInstanceError
    user_id = user.id
    dept_id = dept.id
    role_id = role.id
    db.close()
    assert ctx["user_id"] == user_id
    assert dept_id in ctx["dept_ids"]
    assert role_id in ctx["role_ids"]
    assert ctx["is_super_admin"] is False


def test_super_admin_context():
    from app.services.permission_service import get_user_context
    db = TestingSessionLocal()
    admin = db.query(User).filter(User.username == "admin").first()
    ctx = get_user_context(db, admin)
    db.close()
    assert ctx["is_super_admin"] is True


def test_build_milvus_filter_normal_user():
    from app.services.permission_service import build_milvus_filter
    expr = build_milvus_filter(user_id=5, dept_ids=[2, 3], role_ids=[1], is_super_admin=False)
    assert expr is not None
    assert "5" in expr
    assert "is_public" in expr
    assert "2" in expr


def test_build_milvus_filter_super_admin_returns_none():
    from app.services.permission_service import build_milvus_filter
    result = build_milvus_filter(user_id=1, dept_ids=[], role_ids=[], is_super_admin=True)
    assert result is None


def test_build_milvus_filter_no_dept_no_role():
    from app.services.permission_service import build_milvus_filter
    expr = build_milvus_filter(user_id=99, dept_ids=[], role_ids=[], is_super_admin=False)
    assert "99" in expr
    assert "is_public" in expr
    # dept_ids empty → no dept filter
    assert "allowed_dept_ids" not in expr
