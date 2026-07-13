import hashlib
import os
import re
from typing import Optional
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File as FastAPIFile
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud.file import get_files_by_folder, get_file, get_folders_by_parent, retry_file_processing, create_file, delete_file_record
from app.crud import kb_permission as perm_crud
from app.crud import knowledge_base as kb_crud
from app.models.file import File, ProcessStatus
from app.models.user import User
from app.services.permission_service import get_user_context
from app.schemas.file import FileResponse, FileListResponse, FolderResponse, FileSearchResult, FileSearchResponse


class ImportUrlRequest(PydanticBaseModel):
    url: str
    kb_id: Optional[int] = None
    kb_folder_id: Optional[int] = None

router = APIRouter()


@router.post("/upload", response_model=FileResponse)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    kb_id: Optional[int] = Form(None),
    kb_folder_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if kb_id is not None:
        kb_record = kb_crud.get_kb(db, kb_id)
        ctx = get_user_context(db, current_user)
        if not kb_record or not perm_crud.can_user_access_kb(
            db, kb_id, kb_record.is_default_visible,
            ctx["user_id"], ctx["dept_ids"], ctx["role_ids"], ctx["is_super_admin"],
        ):
            raise HTTPException(status_code=403, detail="无权向此知识库上传文件")

    os.makedirs(settings.upload_dir, exist_ok=True)
    content: bytes = await file.read()
    file_hash = hashlib.md5(content).hexdigest()
    ext = os.path.splitext(file.filename or "")[1].lstrip(".").lower() or "bin"
    dest_path = os.path.join(settings.upload_dir, f"{file_hash}.{ext}")
    with open(dest_path, "wb") as f:
        f.write(content)
    try:
        file_record = create_file(
            db,
            name=file.filename or "unknown",
            fs_path=dest_path,
            file_type=ext,
            file_size=len(content),
            file_hash=file_hash,
            kb_id=kb_id,
            kb_folder_id=kb_folder_id,
            uploaded_by=current_user.id,
        )
    except IntegrityError:
        # fs_path 唯一约束冲突：DB 中存在同路径的残留记录，直接复用并重置
        db.rollback()
        file_record = db.query(File).filter(File.fs_path == dest_path).first()
        if not file_record:
            raise HTTPException(status_code=500, detail="文件上传失败，请重试")
        file_record.name = file.filename or "unknown"
        file_record.kb_id = kb_id
        file_record.kb_folder_id = kb_folder_id
        file_record.uploaded_by = current_user.id
        file_record.file_size = len(content)
        file_record.process_status = ProcessStatus.pending
        file_record.process_error = None
        file_record.chunk_count = 0
        db.commit()
        db.refresh(file_record)
    from app.tasks.process_document import process_document
    process_document.delay(file_record.id)
    return file_record


@router.post("/import-url", response_model=FileResponse)
def import_url(
    data: ImportUrlRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import httpx
    from bs4 import BeautifulSoup

    # 1. 抓取页面
    try:
        with httpx.Client(follow_redirects=True, timeout=30.0) as client:
            resp = client.get(data.url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"无法访问该 URL：{exc}")

    soup = BeautifulSoup(resp.text, "html.parser")
    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else data.url

    # 2. 提取正文
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    body_text = soup.get_text(separator="\n", strip=True)

    # 3. 组装文件内容
    file_content = f"来源URL：{data.url}\n标题：{title}\n\n{body_text}".encode("utf-8")
    file_hash = hashlib.md5(file_content).hexdigest()

    # 4. 生成安全文件名（去除非法字符，限长 100）
    safe_title = re.sub(r'[\\/:*?"<>|\r\n]', '_', title).strip()[:100] or "webpage"
    filename = f"{safe_title}.txt"

    # 5. 写入磁盘
    os.makedirs(settings.upload_dir, exist_ok=True)
    dest_path = os.path.join(settings.upload_dir, f"{file_hash}.txt")
    with open(dest_path, "wb") as f:
        f.write(file_content)

    # 6. 创建文件记录（兼容同内容重复导入）
    try:
        file_record = create_file(
            db,
            name=filename,
            fs_path=dest_path,
            file_type="txt",
            file_size=len(file_content),
            file_hash=file_hash,
            kb_id=data.kb_id,
            kb_folder_id=data.kb_folder_id,
            uploaded_by=current_user.id,
        )
    except IntegrityError:
        db.rollback()
        file_record = db.query(File).filter(File.fs_path == dest_path).first()
        if not file_record:
            raise HTTPException(status_code=500, detail="导入失败，请重试")
        file_record.name = filename
        file_record.kb_id = data.kb_id
        file_record.kb_folder_id = data.kb_folder_id
        file_record.uploaded_by = current_user.id
        file_record.file_size = len(file_content)
        file_record.process_status = ProcessStatus.pending
        file_record.process_error = None
        file_record.chunk_count = 0
        db.commit()
        db.refresh(file_record)

    from app.tasks.process_document import process_document
    process_document.delay(file_record.id)
    return file_record


@router.get("/folders", response_model=list[FolderResponse])
def list_folders(
    parent_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return get_folders_by_parent(db, parent_id)


@router.get("/search", response_model=FileSearchResponse)
def search_files(
    name: str = "",
    uploader: str = "",
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """跨知识库搜索文件，只返回当前用户有权访问的知识库中的文件。"""
    from sqlalchemy import or_
    from app.models.knowledge_base import KnowledgeBase
    from app.models.kb_permission import KbPermission
    from app.models.user import User as UserModel
    from app.services.permission_service import get_user_context

    ctx = get_user_context(db, current_user)
    is_super_admin = ctx["is_super_admin"]
    dept_ids = ctx["dept_ids"]

    # 构建可访问的 KB ID 集合
    if is_super_admin:
        accessible_kb_ids = None  # 不限制
    else:
        kb_ids: set[int] = set()
        # 全公司可见的 KB
        for kb in db.query(KnowledgeBase.id).filter(KnowledgeBase.is_default_visible == True).all():
            kb_ids.add(kb.id)
        # 部门权限
        if dept_ids:
            for p in db.query(KbPermission).filter(
                KbPermission.subject_type == "dept",
                KbPermission.subject_id.in_(dept_ids),
            ).all():
                kb_ids.add(p.kb_id)
        # 个人权限
        for p in db.query(KbPermission).filter(
            KbPermission.subject_type == "user",
            KbPermission.subject_id == current_user.id,
        ).all():
            kb_ids.add(p.kb_id)
        accessible_kb_ids = list(kb_ids)

    # 构建文件查询（join User 以支持按上传人搜索）
    query = db.query(File, UserModel).outerjoin(
        UserModel, File.uploaded_by == UserModel.id
    )
    if accessible_kb_ids is not None:
        query = query.filter(File.kb_id.in_(accessible_kb_ids))
    if name:
        query = query.filter(File.name.contains(name))
    if uploader:
        query = query.filter(or_(
            UserModel.real_name.contains(uploader),
            UserModel.username.contains(uploader),
        ))

    total = query.count()
    rows = query.order_by(File.created_at.desc()).offset(skip).limit(limit).all()

    # 批量取 KB 名称
    kb_id_set = {f.kb_id for f, _ in rows if f.kb_id is not None}
    kb_name_map: dict[int, str] = {}
    if kb_id_set:
        for kb in db.query(KnowledgeBase).filter(KnowledgeBase.id.in_(kb_id_set)).all():
            kb_name_map[kb.id] = kb.name

    items = [
        FileSearchResult(
            id=f.id,
            name=f.name,
            file_type=f.file_type,
            file_size=f.file_size,
            process_status=f.process_status,
            created_at=f.created_at,
            kb_id=f.kb_id,
            kb_name=kb_name_map.get(f.kb_id) if f.kb_id else None,
            uploader_name=u.real_name if u else None,
        )
        for f, u in rows
    ]
    return FileSearchResponse(items=items, total=total)


def _assert_kb_access(db: Session, kb_id: Optional[int], current_user: User) -> None:
    """如果 kb_id 存在且当前用户无权访问，抛出 403。"""
    if kb_id is None:
        return
    from app.crud import knowledge_base as kb_crud
    from app.crud import kb_permission as perm_crud
    from app.services.permission_service import get_user_context
    kb = kb_crud.get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    ctx = get_user_context(db, current_user)
    if not perm_crud.can_user_access_kb(
        db, kb.id, kb.is_default_visible,
        ctx["user_id"], ctx["dept_ids"], ctx["role_ids"], ctx["is_super_admin"],
    ):
        raise HTTPException(status_code=403, detail="无权访问此知识库")


@router.get("", response_model=FileListResponse)
@router.get("/", response_model=FileListResponse, include_in_schema=False)
def list_files(
    kb_id: Optional[int] = None,
    folder_id: Optional[int] = None,
    name: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _assert_kb_access(db, kb_id, current_user)
    items, total = get_files_by_folder(db, folder_id=folder_id, skip=skip, limit=limit, kb_id=kb_id, name=name)
    # Batch-fetch uploader names
    uploader_ids = {f.uploaded_by for f in items if f.uploaded_by is not None}
    uploader_map: dict[int, str] = {}
    if uploader_ids:
        for u in db.query(User).filter(User.id.in_(uploader_ids)).all():
            uploader_map[u.id] = u.real_name or u.username
    file_responses = [
        FileResponse(
            id=f.id,
            name=f.name,
            folder_id=f.folder_id,
            fs_path=f.fs_path,
            file_type=f.file_type,
            file_size=f.file_size,
            process_status=f.process_status,
            process_error=f.process_error,
            chunk_count=f.chunk_count,
            uploaded_by=f.uploaded_by,
            uploader_name=uploader_map.get(f.uploaded_by) if f.uploaded_by else None,
            created_at=f.created_at,
        )
        for f in items
    ]
    return FileListResponse(items=file_responses, total=total)


@router.get("/me")
def my_uploads(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """返回当前用户上传的文件列表，按上传时间倒序"""
    files = (
        db.query(File)
        .filter(File.uploaded_by == current_user.id)
        .order_by(File.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    total = (
        db.query(File)
        .filter(File.uploaded_by == current_user.id)
        .count()
    )
    return {
        "total": total,
        "items": [
            {
                "id": f.id,
                "name": f.name,
                "file_type": f.file_type,
                "file_size": f.file_size,
                "process_status": f.process_status,
                "created_at": f.created_at.isoformat(),
            }
            for f in files
        ],
    }


def _resolve_plain_file(
    fs_path: str,
    original_name: str,
    tmp_dir: str,
) -> tuple[str, str, bool]:
    """
    解析文件路径，处理加密文件。
    返回 (实际可读路径, 原始文件名, 是否为临时文件)。
    若为临时文件，调用方必须在响应结束后删除它。
    """
    if not fs_path.endswith(".enc"):
        return fs_path, original_name, False

    from app.services.crypto import get_encryptor
    encryptor = get_encryptor()
    if not encryptor:
        raise HTTPException(status_code=500, detail="文件已加密但系统未配置解密密钥（FILE_ENCRYPT_KEY）")

    tmp_path, enc_original_name = encryptor.decrypt_to_tempfile(fs_path, tmp_dir)
    return tmp_path, enc_original_name, True


@router.get("/{file_id}/preview")
def preview_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from starlette.background import BackgroundTask
    from fastapi.responses import FileResponse as FSFileResponse
    from app.services.doc_processor.office_converter import OFFICE_EXTENSIONS, convert_to_pdf

    file_record = get_file(db, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    _assert_kb_access(db, file_record.kb_id, current_user)
    if not os.path.exists(file_record.fs_path):
        raise HTTPException(status_code=404, detail="文件已被移动或删除")

    tmp_dir = os.path.join(settings.upload_dir, "_tmp_decrypt")
    plain_path, plain_name, is_tmp = _resolve_plain_file(
        file_record.fs_path, file_record.name, tmp_dir
    )

    def _cleanup(path: str) -> None:
        if os.path.exists(path):
            os.remove(path)

    file_ext = plain_name.rsplit(".", 1)[-1].lower() if "." in plain_name else file_record.file_type.lower()

    if file_ext in OFFICE_EXTENSIONS:
        # 加密文件：解密到临时文件后转换，不使用缓存（避免解密文件落盘）
        # 非加密文件：使用 preview_cache 缓存
        if is_tmp:
            tmp_pdf_dir = os.path.join(settings.upload_dir, "_tmp_decrypt")
            try:
                pdf_path = convert_to_pdf(plain_path, tmp_pdf_dir)
            except Exception as e:
                _cleanup(plain_path)
                raise HTTPException(status_code=500, detail=f"转换失败：{e}")
            _cleanup(plain_path)
            stem = plain_name.rsplit(".", 1)[0]
            return FSFileResponse(
                path=pdf_path,
                filename=f"{stem}.pdf",
                media_type="application/pdf",
                background=BackgroundTask(_cleanup, pdf_path),
            )
        else:
            cache_dir = os.path.join(settings.upload_dir, "preview_cache")
            try:
                pdf_path = convert_to_pdf(plain_path, cache_dir)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"转换失败：{e}")
            stem = file_record.name.rsplit(".", 1)[0]
            return FSFileResponse(path=pdf_path, filename=f"{stem}.pdf", media_type="application/pdf")

    if file_ext == "pdf":
        if is_tmp:
            return FSFileResponse(
                path=plain_path,
                filename=plain_name,
                media_type="application/pdf",
                background=BackgroundTask(_cleanup, plain_path),
            )
        return FSFileResponse(
            path=plain_path,
            filename=plain_name,
            media_type="application/pdf",
        )

    if is_tmp:
        return FSFileResponse(
            path=plain_path,
            filename=plain_name,
            media_type="application/octet-stream",
            background=BackgroundTask(_cleanup, plain_path),
        )
    return FSFileResponse(
        path=plain_path,
        filename=plain_name,
        media_type="application/octet-stream",
    )


@router.get("/{file_id}/download")
def download_file(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from starlette.background import BackgroundTask
    from fastapi.responses import FileResponse as FSFileResponse

    file_record = get_file(db, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    _assert_kb_access(db, file_record.kb_id, current_user)
    if not os.path.exists(file_record.fs_path):
        raise HTTPException(status_code=404, detail="文件已被移动或删除")

    tmp_dir = os.path.join(settings.upload_dir, "_tmp_decrypt")
    plain_path, plain_name, is_tmp = _resolve_plain_file(
        file_record.fs_path, file_record.name, tmp_dir
    )

    def _cleanup(path: str) -> None:
        if os.path.exists(path):
            os.remove(path)

    if is_tmp:
        return FSFileResponse(
            path=plain_path,
            filename=plain_name,
            media_type="application/octet-stream",
            background=BackgroundTask(_cleanup, plain_path),
        )
    return FSFileResponse(
        path=plain_path,
        filename=plain_name,
        media_type="application/octet-stream",
    )


@router.get("/{file_id}", response_model=FileResponse)
def get_file_detail(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    file_record = get_file(db, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    _assert_kb_access(db, file_record.kb_id, current_user)
    return file_record


@router.delete("/{file_id}", status_code=204)
def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    file_record = get_file(db, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    # 清理向量库 / 搜索索引：外部服务不可用时不阻断删除
    try:
        from app.services.storage.milvus_client import delete_by_doc_id as milvus_delete
        milvus_delete(file_record.id)
    except Exception:
        pass
    try:
        from app.services.storage.meili_client import delete_by_doc_id as meili_delete
        meili_delete(file_record.id)
    except Exception:
        pass
    if os.path.exists(file_record.fs_path):
        os.remove(file_record.fs_path)
    delete_file_record(db, file_record)


@router.post("/{file_id}/retry", response_model=FileResponse)
def retry_processing(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    file_record = get_file(db, file_id)
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    updated = retry_file_processing(db, file_record)
    from app.tasks.process_document import process_document
    process_document.delay(file_id)
    return updated
