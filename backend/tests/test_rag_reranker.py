# backend/tests/test_rag_reranker.py
from unittest.mock import patch, MagicMock
import numpy as np


def test_rerank_orders_by_score():
    from app.services.rag.reranker import rerank

    chunks = [
        {"chunk_id": "c1", "doc_id": 1, "content": "低相关文本"},
        {"chunk_id": "c2", "doc_id": 1, "content": "高相关文本"},
        {"chunk_id": "c3", "doc_id": 2, "content": "中等相关文本"},
    ]
    mock_reranker = MagicMock()
    mock_reranker.predict.return_value = np.array([0.1, 0.9, 0.5])

    with patch("app.services.rag.reranker._get_reranker", return_value=mock_reranker):
        result = rerank("查询", chunks, top_n=2)

    assert len(result) == 2
    assert result[0]["chunk_id"] == "c2"
    assert result[1]["chunk_id"] == "c3"


def test_rerank_empty_list():
    from app.services.rag.reranker import rerank
    result = rerank("查询", [], top_n=6)
    assert result == []


def test_rerank_top_n_limits_output():
    from app.services.rag.reranker import rerank

    chunks = [{"chunk_id": f"c{i}", "doc_id": 1, "content": f"文本{i}"} for i in range(10)]
    mock_reranker = MagicMock()
    mock_reranker.predict.return_value = np.array([float(i) for i in range(10)])

    with patch("app.services.rag.reranker._get_reranker", return_value=mock_reranker):
        result = rerank("查询", chunks, top_n=3)

    assert len(result) == 3
