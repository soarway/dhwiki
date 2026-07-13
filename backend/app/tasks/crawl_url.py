# backend/app/tasks/crawl_url.py
import uuid
import logging
from typing import Optional

import httpx
from bs4 import BeautifulSoup

from app.celery_app import celery_app
from app.core.database import SessionLocal
from app.crud.crawl import update_crawl_job_status
from app.models.crawl import CrawlStatus
from app.services.doc_processor.embedder import embed_texts
from app.services.storage.milvus_client import insert_chunks
from app.services.storage.meili_client import index_chunks

logger = logging.getLogger(__name__)

CHUNK_SIZE = 500   # target characters per chunk
CHUNK_OVERLAP = 50  # characters of overlap between consecutive chunks


def _fetch_url(url: str) -> tuple[str, str]:
    """
    Fetch a URL synchronously with httpx (30 s timeout).
    Returns (title, body_text).
    Raises httpx.HTTPError on network/HTTP errors.
    """
    with httpx.Client(follow_redirects=True, timeout=30.0) as client:
        response = client.get(url)
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # Extract title
    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else url

    # Remove script/style noise before extracting body text
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    body_text = soup.get_text(separator=" ", strip=True)
    return title, body_text


def _split_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Split text into chunks of ~chunk_size characters with overlap.
    Tries to break on whitespace to avoid cutting mid-word.
    Always makes forward progress to avoid infinite loops.
    """
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        if end < len(text):
            # Find last whitespace within the window
            ws = text.rfind(" ", start, end)
            if ws > start:
                end = ws
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        # Always advance by at least 1 to prevent infinite loop
        next_start = end - overlap if end - overlap > start else end
        start = max(next_start, start + 1)
    return chunks


@celery_app.task(name="app.tasks.crawl_url.crawl_url", bind=True, max_retries=2)
def crawl_url(self, job_id: int, url: str) -> None:
    """
    Celery task: fetch URL, parse, embed, insert into Milvus + MeiliSearch.
    Updates CrawlJob status at each stage.
    """
    db = SessionLocal()
    try:
        # Mark as processing
        update_crawl_job_status(db, job_id, CrawlStatus.processing)

        # 1. Fetch + parse
        try:
            title, body_text = _fetch_url(url)
        except Exception as exc:
            logger.error("crawl_url: fetch failed for %s: %s", url, exc)
            update_crawl_job_status(
                db, job_id, CrawlStatus.failed, error=f"Fetch error: {exc}"
            )
            return

        # 2. Split into chunks
        raw_chunks = _split_text(body_text)
        if not raw_chunks:
            update_crawl_job_status(
                db, job_id, CrawlStatus.failed, error="No text extracted from URL"
            )
            return

        # 3. Embed all chunks
        try:
            embeddings = embed_texts(raw_chunks)
        except Exception as exc:
            logger.error("crawl_url: embedding failed: %s", exc)
            update_crawl_job_status(
                db, job_id, CrawlStatus.failed, error=f"Embedding error: {exc}"
            )
            return

        # 4. Build chunk dicts
        # Use job_id as a synthetic doc_id for crawled content (negative to avoid
        # collision with uploaded File IDs).  doc_id = -(job_id) as a convention.
        synthetic_doc_id = -job_id
        milvus_chunks: list[dict] = []
        meili_chunks: list[dict] = []

        for i, (text, vector) in enumerate(zip(raw_chunks, embeddings)):
            chunk_id = f"crawl_{job_id}_{i}_{uuid.uuid4().hex[:8]}"
            milvus_chunks.append({
                "chunk_id": chunk_id,
                "doc_id": synthetic_doc_id,
                "content": text[:4096],
                "embedding": vector,
                "allowed_user_ids": [],
                "allowed_dept_ids": [],
                "allowed_role_ids": [],
                "is_public": True,
            })
            meili_chunks.append({
                "chunk_id": chunk_id,
                "doc_id": synthetic_doc_id,
                "doc_name": title,
                "content": text,
            })

        # 5. Insert into Milvus + MeiliSearch
        try:
            insert_chunks(milvus_chunks)
            index_chunks(meili_chunks)
        except Exception as exc:
            logger.error("crawl_url: storage insert failed: %s", exc)
            update_crawl_job_status(
                db, job_id, CrawlStatus.failed, error=f"Storage error: {exc}"
            )
            return

        # 6. Mark completed
        update_crawl_job_status(
            db, job_id, CrawlStatus.completed,
            title=title, chunk_count=len(raw_chunks)
        )
        logger.info("crawl_url: job %d completed, %d chunks indexed", job_id, len(raw_chunks))

    finally:
        db.close()
