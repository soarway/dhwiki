# backend/app/tasks/generate_wiki.py
import os
import re
import uuid
import logging
from pathlib import Path
from typing import Optional

from app.celery_app import celery_app
from app.core.config import settings
from app.core.database import SessionLocal
import app.models  # noqa: F401
from app.models.file import File
from app.models.file_wiki import WikiStatus

logger = logging.getLogger(__name__)

WIKI_SYSTEM_PROMPT = (
    "你是一个专业的知识整理助手。请将用户提供的文档内容整理为结构清晰的 Wiki 文章。\n"
    "输出格式为 Markdown，结构如下：\n"
    "# {文章标题}\n"
    "## 概述\n"
    "## 背景与目的\n"
    "## 核心内容（按逻辑分成若干 H3 小节）\n"
    "## 关键概念\n"
    "## 总结\n"
    "要求：语言简洁专业，忠实原文，不要编造内容，不要添加文档中没有的信息。"
)

_MAX_TEXT_LEN = 40000
_UNRETRYABLE_ERRORS = (FileNotFoundError, ValueError)


def _extract_file_text(fs_path: str) -> str:
    """提取文档纯文本，复用 summary 的提取逻辑。"""
    extracted = ""
    try:
        from app.services.doc_processor.parser import parse_document
        elements = parse_document(fs_path)
        texts = [e["content"] for e in elements if e["content"].strip()]
        extracted = "\n\n".join(texts)
    except Exception:
        pass
    if not extracted.strip():
        try:
            with open(fs_path, "r", encoding="utf-8", errors="ignore") as f:
                extracted = f.read()
        except Exception:
            pass
    return extracted


def _chunk_wiki_markdown(content: str) -> list[str]:
    """将 Wiki Markdown 按 H2 节分块，每块最长 1024 字符。"""
    sections = re.split(r'\n(?=## )', content)
    chunks: list[str] = []
    for section in sections:
        section = section.strip()
        if not section:
            continue
        if len(section) <= 1024:
            chunks.append(section)
        else:
            while len(section) > 1024:
                chunks.append(section[:1024])
                section = section[1024:]
            if section:
                chunks.append(section)
    return chunks or [content[:1024]]


def _index_wiki_chunks(file_id: int, file_name: str, wiki_text: str) -> None:
    """将 Wiki 切块写入 Milvus 和 MeiliSearch。"""
    from app.services.doc_processor.embedder import embed_texts
    from app.services.storage.milvus_client import insert_chunks
    from app.services.storage.meili_client import index_chunks
    from app.crud.permission import resolve_file_allowed_ids

    text_chunks = _chunk_wiki_markdown(wiki_text)
    if not text_chunks:
        return

    embeddings = embed_texts(text_chunks)

    with SessionLocal() as db:
        perm_data = resolve_file_allowed_ids(db, file_id)

    milvus_data = []
    meili_data = []
    for i, (chunk_text, embedding) in enumerate(zip(text_chunks, embeddings)):
        chunk_id = f"wiki_{file_id}_{i}_{uuid.uuid4().hex[:8]}"
        milvus_data.append({
            "chunk_id": chunk_id,
            "doc_id": file_id,
            "content": chunk_text,
            "embedding": embedding,
            "allowed_user_ids": perm_data["allowed_user_ids"],
            "allowed_dept_ids": perm_data["allowed_dept_ids"],
            "allowed_role_ids": perm_data["allowed_role_ids"],
            "is_public": perm_data["is_public"],
        })
        meili_data.append({
            "chunk_id": chunk_id,
            "doc_id": file_id,
            "doc_name": file_name,
            "content": chunk_text,
            "page_number": None,
            "source_type": "wiki",
        })

    insert_chunks(milvus_data)
    index_chunks(meili_data)


def generate_wiki_sync(file_id: int) -> None:
    from app.crud import file_wiki as wiki_crud

    db = SessionLocal()
    fs_path: Optional[str] = None
    file_name: Optional[str] = None
    try:
        file_record: Optional[File] = db.query(File).filter(File.id == file_id).first()
        if not file_record:
            logger.warning("generate_wiki: file %d not found, skipping", file_id)
            return

        # 幂等保护：已完成则跳过
        existing = wiki_crud.get_by_file_id(db, file_id)
        if existing and existing.wiki_status == WikiStatus.completed:
            return

        # 在关闭 session 前取出需要的值（避免 DetachedInstanceError）
        fs_path = file_record.fs_path
        file_name = file_record.name

        # 标记 processing
        wiki_crud.create_or_reset(db, file_id)
    finally:
        db.close()

    if not fs_path:
        return

    # 检查加密文件：需先解密
    tmp_path: Optional[str] = None
    try:
        if fs_path.endswith(".enc"):
            from app.services.crypto import get_encryptor
            encryptor = get_encryptor()
            if not encryptor:
                raise ValueError("文件已加密但未配置解密密钥")
            tmp_dir = os.path.join(settings.upload_dir, "_tmp_decrypt")
            os.makedirs(tmp_dir, exist_ok=True)
            tmp_path, _ = encryptor.decrypt_to_tempfile(fs_path, tmp_dir)
            plain_path = tmp_path
        else:
            if not os.path.exists(fs_path):
                raise FileNotFoundError(f"文件不存在: {fs_path}")
            plain_path = fs_path

        # 提取文本
        file_text = _extract_file_text(plain_path)
        if not file_text.strip():
            raise ValueError("无法从文件中提取文本内容")

        if len(file_text) > _MAX_TEXT_LEN:
            file_text = file_text[:_MAX_TEXT_LEN] + "\n\n...(内容过长已截断)"

        # 调用 LLM 生成 Wiki（非流式）
        from openai import OpenAI
        client = OpenAI(
            base_url=settings.summary_api_base,
            api_key=settings.summary_api_key or "no-key",
        )
        response = client.chat.completions.create(
            model=settings.summary_model,
            messages=[
                {"role": "system", "content": WIKI_SYSTEM_PROMPT},
                {"role": "user", "content": f"文件名：{file_name}\n\n文件内容：\n{file_text}"},
            ],
            max_tokens=settings.summary_max_tokens,
            stream=False,
        )
        wiki_text = response.choices[0].message.content or ""
        if not wiki_text.strip():
            raise ValueError("LLM 返回了空内容")

        # 保存 md 文件
        wiki_dir = os.path.join(settings.upload_dir, "wiki")
        os.makedirs(wiki_dir, exist_ok=True)
        wiki_path = os.path.join(wiki_dir, f"wiki_{file_id}.md")
        Path(wiki_path).write_text(wiki_text, encoding="utf-8")

        # 入向量库
        _index_wiki_chunks(file_id, file_name, wiki_text)

        # 更新状态
        with SessionLocal() as db2:
            wiki_crud.mark_completed(db2, file_id, wiki_path)

    except _UNRETRYABLE_ERRORS as e:
        with SessionLocal() as db2:
            wiki_crud.mark_failed(db2, file_id, str(e))
    except Exception:
        # 可重试错误：由 Celery autoretry 处理
        with SessionLocal() as db2:
            wiki_crud.mark_failed(db2, file_id, "等待重试...")
        raise
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)


@celery_app.task(
    name="app.tasks.generate_wiki.generate_wiki",
    bind=True,
    autoretry_for=(Exception,),
    retry_kwargs={"max_retries": 3},
    retry_backoff=True,
    retry_backoff_max=900,
    dont_autoretry_for=_UNRETRYABLE_ERRORS,
)
def generate_wiki(self, file_id: int) -> dict:
    generate_wiki_sync(file_id)
    return {"file_id": file_id, "status": "done"}
