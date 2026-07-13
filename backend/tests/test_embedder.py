# backend/tests/test_embedder.py
import pytest
from unittest.mock import patch, MagicMock
import numpy as np


def test_embed_texts_returns_correct_shape():
    from app.services.doc_processor.embedder import embed_texts

    mock_embeddings = np.random.rand(3, 1024).astype("float32")

    with patch("app.services.doc_processor.embedder._get_model") as mock_get_model:
        mock_model = MagicMock()
        mock_model.encode.return_value = mock_embeddings
        mock_get_model.return_value = mock_model

        texts = ["文档一", "文档二", "文档三"]
        result = embed_texts(texts)

        assert len(result) == 3
        assert len(result[0]) == 1024
        mock_model.encode.assert_called_once()


def test_embed_texts_batch_processing():
    """超过 batch_size 的文本应分批处理"""
    from app.services.doc_processor.embedder import embed_texts

    def fake_encode(texts, **kwargs):
        return np.random.rand(len(texts), 1024).astype("float32")

    with patch("app.services.doc_processor.embedder._get_model") as mock_get_model:
        mock_model = MagicMock()
        mock_model.encode.side_effect = fake_encode
        mock_get_model.return_value = mock_model

        texts = [f"文本{i}" for i in range(70)]
        result = embed_texts(texts, batch_size=32)

        assert len(result) == 70
        assert mock_model.encode.call_count == 3  # ceil(70/32) = 3 批


def test_embed_empty_list_returns_empty():
    from app.services.doc_processor.embedder import embed_texts
    result = embed_texts([])
    assert result == []
