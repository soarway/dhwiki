# backend/app/services/storage/meili_client.py
from typing import Optional
import meilisearch
from app.core.config import settings

INDEX_NAME = settings.meili_index


def get_client() -> meilisearch.Client:
    return meilisearch.Client(settings.meili_url, settings.meili_master_key)


def get_or_create_index() -> meilisearch.index.Index:
    client = get_client()
    try:
        index = client.get_index(INDEX_NAME)
    except (meilisearch.errors.MeilisearchApiError, meilisearch.errors.MeilisearchError):
        client.create_index(INDEX_NAME, {"primaryKey": "chunk_id"})
        index = client.get_index(INDEX_NAME)
    # 配置可搜索字段
    index.update_searchable_attributes(["content", "doc_name"])
    index.update_filterable_attributes(["doc_id"])
    return index


def index_chunks(chunks: list[dict]) -> None:
    """
    chunks: list of {chunk_id, doc_id, doc_name, content}
    """
    if not chunks:
        return
    index = get_or_create_index()
    index.add_documents(chunks, primary_key="chunk_id")


def delete_by_doc_id(doc_id: int) -> None:
    client = get_client()
    try:
        index = client.get_index(INDEX_NAME)
        results = index.search("", {"filter": f"doc_id = {doc_id}", "limit": 10000})
        ids = [hit["chunk_id"] for hit in results.get("hits", [])]
        if ids:
            index.delete_documents(ids)
    except (meilisearch.errors.MeilisearchApiError, meilisearch.errors.MeilisearchError):
        pass


def search_chunks(
    query: str,
    doc_ids: Optional[list[int]] = None,
    top_k: int = 20,
) -> list[dict]:
    """
    BM25 全文检索，支持 doc_id 白名单过滤。
    doc_ids=None 不过滤；doc_ids=[] 返回空（无权限）。
    返回 list of {chunk_id, doc_id, content, doc_name, page_number}
    """
    if doc_ids is not None and len(doc_ids) == 0:
        return []
    client = get_client()
    try:
        index = client.get_index(INDEX_NAME)
    except meilisearch.errors.MeilisearchApiError:
        return []
    search_params: dict = {"limit": top_k}
    if doc_ids is not None:
        filter_parts = [f"doc_id = {did}" for did in doc_ids]
        search_params["filter"] = " OR ".join(filter_parts)
    try:
        results = index.search(query, search_params)
    except meilisearch.errors.MeilisearchApiError:
        return []
    chunks = []
    for hit in results["hits"]:
        chunks.append({
            "chunk_id": hit["chunk_id"],
            "doc_id": hit["doc_id"],
            "content": hit["content"],
            "doc_name": hit.get("doc_name", ""),
            "page_number": hit.get("page_number"),
        })
    return chunks
