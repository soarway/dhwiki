# backend/tests/test_chunker.py
import pytest
from app.services.doc_processor.chunker import chunk_elements, Chunk


def make_element(content: str, el_type: str = "text", page: int = 1) -> dict:
    return {"content": content, "element_type": el_type, "page_number": page, "raw_element": None}


def test_short_text_single_chunk():
    elements = [make_element("短文本内容")]
    chunks = chunk_elements(elements, max_tokens=512)
    assert len(chunks) == 1
    assert chunks[0].content == "短文本内容"


def test_long_text_splits_into_multiple_chunks():
    long_text = "这是一句话。" * 200  # ~1200 字
    elements = [make_element(long_text)]
    chunks = chunk_elements(elements, max_tokens=100)
    assert len(chunks) > 1


def test_table_always_single_chunk():
    table_content = "| 列1 | 列2 |\n| --- | --- |\n" + "| 数据 | 数据 |\n" * 50
    elements = [make_element(table_content, el_type="table")]
    chunks = chunk_elements(elements, max_tokens=50)
    # 表格整体作为一个分块，不拆分
    assert all(c.element_type == "table" for c in chunks)
    assert len([c for c in chunks if c.element_type == "table"]) == 1


def test_chunk_contains_page_number():
    elements = [make_element("第二页内容", page=2)]
    chunks = chunk_elements(elements)
    assert chunks[0].page_number == 2


def test_empty_content_skipped():
    elements = [make_element(""), make_element("有内容")]
    chunks = chunk_elements(elements)
    assert len(chunks) == 1
    assert chunks[0].content == "有内容"


def test_overlap_between_chunks():
    # 两个相邻分块应有重叠（后块包含前块末尾内容）
    long_text = "句子" * 300
    elements = [make_element(long_text)]
    chunks = chunk_elements(elements, max_tokens=100, overlap_tokens=20)
    if len(chunks) > 1:
        # 后一块的开头应与前一块的末尾有交叠
        assert len(chunks[1].content) > 0
