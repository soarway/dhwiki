# backend/tests/test_api_keys.py
"""
Tests for API key management endpoints and dual-auth dependency.
Run: pytest tests/test_api_keys.py -v
"""
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime
from fastapi.testclient import TestClient

from app.main import app
from app.core.deps import get_current_user, get_current_user_or_api_key


@pytest.fixture()
def auth_client():
    """Client with standard JWT auth mocked."""
    from app.models.user import User

    fake_user = MagicMock(spec=User)
    fake_user.id = 5
    fake_user.username = "devuser"
    fake_user.status = True
    fake_user.roles = []

    app.dependency_overrides[get_current_user] = lambda: fake_user
    yield TestClient(app), fake_user
    app.dependency_overrides.clear()


# ── POST /api-keys ────────────────────────────────────────────────────────────

@patch("app.api.api_keys.create_api_key")
def test_create_api_key(mock_create, auth_client):
    client, fake_user = auth_client
    mock_key = MagicMock()
    mock_key.id = 1
    mock_key.name = "My Integration"
    mock_key.key = "a" * 64
    mock_key.owner_id = fake_user.id
    mock_key.is_active = True
    mock_key.created_at = datetime(2026, 4, 21)
    mock_key.last_used_at = None
    mock_create.return_value = mock_key

    resp = client.post(
        "/api-keys",
        json={"name": "My Integration"},
        headers={"Authorization": "Bearer faketoken"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["key"] == "a" * 64
    assert body["name"] == "My Integration"


# ── GET /api-keys ─────────────────────────────────────────────────────────────

@patch("app.api.api_keys.list_api_keys_for_owner")
def test_list_api_keys(mock_list, auth_client):
    client, fake_user = auth_client
    mock_key = MagicMock()
    mock_key.id = 1
    mock_key.name = "Key A"
    mock_key.key = "b" * 64
    mock_key.owner_id = fake_user.id
    mock_key.is_active = True
    mock_key.created_at = datetime(2026, 4, 21)
    mock_key.last_used_at = None
    mock_list.return_value = [mock_key]

    resp = client.get("/api-keys", headers={"Authorization": "Bearer faketoken"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["key_preview"] == "b" * 8 + "..."
    assert "key" not in data[0]  # full key not exposed in list


# ── DELETE /api-keys/{id} ─────────────────────────────────────────────────────

@patch("app.api.api_keys.delete_api_key")
def test_delete_api_key_success(mock_delete, auth_client):
    client, _ = auth_client
    mock_delete.return_value = True
    resp = client.delete("/api-keys/1", headers={"Authorization": "Bearer faketoken"})
    assert resp.status_code == 204


@patch("app.api.api_keys.delete_api_key")
def test_delete_api_key_not_found(mock_delete, auth_client):
    client, _ = auth_client
    mock_delete.return_value = False
    resp = client.delete("/api-keys/999", headers={"Authorization": "Bearer faketoken"})
    assert resp.status_code == 404


# ── Dual-auth dependency tests ─────────────────────────────────────────────────

def test_dual_auth_rejects_no_credentials():
    """Without any auth header, dual-auth must raise 401."""
    client = TestClient(app)
    resp = client.post("/chat/conversations", json={"title": "test"})
    assert resp.status_code == 401


def test_dual_auth_accepts_via_override():
    """Test that get_current_user_or_api_key can be overridden (used by other tests as pattern)."""
    from app.models.user import User

    fake_user = MagicMock(spec=User)
    fake_user.id = 7
    fake_user.username = "api_user"
    fake_user.status = True
    fake_user.roles = []

    app.dependency_overrides[get_current_user_or_api_key] = lambda: fake_user
    try:
        client = TestClient(app)
        with patch("app.api.chat.list_conversations", return_value=[]):
            resp = client.get("/chat/conversations")
            assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
