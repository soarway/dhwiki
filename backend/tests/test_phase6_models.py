# backend/tests/test_phase6_models.py
from tests.conftest import TestingSessionLocal
from app.models.user import User
from datetime import datetime


def _make_user(db, username: str) -> User:
    u = User(username=username, real_name="Test", email=f"{username}@test.com",
             password_hash="x", created_at=datetime.utcnow())
    db.add(u)
    db.commit()
    return u


def test_create_crawl_job():
    from app.crud.crawl import create_crawl_job, update_crawl_job_status
    from app.models.crawl import CrawlStatus
    db = TestingSessionLocal()
    job = create_crawl_job(db, url="https://example.com", created_by=None)
    assert job.id is not None
    assert job.status == CrawlStatus.pending
    updated = update_crawl_job_status(db, job.id, CrawlStatus.completed, title="Test", chunk_count=3)
    db.close()
    assert updated.status == CrawlStatus.completed
    assert updated.title == "Test"
    assert updated.chunk_count == 3


def test_create_query_log():
    from app.crud.analytics import create_query_log, get_stats
    import json
    db = TestingSessionLocal()
    log = create_query_log(db, None, None, "Test query", "Test answer", [{"doc_id": 1}], 250)
    stats = get_stats(db)
    db.close()
    assert log.id is not None
    assert log.response_ms == 250
    assert json.loads(log.sources_json)[0]["doc_id"] == 1
    assert stats["total_queries"] == 1
    assert stats["avg_response_ms"] == 250.0


def test_create_and_delete_api_key():
    from app.crud.api_key import create_api_key, get_api_key_by_value, delete_api_key
    db = TestingSessionLocal()
    user = _make_user(db, "keyuser1")
    key = create_api_key(db, name="My App", owner_id=user.id)
    assert len(key.key) == 64
    found = get_api_key_by_value(db, key.key)
    assert found is not None
    result = delete_api_key(db, key.id, owner_id=user.id)
    db.close()
    assert result is True


def test_delete_api_key_wrong_owner():
    from app.crud.api_key import create_api_key, delete_api_key
    db = TestingSessionLocal()
    u1 = _make_user(db, "owner_a")
    u2 = _make_user(db, "owner_b")
    key = create_api_key(db, name="Key", owner_id=u1.id)
    result = delete_api_key(db, key.id, owner_id=u2.id)
    db.close()
    assert result is False
