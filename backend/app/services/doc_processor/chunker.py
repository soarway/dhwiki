# backend/app/services/doc_processor/chunker.py
from dataclasses import dataclass


@dataclass
class Chunk:
    content: str
    element_type: str      # text / table / image / title
    page_number: int
    chunk_index: int       # 在文档中的序号（0-based）


def _estimate_tokens(text: str) -> int:
    """简单估算 token 数（中文每字约1个token，英文每词约1个token）"""
    return len(text)


def _hard_split(content: str, max_len: int) -> list[str]:
    """将超长文本按换行符拆分，仍超长则强制按字符截断。"""
    if len(content) <= max_len:
        return [content]
    pieces: list[str] = []
    current = ""
    for line in content.splitlines(keepends=True):
        if len(current) + len(line) > max_len and current:
            pieces.append(current.rstrip())
            current = line
        else:
            current += line
    if current:
        pieces.append(current.rstrip())
    # 仍超长则强制按字符截断
    result: list[str] = []
    for p in pieces:
        while len(p) > max_len:
            result.append(p[:max_len])
            p = p[max_len:]
        if p:
            result.append(p)
    return result


def chunk_elements(
    elements: list[dict],
    max_tokens: int = 512,
    overlap_tokens: int = 64,
) -> list[Chunk]:
    """
    将解析出的元素列表转换为分块列表。

    策略：
    - 连续的文本/标题段落合并到同一个 chunk，直到达到 max_tokens
    - 跨块时将当前章节标题作为上下文前缀，保证每个 chunk 都有完整语义
    - 表格/图片：整体作为一个分块，不合并也不拆分
    """
    chunks: list[Chunk] = []
    chunk_index = 0

    # 当前积累的 buffer
    buffer_lines: list[str] = []
    buffer_tokens: int = 0
    buffer_page: int = 1

    # 最近遇到的章节标题（用于跨块上下文）
    current_title: str = ""

    def flush_buffer() -> None:
        nonlocal buffer_lines, buffer_tokens, buffer_page, chunk_index
        if not buffer_lines:
            return
        text = "\n".join(buffer_lines).strip()
        if text:
            chunks.append(Chunk(
                content=text,
                element_type="text",
                page_number=buffer_page,
                chunk_index=chunk_index,
            ))
            chunk_index += 1
        buffer_lines = []
        buffer_tokens = 0

    for el in elements:
        content = el.get("content", "").strip()
        el_type = el.get("element_type", "text")
        page = el.get("page_number", 1)

        if not content:
            continue

        # 表格：先刷出 buffer，若内容超过 max_tokens 则按行拆分
        if el_type == "table":
            flush_buffer()
            if _estimate_tokens(content) <= max_tokens:
                chunks.append(Chunk(
                    content=content,
                    element_type="table",
                    page_number=page,
                    chunk_index=chunk_index,
                ))
                chunk_index += 1
            else:
                # 按换行符拆行，保留首行（列名）作为每个子 chunk 的前缀
                lines = content.splitlines()
                header = lines[0] if lines else ""
                sub_buf: list[str] = []
                sub_tokens = 0
                header_tokens = _estimate_tokens(header)
                for line in lines[1:]:
                    line_tokens = _estimate_tokens(line)
                    if sub_tokens + line_tokens > max_tokens and sub_buf:
                        sub_content = header + "\n" + "\n".join(sub_buf)
                        chunks.append(Chunk(
                            content=sub_content,
                            element_type="table",
                            page_number=page,
                            chunk_index=chunk_index,
                        ))
                        chunk_index += 1
                        sub_buf = []
                        sub_tokens = header_tokens
                    sub_buf.append(line)
                    sub_tokens += line_tokens
                if sub_buf:
                    sub_content = header + "\n" + "\n".join(sub_buf)
                    chunks.append(Chunk(
                        content=sub_content,
                        element_type="table",
                        page_number=page,
                        chunk_index=chunk_index,
                    ))
                    chunk_index += 1
            continue

        # 图片：先刷出 buffer，再单独成块
        if el_type == "image":
            flush_buffer()
            chunks.append(Chunk(
                content=content,
                element_type=el_type,
                page_number=page,
                chunk_index=chunk_index,
            ))
            chunk_index += 1
            continue

        tokens = _estimate_tokens(content)

        # 遇到新标题：如果 buffer 非空则先刷出，再更新当前标题
        if el_type == "title":
            if buffer_tokens > overlap_tokens:
                flush_buffer()
            current_title = content

        # 单个元素超过 max_tokens：先刷出 buffer，再逐段拆分写入
        if tokens > max_tokens:
            flush_buffer()
            for part in _hard_split(content, max_tokens):
                prefix = f"【{current_title}】" if current_title else ""
                full = (prefix + part) if prefix else part
                chunks.append(Chunk(
                    content=full,
                    element_type=el_type,
                    page_number=page,
                    chunk_index=chunk_index,
                ))
                chunk_index += 1
            continue

        # 当前内容加入后会超出 max_tokens：先刷出 buffer
        if buffer_tokens + tokens > max_tokens and buffer_lines:
            flush_buffer()
            # 新 chunk 开头携带章节标题作为上下文前缀
            if current_title:
                prefix = f"【{current_title}】"
                buffer_lines = [prefix]
                buffer_tokens = _estimate_tokens(prefix)

        buffer_lines.append(content)
        buffer_tokens += tokens
        buffer_page = page

    flush_buffer()
    return chunks
