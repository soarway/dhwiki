# backend/app/services/rag/generator.py
import time
from typing import Optional, Generator

from openai import OpenAI
from app.core.config import settings

SYSTEM_PROMPT = (
    "你是企业知识库智能助手，擅长从文档中提取并整合信息。\n"
    "请根据检索到的文档内容，用清晰、完整的语言回答用户问题。\n"
    "回答要求：\n"
    "1. 优先从文档中提取原文信息，可适当整理成列表或段落，保持内容准确；\n"
    "2. 如果多个文档片段涉及同一问题，请综合整理后统一回答；\n"
    "3. 回答末尾用\"来源：《文件名》\"的格式注明信息来自哪个文档，使用文档标签中的实际文件名，不要用\"文档1\"等编号；\n"
    "4. 如果检索到的文档确实没有相关信息，请明确告知用户。"
)


def _get_client() -> OpenAI:
    return OpenAI(
        base_url=settings.llm_api_base,
        api_key=settings.llm_api_key or "ollama",
    )


def _build_messages(
    query: str,
    context_chunks: list[dict],
    history: Optional[list[dict]] = None,
) -> list[dict]:
    """
    Build the LLM messages list.
    history: [{"role": "user"|"assistant", "content": "..."}]
    """
    context_text = ""
    for i, chunk in enumerate(context_chunks):
        doc_name = chunk.get("doc_name", "未知文档")
        page = chunk.get("page_number")
        page_str = f"（第{page}页）" if page else ""
        context_text += f"\n[文档{i + 1}: {doc_name}{page_str}]\n{chunk['content']}\n"

    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    if context_text:
        messages.append({
            "role": "system",
            "content": f"以下是检索到的相关文档片段：\n{context_text}",
        })

    if history:
        messages.extend(history)

    messages.append({"role": "user", "content": query})
    return messages


def generate_answer(
    query: str,
    context_chunks: list[dict],
    history: Optional[list[dict]] = None,
) -> dict:
    """
    Non-streaming generation.
    Returns {"answer": str, "sources": list[dict], "response_ms": int}
    """
    client = _get_client()
    messages = _build_messages(query, context_chunks, history)

    start_ms = int(time.time() * 1000)
    response = client.chat.completions.create(
        model=settings.llm_model,
        messages=messages,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        stream=False,
    )
    end_ms = int(time.time() * 1000)

    answer = response.choices[0].message.content or ""
    sources = [
        {
            "doc_id": c.get("doc_id"),
            "doc_name": c.get("doc_name", ""),
            "chunk_content": c["content"][:200],
            "page": c.get("page_number"),
        }
        for c in context_chunks
    ]
    return {"answer": answer, "sources": sources, "response_ms": end_ms - start_ms}


def generate_answer_stream(
    query: str,
    context_chunks: list[dict],
    history: Optional[list[dict]] = None,
) -> Generator[str, None, None]:
    """
    Streaming generation, yield token strings (skipping None deltas).
    """
    client = _get_client()
    messages = _build_messages(query, context_chunks, history)

    stream = client.chat.completions.create(
        model=settings.llm_model,
        messages=messages,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
