# backend/app/services/rag/pipeline.py
import time
from typing import Optional, Generator
from sqlalchemy.orm import Session

from app.crud.conversation import (
    add_message, get_messages, update_conversation_title,
)
from app.crud.permission import get_accessible_doc_ids
from app.models.file import File
from app.models.user import User
from app.services.permission_service import get_user_context, build_milvus_filter
from app.services.rag.retriever import hybrid_search
from app.services.rag.reranker import rerank
from app.services.rag.generator import generate_answer, generate_answer_stream
from app.core.config import settings


def _get_history_messages(db: Session, conversation_id: int) -> list[dict]:
    """Get the last N conversation turns (each turn = 1 user + 1 assistant) for LLM context."""
    msgs = get_messages(db, conversation_id, limit=settings.rag_history_turns * 2)
    return [{"role": m.role, "content": m.content} for m in msgs]


def _enrich_doc_names(db: Session, chunks: list[dict]) -> list[dict]:
    """Enrich Milvus chunks with doc_name from MySQL (MeiliSearch chunks already have it)."""
    missing_ids = {c["doc_id"] for c in chunks if not c.get("doc_name")}
    if not missing_ids:
        return chunks
    files = db.query(File).filter(File.id.in_(missing_ids)).all()
    names = {f.id: f.name for f in files}
    for chunk in chunks:
        if not chunk.get("doc_name"):
            chunk["doc_name"] = names.get(chunk["doc_id"], "")
    return chunks


def _auto_title(db: Session, conversation_id: int, query: str) -> None:
    """Set conversation title from first question (first 50 chars)."""
    msgs = get_messages(db, conversation_id)
    if len(msgs) <= 2:
        title = query[:50] + ("..." if len(query) > 50 else "")
        update_conversation_title(db, conversation_id, title)


def _log_query(
    db: Session,
    user: User,
    conversation_id: int,
    query: str,
    answer: str,
    sources: Optional[list],
    response_ms: Optional[int],
) -> None:
    """Persist a QueryLog entry; swallows all exceptions so analytics never break chat."""
    try:
        from app.crud.analytics import create_query_log
        create_query_log(
            db,
            user_id=user.id,
            conversation_id=conversation_id,
            query_text=query,
            answer_text=answer,
            sources=sources,
            response_ms=response_ms,
        )
    except Exception:
        pass


def _apply_doc_filter(
    doc_ids: Optional[list[int]],
    accessible_doc_ids: Optional[list[int]],
    milvus_filter: Optional[str],
) -> tuple[Optional[list[int]], Optional[str]]:
    """Narrow retrieval to specific doc_ids (intersected with user's accessible set for security)."""
    if not doc_ids:
        return accessible_doc_ids, milvus_filter

    if accessible_doc_ids is not None:
        effective = [d for d in doc_ids if d in set(accessible_doc_ids)]
    else:
        effective = doc_ids  # super admin — no restriction

    doc_filter = f"doc_id in {effective}" if effective else "doc_id == -1"
    combined_filter = f"({milvus_filter}) and {doc_filter}" if milvus_filter else doc_filter

    return effective, combined_filter


def ask(
    db: Session,
    user: User,
    conversation_id: int,
    query: str,
    doc_ids: Optional[list[int]] = None,
) -> dict:
    """
    Non-streaming Q&A: retrieve → rerank → generate → save messages → return result.
    Returns {"answer": str, "sources": list[dict], "response_ms": int}
    """
    # 1. Permission context
    user_ctx = get_user_context(db, user)
    milvus_filter = build_milvus_filter(
        user_ctx["user_id"], user_ctx["dept_ids"],
        user_ctx["role_ids"], user_ctx["is_super_admin"],
    )
    accessible_doc_ids = get_accessible_doc_ids(
        db, user_ctx["user_id"], user_ctx["dept_ids"],
        user_ctx["role_ids"], user_ctx["is_super_admin"],
    )

    # 2. History
    history = _get_history_messages(db, conversation_id)

    # 3. Narrow to specific docs if requested
    effective_doc_ids, milvus_filter = _apply_doc_filter(doc_ids, accessible_doc_ids, milvus_filter)

    # 4. Hybrid retrieval
    retrieved = hybrid_search(
        query, milvus_filter, effective_doc_ids,
        top_k=settings.rag_retrieve_top_k,
    )
    retrieved = _enrich_doc_names(db, retrieved)

    # 5. Rerank
    reranked = rerank(query, retrieved, top_n=settings.rag_rerank_top_n)

    # 6. LLM generation
    result = generate_answer(query, reranked, history)

    # 6. Save messages
    add_message(db, conversation_id, "user", query)
    add_message(
        db, conversation_id, "assistant",
        result["answer"],
        sources=result["sources"],
        response_ms=result["response_ms"],
    )

    # 7. Auto title
    _auto_title(db, conversation_id, query)

    # 8. Analytics log
    _log_query(
        db, user, conversation_id,
        query, result["answer"],
        result.get("sources"), result.get("response_ms"),
    )

    return result


def ask_stream(
    db: Session,
    user: User,
    conversation_id: int,
    query: str,
    doc_ids: Optional[list[int]] = None,
) -> Generator[str, None, None]:
    """
    Streaming Q&A: retrieval+rerank completes before streaming, then yields LLM tokens.
    Saves messages to DB after all tokens are yielded.
    """
    user_ctx = get_user_context(db, user)
    milvus_filter = build_milvus_filter(
        user_ctx["user_id"], user_ctx["dept_ids"],
        user_ctx["role_ids"], user_ctx["is_super_admin"],
    )
    accessible_doc_ids = get_accessible_doc_ids(
        db, user_ctx["user_id"], user_ctx["dept_ids"],
        user_ctx["role_ids"], user_ctx["is_super_admin"],
    )

    history = _get_history_messages(db, conversation_id)

    effective_doc_ids, milvus_filter = _apply_doc_filter(doc_ids, accessible_doc_ids, milvus_filter)

    retrieved = hybrid_search(
        query, milvus_filter, effective_doc_ids,
        top_k=settings.rag_retrieve_top_k,
    )
    retrieved = _enrich_doc_names(db, retrieved)
    reranked = rerank(query, retrieved, top_n=settings.rag_rerank_top_n)

    # Save user message before streaming
    add_message(db, conversation_id, "user", query)

    full_answer: list[str] = []
    start_ms = int(time.time() * 1000)

    for token in generate_answer_stream(query, reranked, history):
        full_answer.append(token)
        yield token

    end_ms = int(time.time() * 1000)
    answer_text = "".join(full_answer)

    sources = [
        {
            "doc_id": c.get("doc_id"),
            "doc_name": c.get("doc_name", ""),
            "chunk_content": c["content"][:200],
            "page": c.get("page_number"),
        }
        for c in reranked
    ]

    add_message(
        db, conversation_id, "assistant",
        answer_text,
        sources=sources,
        response_ms=end_ms - start_ms,
    )
    _auto_title(db, conversation_id, query)

    # Analytics log
    _log_query(db, user, conversation_id, query, answer_text, sources, end_ms - start_ms)
