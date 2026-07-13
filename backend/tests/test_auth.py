def test_login_success(client):
    response = client.post("/auth/login", json={
        "username": "admin",
        "password": "password123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client):
    response = client.post("/auth/login", json={
        "username": "admin",
        "password": "wrongpassword"
    })
    assert response.status_code == 401


def test_get_current_user(client, admin_token):
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    assert response.json()["username"] == "admin"


def test_get_current_user_no_token(client):
    response = client.get("/auth/me")
    assert response.status_code == 401  # HTTPBearer(auto_error=False) + explicit 401


def test_refresh_token_cannot_be_used_as_access_token(client):
    """refresh token 不能作为 Bearer access token 使用"""
    login_r = client.post("/auth/login", json={"username": "admin", "password": "password123"})
    refresh_token = login_r.json()["refresh_token"]
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {refresh_token}"})
    assert response.status_code == 401


def test_access_token_cannot_be_used_as_refresh_token(client):
    """access token 不能作为 refresh token 使用"""
    login_r = client.post("/auth/login", json={"username": "admin", "password": "password123"})
    access_token = login_r.json()["access_token"]
    response = client.post("/auth/refresh", json={"refresh_token": access_token})
    assert response.status_code == 401


def test_disabled_user_cannot_login(client):
    """禁用用户无法登录"""
    from sqlalchemy.orm import Session
    from tests.conftest import TestingSessionLocal
    from app.models.user import User as UserModel
    db: Session = TestingSessionLocal()
    user = db.query(UserModel).filter(UserModel.username == "admin").first()
    user.status = False
    db.commit()
    db.close()
    response = client.post("/auth/login", json={"username": "admin", "password": "password123"})
    assert response.status_code == 401
