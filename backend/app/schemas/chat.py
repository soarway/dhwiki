# backend/app/schemas/chat.py
from typing import Optional
from pydantic import BaseModel


class ConversationCreate(BaseModel):
    title: Optional[str] = None


class ConversationResponse(BaseModel):
    id: int
    title: Optional[str]
    created_at: str

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    sources: Optional[list[dict]]
    response_ms: Optional[int]
    created_at: str

    model_config = {"from_attributes": True}


class AskRequest(BaseModel):
    query: str
    doc_ids: Optional[list[int]] = None
    kb_id: Optional[int] = None
    kb_folder_id: Optional[int] = None
