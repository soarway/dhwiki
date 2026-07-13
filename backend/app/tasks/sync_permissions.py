# backend/app/tasks/sync_permissions.py
from typing import Optional

from app.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.file import File, ProcessStatus
from app.crud.permission import resolve_file_allowed_ids
from app.services.storage.milvus_client import (
    delete_by_doc_id, insert_chunks, query_chunks_by_doc_id
)


def sync_file_permissions_sync(file_id: int) -> None:
    """
    同步单个文件在 Milvus 中所有分块的权限元数据：
    1. 查询 Milvus 中该文件的现有分块（含 embedding）
    2. 从 MySQL 计算最新权限
    3. 删除旧分块
    4. 以新权限重新插入
    仅处理 process_status=completed 的文件。
    """
    db = SessionLocal()
    try:
        file_record: Optional[File] = db.query(File).filter(File.id == file_id).first()
        if not file_record or file_record.process_status != ProcessStatus.completed:
            return

        existing_chunks = query_chunks_by_doc_id(file_id)
        if not existing_chunks:
            return

        perm_data = resolve_file_allowed_ids(db, file_id)
        delete_by_doc_id(file_id)

        new_chunks = [
            {
                "chunk_id": chunk["chunk_id"],
                "doc_id": chunk["doc_id"],
                "content": chunk["content"],
                "embedding": chunk["embedding"],
                "allowed_user_ids": perm_data["allowed_user_ids"],
                "allowed_dept_ids": perm_data["allowed_dept_ids"],
                "allowed_role_ids": perm_data["allowed_role_ids"],
                "is_public": perm_data["is_public"],
            }
            for chunk in existing_chunks
        ]
        insert_chunks(new_chunks)

    finally:
        db.close()


@celery_app.task(name="app.tasks.sync_permissions.sync_file_permissions")
def sync_file_permissions(file_id: int) -> dict:
    sync_file_permissions_sync(file_id)
    return {"file_id": file_id, "status": "synced"}
