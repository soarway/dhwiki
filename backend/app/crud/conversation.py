# backend/app/crud/conversation.py
import json
from typing import Optional
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, Message


def create_conversation(
    db: Session, user_id: int, title: Optional[str] = None
) -> Conversation:
    conv = Conversation(user_id=user_id, title=title)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def get_conversation(
    db: Session, conversation_id: int, user_id: int
) -> Optional[Conversation]:
    return db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.user_id == user_id,
    ).first()


def list_conversations(
    db: Session, user_id: int, skip: int = 0, limit: int = 20
) -> list[Conversation]:
    return (
        db.query(Conversation)
        .filter(Conversation.user_id == user_id)
        .order_by(Conversation.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def add_message(
    db: Session,
    conversation_id: int,
    role: str,
    content: str,
    sources: Optional[list[dict]] = None,
    response_ms: Optional[int] = None,
) -> Message:
    msg = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        sources_json=json.dumps(sources, ensure_ascii=False) if sources else None,
        response_ms=response_ms,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def get_messages(
    db: Session, conversation_id: int, limit: int = 50
) -> list[Message]:
    return (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .limit(limit)
        .all()
    )


def update_conversation_title(db: Session, conversation_id: int, title: str) -> None:
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if conv:
        conv.title = title
        db.commit()
