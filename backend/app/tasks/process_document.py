# backend/app/tasks/process_document.py
import os
import uuid
from typing import Optional

from app.celery_app import celery_app
from app.core.config import settings
from app.core.database import SessionLocal
import app.models  # noqa: F401 — 确保所有模型注册到 SQLAlchemy metadata
from app.models.file import File, ProcessStatus
from pathlib import Path
from app.services.doc_processor.parser import parse_document
from app.services.doc_processor.chunker import chunk_elements
from app.services.doc_processor.embedder import embed_texts
from app.services.storage.milvus_client import insert_chunks
from app.services.storage.meili_client import index_chunks


def process_document_sync(file_id: int) -> None:
    """
    同步版处理函数，供测试直接调用（不走 Celery）。
    """
    db = SessionLocal()
    file_record: Optional[File] = db.query(File).filter(File.id == file_id).first()

    if not file_record:
        db.close()
        return

    file_record.process_status = ProcessStatus.processing
    db.commit()

    try:
        # 1. 解析
        elements = parse_document(file_record.fs_path)

        # 2. 过滤空内容
        elements = [e for e in elements if e["content"].strip()]

        # 3. 分块
        chunks = chunk_elements(elements)

        if not chunks:
            # PDF 无法提取文本，可能是扫描件
            suffix = Path(file_record.fs_path).suffix.lower()
            if suffix == ".pdf":
                file_record.process_status = ProcessStatus.failed
                file_record.process_error = "该文件为图片扫描件，无法自动提取文本，请使用OCR工具识别后以TXT格式重新上传"
            else:
                file_record.process_status = ProcessStatus.completed
                file_record.chunk_count = 0
            db.commit()
            db.close()
            return

        # 4. Embedding
        texts = [c.content for c in chunks]
        embeddings = embed_texts(texts)

        # 5. 查询文件权限
        from app.crud.permission import resolve_file_allowed_ids
        perm_data = resolve_file_allowed_ids(db, file_id)

        # 6. 构建写入数据
        milvus_data = []
        meili_data = []

        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            chunk_id = f"{file_id}_{i}_{uuid.uuid4().hex[:8]}"
            milvus_data.append({
                "chunk_id": chunk_id,
                "doc_id": file_id,
                "content": chunk.content,
                "embedding": embedding,
                "allowed_user_ids": perm_data["allowed_user_ids"],
                "allowed_dept_ids": perm_data["allowed_dept_ids"],
                "allowed_role_ids": perm_data["allowed_role_ids"],
                "is_public": perm_data["is_public"],
            })
            meili_data.append({
                "chunk_id": chunk_id,
                "doc_id": file_id,
                "doc_name": file_record.name,
                "content": chunk.content,
                "page_number": chunk.page_number,
            })

        # 7. 写入
        insert_chunks(milvus_data)
        index_chunks(meili_data)

        # 8. 加密文件（仅限 upload_dir 中的文件且已配置加密密钥）
        _encrypt_file_if_needed(db, file_record)

        # 9. 更新状态
        file_record.process_status = ProcessStatus.completed
        file_record.chunk_count = len(chunks)
        db.commit()

        # 10. 触发 Wiki 后台生成（RAG 成功才触发）
        from app.tasks.generate_wiki import generate_wiki
        generate_wiki.delay(file_id)

    except FileNotFoundError as e:
        file_record.process_status = ProcessStatus.failed
        file_record.process_error = str(e)
        db.commit()
    except Exception as e:
        file_record.process_status = ProcessStatus.failed
        file_record.process_error = f"{type(e).__name__}: {str(e)}"
        db.commit()
        raise
    finally:
        db.close()


def _encrypt_file_if_needed(db, file_record: File) -> None:
    """
    若启用了文件加密且文件位于 upload_dir 中，则加密文件并更新 DB 中的 fs_path。
    向量入库完成后调用，确保解析时使用的是明文。
    """
    from app.services.crypto import get_encryptor

    encryptor = get_encryptor()
    if not encryptor:
        return

    plain_path: str = file_record.fs_path
    # 仅加密 upload_dir 中的文件（watcher/NAS 文件不加密）
    if not plain_path.startswith(settings.upload_dir):
        return
    # 已经加密过的文件跳过
    if plain_path.endswith(".enc"):
        return
    if not os.path.exists(plain_path):
        return

    enc_path = encryptor.encrypt_file(plain_path, file_record.name)
    os.remove(plain_path)

    file_record.fs_path = enc_path
    db.commit()


@celery_app.task(name="app.tasks.process_document.process_document", bind=True)
def process_document(self, file_id: int) -> dict:
    process_document_sync(file_id)
    return {"file_id": file_id, "status": "done"}
