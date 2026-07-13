# backend/tests/test_chat_api.py
from unittest.mock import patch
from tests.conftest import TestingSessionLocal


def test_create_conversation(client, admin_token):
    resp = client.post(
        "/chat/conversations",
        json={"title": "测试对话"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "测试对话"
    assert "id" in data
    assert "created_at" in data


def test_list_conversations_empty(client, admin_token):
    resp = client.get(
        "/chat/conversations",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_then_list_conversation(client, admin_token):
    client.post(
        "/chat/conversations",
        json={"title": "我的对话"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    resp = client.get(
        "/chat/conversations",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_get_messages_empty(client, admin_token):
    conv_resp = client.post(
        "/chat/conversations",
        json={},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    conv_id = conv_resp.json()["id"]
    resp = client.get(
        f"/chat/conversations/{conv_id}/messages",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_messages_wrong_conversation(client, admin_token):
    resp = client.get(
        "/chat/conversations/9999/messages",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_ask_non_streaming(client, admin_token):
    conv_resp = client.post(
        "/chat/conversations",
        json={},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    conv_id = conv_resp.json()["id"]

    mock_result = {
        "answer": "这是AI的回答",
        "sources": [{"doc_id": 1, "doc_name": "手册.pdf", "chunk_content": "...", "page": 1}],
        "response_ms": 300,
    }

    with patch("app.api.chat.ask", return_value=mock_result):
        resp = client.post(
            f"/chat/conversations/{conv_id}/ask",
            json={"query": "你好"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["answer"] == "这是AI的回答"
    assert len(data["sources"]) == 1


def test_ask_conversation_not_found(client, admin_token):
    resp = client.post(
        "/chat/conversations/9999/ask",
        json={"query": "测试"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 404


def test_unauthorized_request(client):
    resp = client.get("/chat/conversations")
    assert resp.status_code == 401  # HTTPBearer(auto_error=False) + explicit 401
