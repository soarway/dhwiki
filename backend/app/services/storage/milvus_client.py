# backend/app/services/storage/milvus_client.py
from typing import Optional
from pymilvus import (
    connections,
    Collection,
    CollectionSchema,
    FieldSchema,
    DataType,
    utility,
)
from app.core.config import settings

COLLECTION_NAME = settings.milvus_collection
EMBEDDING_DIM = 1024  # BGE-M3 维度
CONTENT_MAX_LEN = 4096  # Milvus VARCHAR max_length


def connect() -> None:
    connections.connect(
        alias="default",
        host=settings.milvus_host,
        port=settings.milvus_port,
    )


def get_or_create_collection() -> Collection:
    connect()
    if utility.has_collection(COLLECTION_NAME):
        return Collection(COLLECTION_NAME)

    fields = [
        FieldSchema(name="chunk_id", dtype=DataType.VARCHAR, is_primary=True, max_length=64),
        FieldSchema(name="doc_id", dtype=DataType.INT64),
        FieldSchema(name="content", dtype=DataType.VARCHAR, max_length=4096),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=EMBEDDING_DIM),
        # 权限字段（Phase 3 会使用）
        FieldSchema(name="allowed_user_ids", dtype=DataType.ARRAY,
                    element_type=DataType.INT64, max_capacity=256),
        FieldSchema(name="allowed_dept_ids", dtype=DataType.ARRAY,
                    element_type=DataType.INT64, max_capacity=64),
        FieldSchema(name="allowed_role_ids", dtype=DataType.ARRAY,
                    element_type=DataType.INT64, max_capacity=32),
        FieldSchema(name="is_public", dtype=DataType.BOOL),
    ]
    schema = CollectionSchema(fields, description="文档分块向量索引")
    collection = Collection(COLLECTION_NAME, schema)

    # 创建 IVF_FLAT 索引
    index_params = {
        "metric_type": "COSINE",
        "index_type": "IVF_FLAT",
        "params": {"nlist": 128},
    }
    collection.create_index("embedding", index_params)
    return collection


def insert_chunks(chunks: list[dict]) -> None:
    """
    chunks: list of {
        chunk_id: str, doc_id: int, content: str, embedding: list[float],
        allowed_user_ids: list[int], allowed_dept_ids: list[int],
        allowed_role_ids: list[int], is_public: bool
    }
    """
    if not chunks:
        return
    collection = get_or_create_collection()
    data = {
        "chunk_id": [c["chunk_id"] for c in chunks],
        "doc_id": [c["doc_id"] for c in chunks],
        "content": [c["content"][:CONTENT_MAX_LEN] for c in chunks],
        "embedding": [c["embedding"] for c in chunks],
        "allowed_user_ids": [c.get("allowed_user_ids", []) for c in chunks],
        "allowed_dept_ids": [c.get("allowed_dept_ids", []) for c in chunks],
        "allowed_role_ids": [c.get("allowed_role_ids", []) for c in chunks],
        "is_public": [c.get("is_public", True) for c in chunks],
    }
    collection.insert(list(data.values()))
    collection.flush()


def delete_by_doc_id(doc_id: int) -> None:
    connect()
    if not utility.has_collection(COLLECTION_NAME):
        return
    collection = Collection(COLLECTION_NAME)
    collection.load()
    collection.delete(f"doc_id == {doc_id}")
    collection.flush()


def query_chunks_by_doc_id(doc_id: int) -> list[dict]:
    """
    查询 doc_id 对应的所有分块（含 embedding）。
    用于权限同步时 delete + re-insert。
    """
    connect()
    if not utility.has_collection(COLLECTION_NAME):
        return []
    collection = Collection(COLLECTION_NAME)
    collection.load()
    results = collection.query(
        expr=f"doc_id == {doc_id}",
        output_fields=[
            "chunk_id", "doc_id", "content", "embedding",
            "allowed_user_ids", "allowed_dept_ids",
            "allowed_role_ids", "is_public",
        ],
    )
    return results


def search_chunks(
    query_embedding: list[float],
    filter_expr: Optional[str] = None,
    top_k: int = 20,
) -> list[dict]:
    """
    ANN 向量检索，支持权限过滤表达式。
    返回 list of {chunk_id, doc_id, content, score}
    """
    connect()
    if not utility.has_collection(COLLECTION_NAME):
        return []
    collection = Collection(COLLECTION_NAME)
    collection.load()
    search_params = {"metric_type": "COSINE", "params": {"nprobe": 10}}
    try:
        results = collection.search(
            data=[query_embedding],
            anns_field="embedding",
            param=search_params,
            limit=top_k,
            expr=filter_expr,
            output_fields=["chunk_id", "doc_id", "content"],
        )
    except Exception:
        return []
    chunks = []
    for hit in results[0]:
        chunks.append({
            "chunk_id": hit.entity.get("chunk_id"),
            "doc_id": hit.entity.get("doc_id"),
            "content": hit.entity.get("content"),
            "score": float(hit.score),
        })
    return chunks
