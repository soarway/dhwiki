import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.models.user import User
from app.models.role import Role
from app.models.user import UserRole
from app.core.security import get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite://"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    # 创建系统角色
    roles = [
        Role(name="super_admin", description="超级管理员", is_system=True),
        Role(name="dept_admin", description="部门管理员", is_system=True),
        Role(name="member", description="普通成员", is_system=True),
    ]
    db.add_all(roles)
    db.flush()
    # 创建管理员用户
    admin = User(
        username="admin",
        email="admin@test.com",
        real_name="管理员",
        password_hash=get_password_hash("password123"),
        status=True,
    )
    db.add(admin)
    db.flush()
    # 给管理员分配 super_admin 角色
    super_role = db.query(Role).filter(Role.name == "super_admin").first()
    db.add(UserRole(user_id=admin.id, role_id=super_role.id))
    db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_token(client):
    r = client.post("/auth/login", json={"username": "admin", "password": "password123"})
    return r.json()["access_token"]
