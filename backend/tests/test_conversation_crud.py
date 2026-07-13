# backend/tests/test_conversation_crud.py
import json
from app.models.conversation import Conversation, Message
from tests.conftest import TestingSessionLocal


def test_create_conversation():
    from app.crud.conversation import create_conversation
    db = TestingSessionLocal()
    conv = create_conversation(db, user_id=1, title="测试对话")
    db.close()
    assert conv.id is not None
    assert conv.title == "测试对话"
    assert conv.user_id == 1


def test_list_conversations_returns_own_only():
    from app.crud.conversation import create_conversation, list_conversations
    db = TestingSessionLocal()
    create_conversation(db, user_id=1, title="对话A")
    create_conversation(db, user_id=1, title="对话B")
    create_conversation(db, user_id=2, title="对话C")
    convs = list_conversations(db, user_id=1)
    db.close()
    assert len(convs) == 2
    titles = {c.title for c in convs}
    assert "对话A" in titles
    assert "对话C" not in titles


def test_add_message_and_get_messages():
    from app.crud.conversation import create_conversation, add_message, get_messages
    db = TestingSessionLocal()
    conv = create_conversation(db, user_id=1)
    add_message(db, conv.id, "user", "你好")
    add_message(
        db, conv.id, "assistant", "你好！有什么可以帮助你？",
        sources=[{"doc_name": "手册.pdf", "page": 1, "chunk_content": "...", "doc_id": 1}],
        response_ms=320,
    )
    msgs = get_messages(db, conv.id)
    db.close()
    assert len(msgs) == 2
    assert msgs[0].role == "user"
    assert msgs[1].role == "assistant"
    assert msgs[1].response_ms == 320
    sources = json.loads(msgs[1].sources_json)
    assert sources[0]["doc_name"] == "手册.pdf"


def test_get_conversation_wrong_user_returns_none():
    from app.crud.conversation import create_conversation, get_conversation
    db = TestingSessionLocal()
    conv = create_conversation(db, user_id=1)
    result = get_conversation(db, conv.id, user_id=99)
    db.close()
    assert result is None


def test_update_conversation_title():
    from app.crud.conversation import create_conversation, update_conversation_title, get_conversation
    db = TestingSessionLocal()
    conv = create_conversation(db, user_id=1)
    update_conversation_title(db, conv.id, "新标题")
    updated = get_conversation(db, conv.id, user_id=1)
    db.close()
    assert updated.title == "新标题"
