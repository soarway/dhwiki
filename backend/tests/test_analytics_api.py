# backend/tests/test_analytics_api.py
"""
Tests for analytics API.
Run: pytest tests/test_analytics_api.py -v
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.core.deps import require_super_admin


@pytest.fixture()
def admin_client():
    from app.models.user import User

    fake_user = MagicMock(spec=User)
    fake_user.id = 1
    fake_user.username = "admin"
    fake_user.roles = [MagicMock(role=MagicMock(name="super_admin"))]

    app.dependency_overrides[require_super_admin] = lambda: fake_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@patch("app.api.analytics.list_query_logs")
def test_get_queries_empty(mock_list, admin_client):
    mock_list.return_value = []
    resp = admin_client.get("/analytics/queries")
    assert resp.status_code == 200
    assert resp.json() == []


@patch("app.api.analytics.list_query_logs")
def test_get_queries_with_data(mock_list, admin_client):
    from datetime import datetime
    mock_log = MagicMock()
    mock_log.id = 1
    mock_log.user_id = 2
    mock_log.conversation_id = 3
    mock_log.query_text = "What is AI?"
    mock_log.answer_text = "AI is..."
    mock_log.response_ms = 400
    mock_log.created_at = datetime(2026, 4, 21, 10, 0, 0)
    mock_list.return_value = [mock_log]

    resp = admin_client.get("/analytics/queries")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["query_text"] == "What is AI?"
    assert data[0]["response_ms"] == 400


@patch("app.api.analytics.get_stats")
def test_get_stats(mock_stats, admin_client):
    mock_stats.return_value = {
        "total_queries": 42,
        "avg_response_ms": 310.5,
        "daily_counts": [{"date": "2026-04-21", "count": 10}],
    }
    resp = admin_client.get("/analytics/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_queries"] == 42
    assert body["avg_response_ms"] == 310.5
    assert len(body["daily_counts"]) == 1


def test_analytics_requires_super_admin():
    """Without any auth the endpoint should return 401/403."""
    client = TestClient(app)
    resp = client.get("/analytics/queries")
    assert resp.status_code in (401, 403)
