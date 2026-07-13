# backend/app/services/rag/reranker.py
_reranker = None


def _get_reranker():
    global _reranker
    if _reranker is None:
        from sentence_transformers import CrossEncoder
        from app.core.config import settings
        _reranker = CrossEncoder(settings.reranker_model, local_files_only=True)
    return _reranker


def rerank(query: str, chunks: list[dict], top_n: int = 6) -> list[dict]:
    """
    Use BGE-Reranker Cross-Encoder to rerank retrieval results, returning top_n chunks.
    chunks: list of {chunk_id, doc_id, content, ...}
    """
    if not chunks:
        return []
    reranker = _get_reranker()
    pairs = [(query, c["content"]) for c in chunks]
    scores = reranker.predict(pairs)
    ranked = sorted(zip(scores.tolist(), chunks), key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in ranked[:top_n]]
