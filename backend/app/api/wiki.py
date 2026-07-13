# backend/app/api/wiki.py
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud import file_wiki as wiki_crud
from app.crud.file import get_file
from app.models.file_wiki import WikiStatus
from app.models.user import User

router = APIRouter()


@router.get("/files/{file_id}/wiki")
def get_wiki(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    获取 Wiki 状态和内容。
    - completed：返回 wiki_status + content（Markdown 文本）
    - 其他状态：返回 wiki_status，content 为 null
    """
    file_record = get_file(db, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")

    wiki_record = wiki_crud.get_by_file_id(db, file_id)
    if not wiki_record:
        # 没有记录说明该文件在 Wiki 功能上线前上传，自动触发生成
        wiki_crud.reset_to_pending(db, file_id)
        from app.tasks.generate_wiki import generate_wiki
        generate_wiki.delay(file_id)
        return {"wiki_status": "processing", "content": None, "generated_at": None, "wiki_error": None}

    content = None
    if wiki_record.wiki_status == WikiStatus.completed and wiki_record.wiki_path:
        if os.path.exists(wiki_record.wiki_path):
            content = Path(wiki_record.wiki_path).read_text(encoding="utf-8")
        else:
            content = None

    return {
        "wiki_status": wiki_record.wiki_status.value,
        "content": content,
        "generated_at": wiki_record.generated_at.isoformat() if wiki_record.generated_at else None,
        "wiki_error": wiki_record.wiki_error,
    }


@router.post("/files/{file_id}/wiki/retry")
def retry_wiki(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    手动触发重新生成 Wiki（重置状态并重入 Celery 队列）。
    """
    file_record = get_file(db, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")

    wiki_crud.reset_to_pending(db, file_id)

    from app.tasks.generate_wiki import generate_wiki
    generate_wiki.delay(file_id)

    return {"detail": "Wiki 生成已重新触发"}
