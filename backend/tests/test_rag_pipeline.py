# backend/tests/test_rag_pipeline.py
import json
from unittest.mock import patch, MagicMock
from app.models.conversation import Conversation
from tests.conftest import TestingSessionLocal


def make_conversation(db) -> int:
    from app.crud.conversation import create_conversation
    conv = create_conversation(db, user_id=1)
    return conv.id


def test_ask_returns_answer_and_saves_messages():
    from app.services.rag.pipeline import ask
    from app.models.user import User
    from app.crud.conversation import get_messages

    db = TestingSessionLocal()
    conv_id = make_conversation(db)
    user = db.query(User).filter(User.username == "admin").first()

    mock_result = {
        "answer": "答案内容",
        "sources": [{"doc_id": 1, "doc_name": "手册.pdf", "chunk_content": "...", "page": 1}],
        "response_ms": 500,
    }

    with (
        patch("app.services.rag.pipeline.get_user_context", return_value={
            "user_id": user.id, "dept_ids": [], "role_ids": [1], "is_super_admin": True
        }),
        patch("app.services.rag.pipeline.build_milvus_filter", return_value=None),
        patch("app.services.rag.pipeline.get_accessible_doc_ids", return_value=None),
        patch("app.services.rag.pipeline.hybrid_search", return_value=[
            {"chunk_id": "c1", "doc_id": 1, "content": "内容", "doc_name": "手册.pdf"}
        ]),
        patch("app.services.rag.pipeline.rerank", return_value=[
            {"chunk_id": "c1", "doc_id": 1, "content": "内容", "doc_name": "手册.pdf"}
        ]),
        patch("app.services.rag.pipeline.generate_answer", return_value=mock_result),
    ):
        result = ask(db, user, conv_id, "测试问题")

    assert result["answer"] == "答案内容"

    msgs = get_messages(db, conv_id)
    db.close()
    assert len(msgs) == 2
    assert msgs[0].role == "user"
    assert msgs[0].content == "测试问题"
    assert msgs[1].role == "assistant"
    assert msgs[1].content == "答案内容"


def test_ask_sets_conversation_title_on_first_message():
    from app.services.rag.pipeline import ask
    from app.models.user import User
    from app.crud.conversation import get_conversation

    db = TestingSessionLocal()
    conv_id = make_conversation(db)
    user = db.query(User).filter(User.username == "admin").first()

    with (
        patch("app.services.rag.pipeline.get_user_context", return_value={
            "user_id": user.id, "dept_ids": [], "role_ids": [], "is_super_admin": True
        }),
        patch("app.services.rag.pipeline.build_milvus_filter", return_value=None),
        patch("app.services.rag.pipeline.get_accessible_doc_ids", return_value=None),
        patch("app.services.rag.pipeline.hybrid_search", return_value=[]),
        patch("app.services.rag.pipeline.rerank", return_value=[]),
        patch("app.services.rag.pipeline.generate_answer", return_value={
            "answer": "ok", "sources": [], "response_ms": 100
        }),
    ):
        ask(db, user, conv_id, "这是一个很长的问题文本，超过五十个字符的部分应该被截断不显示")

    conv = get_conversation(db, conv_id, user.id)
    db.close()
    assert conv.title is not None
    assert len(conv.title) <= 53  # 50 chars + "..."


def test_ask_passes_history_to_generator():
    from app.services.rag.pipeline import ask
    from app.models.user import User
    from app.crud.conversation import add_message

    db = TestingSessionLocal()
    conv_id = make_conversation(db)
    # Pre-populate history messages
    add_message(db, conv_id, "user", "上一个问题")
    add_message(db, conv_id, "assistant", "上一个回答")
    user = db.query(User).filter(User.username == "admin").first()

    captured_history = []

    def fake_generate(query, chunks, history=None):
        captured_history.extend(history or [])
        return {"answer": "ok", "sources": [], "response_ms": 50}

    with (
        patch("app.services.rag.pipeline.get_user_context", return_value={
            "user_id": user.id, "dept_ids": [], "role_ids": [], "is_super_admin": True
        }),
        patch("app.services.rag.pipeline.build_milvus_filter", return_value=None),
        patch("app.services.rag.pipeline.get_accessible_doc_ids", return_value=None),
        patch("app.services.rag.pipeline.hybrid_search", return_value=[]),
        patch("app.services.rag.pipeline.rerank", return_value=[]),
        patch("app.services.rag.pipeline.generate_answer", side_effect=fake_generate),
    ):
        ask(db, user, conv_id, "新问题")

    db.close()
    assert any(m["content"] == "上一个问题" for m in captured_history)
    assert any(m["content"] == "上一个回答" for m in captured_history)
