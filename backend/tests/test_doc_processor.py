# backend/tests/test_doc_processor.py
import os
import pytest
from pathlib import Path


FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def create_fixtures():
    FIXTURES_DIR.mkdir(exist_ok=True)
    # 创建一个极简文本文件用于测试
    txt_file = FIXTURES_DIR / "sample.txt"
    txt_file.write_text("第一章 简介\n\n这是一个测试文档。包含多行文字内容。\n\n第二章 详情\n\n更多内容。")
    yield
    # 不清理，留给后续测试复用


def test_parse_txt_returns_text_elements():
    from app.services.doc_processor.parser import parse_document
    elements = parse_document(str(FIXTURES_DIR / "sample.txt"))
    assert len(elements) > 0
    assert all("content" in e for e in elements)
    assert all("element_type" in e for e in elements)
    assert all(e["element_type"] in ("text", "table", "image", "title") for e in elements)


def test_parse_returns_source_info():
    from app.services.doc_processor.parser import parse_document
    elements = parse_document(str(FIXTURES_DIR / "sample.txt"))
    for e in elements:
        assert "page_number" in e


def test_parse_nonexistent_file_raises():
    from app.services.doc_processor.parser import parse_document
    with pytest.raises(FileNotFoundError):
        parse_document("/nonexistent/path/file.pdf")


def test_ocr_extract_text_from_image():
    """测试 OCR 能从图片中提取文字（使用 mock 避免真正调用模型）"""
    from unittest.mock import patch, MagicMock
    from app.services.doc_processor.ocr import extract_text_from_image

    mock_result = [[
        [[[0, 0], [100, 0], [100, 20], [0, 20]], ("测试文字内容", 0.99)],
        [[[0, 25], [100, 25], [100, 45], [0, 45]], ("第二行文字", 0.98)],
    ]]

    with patch("app.services.doc_processor.ocr._get_ocr_instance") as mock_ocr_factory:
        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = mock_result
        mock_ocr_factory.return_value = mock_ocr

        result = extract_text_from_image(b"\x89PNG\r\n")  # fake png bytes
        assert "测试文字内容" in result
        assert "第二行文字" in result


def test_ocr_returns_empty_for_blank_image():
    """空图片返回空字符串"""
    from unittest.mock import patch, MagicMock
    from app.services.doc_processor.ocr import extract_text_from_image

    with patch("app.services.doc_processor.ocr._get_ocr_instance") as mock_ocr_factory:
        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = [[]]
        mock_ocr_factory.return_value = mock_ocr

        result = extract_text_from_image(b"\x89PNG\r\n")
        assert result == ""
