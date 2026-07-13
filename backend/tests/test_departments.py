def test_create_root_department(client, admin_token):
    response = client.post("/departments/", json={
        "name": "技术部",
        "parent_id": None,
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 201
    assert response.json()["name"] == "技术部"
    assert response.json()["parent_id"] is None


def test_create_child_department(client, admin_token):
    parent = client.post("/departments/", json={"name": "研发部", "parent_id": None},
                         headers={"Authorization": f"Bearer {admin_token}"}).json()
    response = client.post("/departments/", json={
        "name": "前端组",
        "parent_id": parent["id"],
    }, headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 201
    assert response.json()["parent_id"] == parent["id"]


def test_list_departments_tree(client, admin_token):
    client.post("/departments/", json={"name": "人事部", "parent_id": None},
                headers={"Authorization": f"Bearer {admin_token}"})
    response = client.get("/departments/tree", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    assert isinstance(response.json(), list)
