# backend/tests/test_crawl_api.py
"""
Tests for URL crawl API and Celery task.
Run: pytest tests/test_crawl_api.py -v
"""
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.tasks.crawl_url import _fetch_url, _split_text


# ── Unit tests for helpers ────────────────────────────────────────────────────

def test_split_text_basic():
    text = "A" * 1200
    chunks = _split_text(text, chunk_size=500, overlap=50)
    assert len(chunks) >= 2
    for chunk in chunks:
        assert len(chunk) <= 500


def test_split_text_short():
    text = "Short text."
    chunks = _split_text(text, chunk_size=500)
    assert chunks == ["Short text."]


def test_split_text_empty():
    chunks = _split_text("")
    assert chunks == []


@patch("httpx.Client")
def test_fetch_url_success(mock_client_cls):
    html = "<html><head><title>Test Page</title></head><body><p>Hello world</p></body></html>"
    mock_resp = MagicMock()
    mock_resp.text = html
    mock_resp.raise_for_status = MagicMock()
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.return_value = mock_resp
    mock_client_cls.return_value = mock_client

    title, body = _fetch_url("https://example.com")
    assert title == "Test Page"
    assert "Hello world" in body


@patch("httpx.Client")
def test_fetch_url_no_title(mock_client_cls):
    html = "<html><body><p>No title here</p></body></html>"
    mock_resp = MagicMock()
    mock_resp.text = html
    mock_resp.raise_for_status = MagicMock()
    mock_client = MagicMock()
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    mock_client.get.return_value = mock_resp
    mock_client_cls.return_value = mock_client

    title, body = _fetch_url("https://example.com")
    assert title == "https://example.com"


# ── Celery task unit test ─────────────────────────────────────────────────────

@patch("app.tasks.crawl_url.insert_chunks")
@patch("app.tasks.crawl_url.index_chunks")
@patch("app.tasks.crawl_url.embed_texts")
@patch("app.tasks.crawl_url._fetch_url")
@patch("app.tasks.crawl_url.SessionLocal")
def test_crawl_url_task_success(
    mock_session_local, mock_fetch, mock_embed, mock_index, mock_insert
):
    # Setup mocks
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db

    mock_fetch.return_value = ("My Page", "word " * 200)
    mock_embed.side_effect = lambda texts: [[0.1] * 1024] * len(texts)
    mock_insert.return_value = None
    mock_index.return_value = None

    from app.tasks.crawl_url import crawl_url
    # Call the underlying function directly (bypass Celery broker)
    crawl_url.run(job_id=42, url="https://example.com")

    mock_fetch.assert_called_once_with("https://example.com")
    assert mock_embed.called
    assert mock_insert.called
    assert mock_index.called


@patch("app.tasks.crawl_url.update_crawl_job_status")
@patch("app.tasks.crawl_url._fetch_url")
@patch("app.tasks.crawl_url.SessionLocal")
def test_crawl_url_task_fetch_failure(mock_session_local, mock_fetch, mock_update_status):
    import httpx
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db
    mock_fetch.side_effect = httpx.ConnectError("refused")

    from app.tasks.crawl_url import crawl_url, CrawlStatus
    crawl_url.run(job_id=99, url="https://bad.url")

    # Verify status was set to failed with an error message
    from unittest.mock import ANY
    mock_update_status.assert_any_call(mock_db, 99, CrawlStatus.failed, error=ANY)


@patch("app.tasks.crawl_url.update_crawl_job_status")
@patch("app.tasks.crawl_url._fetch_url")
@patch("app.tasks.crawl_url.SessionLocal")
def test_crawl_url_task_empty_text(mock_session_local, mock_fetch, mock_update_status):
    """When page has no extractable text, job should be marked failed."""
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db
    mock_fetch.return_value = ("Empty Page", "   ")  # whitespace only → _split_text returns []

    from app.tasks.crawl_url import crawl_url, CrawlStatus
    crawl_url.run(job_id=55, url="https://empty.page")

    from unittest.mock import ANY
    mock_update_status.assert_any_call(mock_db, 55, CrawlStatus.failed, error=ANY)


# ── API integration tests (with mocked auth + Celery) ────────────────────────

@pytest.fixture()
def super_admin_client():
    """Return a TestClient with mocked super_admin auth via dependency_overrides."""
    from app.models.user import User
    from app.core.deps import require_super_admin

    fake_user = MagicMock(spec=User)
    fake_user.id = 1
    fake_user.username = "admin"
    fake_user.roles = [MagicMock(role=MagicMock(name="super_admin"))]

    app.dependency_overrides[require_super_admin] = lambda: fake_user
    yield TestClient(app)
    app.dependency_overrides.pop(require_super_admin, None)


@patch("app.api.crawl.crawl_url")
@patch("app.api.crawl.create_crawl_job")
def test_post_crawl_enqueues_job(mock_create_job, mock_task, super_admin_client):
    from datetime import datetime
    mock_job = MagicMock()
    mock_job.id = 7
    mock_job.url = "https://example.com"
    mock_job.title = None
    mock_job.status = "pending"
    mock_job.error = None
    mock_job.chunk_count = 0
    mock_job.created_by = 1
    mock_job.created_at = datetime.utcnow()
    mock_create_job.return_value = mock_job

    resp = super_admin_client.post("/crawl", json={"url": "https://example.com"})
    assert resp.status_code == 202
    mock_task.delay.assert_called_once_with(7, "https://example.com")


@patch("app.api.crawl.list_crawl_jobs")
def test_get_crawl_jobs(mock_list, super_admin_client):
    mock_list.return_value = []
    resp = super_admin_client.get("/crawl")
    assert resp.status_code == 200
    assert resp.json() == []
