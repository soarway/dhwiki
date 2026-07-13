# backend/tests/test_rag_generator.py
from unittest.mock import patch, MagicMock


def _make_mock_completion(content: str):
    """Build a mock openai ChatCompletion response"""
    mock_choice = MagicMock()
    mock_choice.message.content = content
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    return mock_response


def _make_mock_stream_chunks(tokens: list[str]):
    """Build mock openai streaming response chunks"""
    chunks = []
    for token in tokens:
        chunk = MagicMock()
        chunk.choices[0].delta.content = token
        chunks.append(chunk)
    # End chunk with delta.content = None
    end_chunk = MagicMock()
    end_chunk.choices[0].delta.content = None
    chunks.append(end_chunk)
    return chunks


def test_generate_answer_returns_dict():
    from app.services.rag.generator import generate_answer

    context_chunks = [
        {"chunk_id": "c1", "doc_id": 1, "content": "公司假期政策...",
         "doc_name": "员工手册.pdf", "page_number": 5}
    ]
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = _make_mock_completion("答案文本")

    with patch("app.services.rag.generator._get_client", return_value=mock_client):
        result = generate_answer("假期有多少天？", context_chunks)

    assert result["answer"] == "答案文本"
    assert len(result["sources"]) == 1
    assert result["sources"][0]["doc_name"] == "员工手册.pdf"
    assert "response_ms" in result
    assert isinstance(result["response_ms"], int)


def test_generate_answer_stream_yields_tokens():
    from app.services.rag.generator import generate_answer_stream

    context_chunks = [{"chunk_id": "c1", "doc_id": 1, "content": "内容", "doc_name": "doc.pdf"}]
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = iter(
        _make_mock_stream_chunks(["你", "好", "！"])
    )

    with patch("app.services.rag.generator._get_client", return_value=mock_client):
        tokens = list(generate_answer_stream("问题", context_chunks))

    assert tokens == ["你", "好", "！"]


def test_build_messages_includes_context_and_history():
    from app.services.rag.generator import _build_messages

    chunks = [{"chunk_id": "c1", "doc_id": 1, "content": "文档内容",
               "doc_name": "报告.pdf", "page_number": 2}]
    history = [
        {"role": "user", "content": "上一个问题"},
        {"role": "assistant", "content": "上一个回答"},
    ]
    messages = _build_messages("新问题", chunks, history)

    roles = [m["role"] for m in messages]
    assert "system" in roles
    assert messages[-1]["role"] == "user"
    assert messages[-1]["content"] == "新问题"
    # History messages appear before the last user message
    contents = [m["content"] for m in messages]
    assert any("上一个问题" in c for c in contents)
    assert any("报告.pdf" in c for c in contents)
