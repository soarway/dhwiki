def test_list_roles_includes_system_roles(client, admin_token):
    response = client.get("/roles/", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    names = [r["name"] for r in response.json()]
    assert "super_admin" in names


def test_create_custom_role(client, admin_token):
    response = client.post("/roles/", json={
        "name": "finance_reader",
        "description": "财务文档只读角色",
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 201
    assert response.json()["is_system"] == False


def test_cannot_delete_system_role(client, admin_token):
    roles = client.get("/roles/", headers={"Authorization": f"Bearer {admin_token}"}).json()
    system_role = next(r for r in roles if r["is_system"])
    response = client.delete(
        f"/roles/{system_role['id']}",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 400
