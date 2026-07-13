# backend/app/services/rag/retriever.py
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from app.services.doc_processor.embedder import embed_texts
from app.services.storage.milvus_client import search_chunks as milvus_search
from app.services.storage.meili_client import search_chunks as meili_search


def rrf_fusion(
    results_a: list[dict],
    results_b: list[dict],
    k: int = 60,
) -> list[dict]:
    """
    Reciprocal Rank Fusion: merge two ranked result sets, accumulating scores for
    chunks that appear in both. Returns unique chunks sorted by RRF score descending.
    """
    scores: dict[str, float] = {}
    all_chunks: dict[str, dict] = {}

    for rank, chunk in enumerate(results_a):
        cid = chunk["chunk_id"]
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (rank + k)
        all_chunks[cid] = chunk

    for rank, chunk in enumerate(results_b):
        cid = chunk["chunk_id"]
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (rank + k)
        if cid not in all_chunks:
            all_chunks[cid] = chunk

    sorted_ids = sorted(scores.keys(), key=lambda cid: scores[cid], reverse=True)
    return [all_chunks[cid] for cid in sorted_ids]


def hybrid_search(
    query: str,
    milvus_filter: Optional[str],
    accessible_doc_ids: Optional[list[int]],
    top_k: int = 20,
) -> list[dict]:
    """
    Hybrid retrieval: Milvus ANN + MeiliSearch BM25, fused with RRF.

    Args:
        query: user query text
        milvus_filter: Milvus permission filter expression (None = no filter)
        accessible_doc_ids: MeiliSearch doc_id whitelist (None = no filter, [] = no access)
        top_k: number of results per retrieval source

    Returns:
        RRF-fused list of chunks
    """
    # 1. Embed query
    embeddings = embed_texts([query])
    query_embedding = embeddings[0]

    # 2. Milvus ANN + MeiliSearch BM25 并行执行
    milvus_results: list[dict] = []
    meili_results: list[dict] = []

    with ThreadPoolExecutor(max_workers=2) as executor:
        future_milvus = executor.submit(
            milvus_search, query_embedding, milvus_filter, top_k
        )
        future_meili = executor.submit(
            meili_search, query, accessible_doc_ids, top_k
        )
        milvus_results = future_milvus.result()
        meili_results = future_meili.result()

    # 3. RRF fusion
    return rrf_fusion(milvus_results, meili_results)
