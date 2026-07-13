# backend/app/api/chat.py
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user_or_api_key   # CHANGED
from app.crud.conversation import (
    create_conversation, get_conversation, list_conversations, get_messages,
)
from app.models.conversation import Conversation, Message
from app.models.user import User
from app.models.file import File
from app.models.knowledge_base import KbFolder
from app.schemas.chat import ConversationCreate, ConversationResponse, AskRequest
from app.services.rag.pipeline import ask, ask_stream

router = APIRouter()


def _resolve_doc_ids(
    db: Session,
    doc_ids: list[int] | None,
    kb_id: int | None,
    kb_folder_id: int | None,
) -> list[int] | None:
    """Resolve kb_id / kb_folder_id into a list of file IDs for scoped RAG retrieval."""
    if doc_ids is not None:
        return doc_ids          # caller provided explicit list; use as-is
    if kb_id is None:
        return None             # no scope filter at all

    if kb_folder_id is not None:
        # BFS: collect this folder and all descendant folder IDs
        folder_ids: list[int] = []
        queue = [kb_folder_id]
        while queue:
            fid = queue.pop(0)
            folder_ids.append(fid)
            children = db.query(KbFolder.id).filter(KbFolder.parent_id == fid).all()
            queue.extend(c.id for c in children)
        ids = db.query(File.id).filter(File.kb_folder_id.in_(folder_ids)).all()
    else:
        ids = db.query(File.id).filter(File.kb_id == kb_id).all()

    return [r.id for r in ids]


@router.post("/conversations", response_model=ConversationResponse, status_code=201)
def create_conv(
    data: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_api_key),   # CHANGED
):
    conv = create_conversation(db, current_user.id, data.title)
    return {"id": conv.id, "title": conv.title, "created_at": str(conv.created_at)}


@router.get("/conversations", response_model=list[ConversationResponse])
def list_convs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_api_key),   # CHANGED
):
    convs = list_conversations(db, current_user.id)
    return [{"id": c.id, "title": c.title, "created_at": str(c.created_at)} for c in convs]


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conv(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_api_key),
):
    conv = get_conversation(db, conversation_id, current_user.id)
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    db.query(Message).filter(Message.conversation_id == conversation_id).delete()
    db.delete(conv)
    db.commit()


@router.get("/conversations/{conversation_id}/messages")
def get_conv_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_api_key),   # CHANGED
):
    conv = get_conversation(db, conversation_id, current_user.id)
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    msgs = get_messages(db, conversation_id)
    result = []
    for m in msgs:
        sources = json.loads(m.sources_json) if m.sources_json else None
        result.append({
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "sources": sources,
            "response_ms": m.response_ms,
            "created_at": str(m.created_at),
        })
    return result


@router.post("/conversations/{conversation_id}/ask")
def ask_question(
    conversation_id: int,
    data: AskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_api_key),   # CHANGED
):
    conv = get_conversation(db, conversation_id, current_user.id)
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")
    resolved = _resolve_doc_ids(db, data.doc_ids, data.kb_id, data.kb_folder_id)
    return ask(db, current_user, conversation_id, data.query, resolved)


@router.post("/conversations/{conversation_id}/ask-stream")
def ask_question_stream(
    conversation_id: int,
    data: AskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_api_key),   # CHANGED
):
    conv = get_conversation(db, conversation_id, current_user.id)
    if not conv:
        raise HTTPException(status_code=404, detail="会话不存在")

    resolved = _resolve_doc_ids(db, data.doc_ids, data.kb_id, data.kb_folder_id)

    def event_stream():
        for token in ask_stream(db, current_user, conversation_id, data.query, resolved):
            yield f"data: {json.dumps(token, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
