# backend/app/services/doc_processor/embedder.py
import math
from typing import Optional
from app.core.config import settings

_model = None


def _get_model():
    """懒加载 sentence-transformers 模型"""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(
            settings.embedding_model,
            device=settings.embedding_device,
            local_files_only=True,
        )
    return _model


def embed_texts(
    texts: list[str],
    batch_size: Optional[int] = None,
) -> list[list[float]]:
    """
    将文本列表转换为向量列表。
    返回：list of float lists，每个向量长度 1024（BGE-M3）
    """
    if not texts:
        return []

    batch_size = batch_size or settings.embedding_batch_size
    model = _get_model()

    all_embeddings = []
    num_batches = math.ceil(len(texts) / batch_size)

    for i in range(num_batches):
        batch = texts[i * batch_size : (i + 1) * batch_size]
        embeddings = model.encode(
            batch,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        all_embeddings.extend(embeddings.tolist())

    return all_embeddings
