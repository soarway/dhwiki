# backend/tests/test_rag_retriever.py
from unittest.mock import patch


def test_rrf_fusion_merges_and_deduplicates():
    from app.services.rag.retriever import rrf_fusion
    a = [
        {"chunk_id": "c1", "doc_id": 1, "content": "文本1"},
        {"chunk_id": "c2", "doc_id": 1, "content": "文本2"},
    ]
    b = [
        {"chunk_id": "c2", "doc_id": 1, "content": "文本2"},
        {"chunk_id": "c3", "doc_id": 2, "content": "文本3"},
    ]
    result = rrf_fusion(a, b)
    chunk_ids = [r["chunk_id"] for r in result]
    # c2 appears in both result sets, should rank first (higher RRF score)
    assert chunk_ids[0] == "c2"
    # All chunks deduplicated
    assert set(chunk_ids) == {"c1", "c2", "c3"}


def test_rrf_fusion_empty_inputs():
    from app.services.rag.retriever import rrf_fusion
    result = rrf_fusion([], [])
    assert result == []


def test_hybrid_search_calls_both_sources():
    from app.services.rag.retriever import hybrid_search

    milvus_chunks = [
        {"chunk_id": "m1", "doc_id": 1, "content": "Milvus结果", "score": 0.9},
    ]
    meili_chunks = [
        {"chunk_id": "e1", "doc_id": 2, "content": "MeiliSearch结果",
         "doc_name": "报告.pdf", "page_number": 3},
    ]

    with (
        patch("app.services.rag.retriever.embed_texts", return_value=[[0.1] * 1024]),
        patch("app.services.rag.retriever.milvus_search", return_value=milvus_chunks),
        patch("app.services.rag.retriever.meili_search", return_value=meili_chunks),
    ):
        result = hybrid_search(
            query="测试查询",
            milvus_filter=None,
            accessible_doc_ids=None,
            top_k=20,
        )

    chunk_ids = {r["chunk_id"] for r in result}
    assert "m1" in chunk_ids
    assert "e1" in chunk_ids


def test_hybrid_search_passes_filter_and_doc_ids():
    from app.services.rag.retriever import hybrid_search

    with (
        patch("app.services.rag.retriever.embed_texts", return_value=[[0.2] * 1024]),
        patch("app.services.rag.retriever.milvus_search", return_value=[]) as mock_milvus,
        patch("app.services.rag.retriever.meili_search", return_value=[]) as mock_meili,
    ):
        hybrid_search(
            query="q",
            milvus_filter="is_public == true",
            accessible_doc_ids=[1, 2, 3],
            top_k=10,
        )

    mock_milvus.assert_called_once_with(
        [0.2] * 1024, filter_expr="is_public == true", top_k=10
    )
    mock_meili.assert_called_once_with("q", doc_ids=[1, 2, 3], top_k=10)
