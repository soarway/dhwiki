def test_create_user(client, admin_token):
    response = client.post("/users/", json={
        "username": "zhang_san",
        "real_name": "张三",
        "email": "zhangsan@test.com",
        "password": "pass123456",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 201
    assert response.json()["username"] == "zhang_san"


def test_list_users(client, admin_token):
    response = client.get("/users/", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    assert isinstance(response.json()["items"], list)
    assert response.json()["total"] >= 1


def test_get_user(client, admin_token):
    create = client.post("/users/", json={
        "username": "li_si", "real_name": "李四",
        "email": "lisi@test.com", "password": "pass123456",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    user_id = create.json()["id"]
    response = client.get(f"/users/{user_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    assert response.json()["real_name"] == "李四"


def test_disable_user(client, admin_token):
    create = client.post("/users/", json={
        "username": "wang_wu", "real_name": "王五",
        "email": "wangwu@test.com", "password": "pass123456",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    user_id = create.json()["id"]
    response = client.patch(
        f"/users/{user_id}/status",
        json={"status": False},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == False


def test_duplicate_email(client, admin_token):
    """重复邮箱返回 400"""
    client.post("/users/", json={
        "username": "email_test1", "real_name": "用户1",
        "email": "same@test.com", "password": "pass123456",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    response = client.post("/users/", json={
        "username": "email_test2", "real_name": "用户2",
        "email": "same@test.com", "password": "pass123456",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 400


def test_duplicate_username(client, admin_token):
    client.post("/users/", json={
        "username": "dup_user", "real_name": "重复",
        "email": "dup1@test.com", "password": "pass123456",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    response = client.post("/users/", json={
        "username": "dup_user", "real_name": "重复2",
        "email": "dup2@test.com", "password": "pass123456",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 400
