import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse as FSFileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud import social as social_crud
from app.models.user import User
from app.models.file import File
from app.schemas.social import (
    CommentCreate, CommentUpdate, CommentResponse,
    LikeResponse, FavoriteResponse, ShareCreate, ShareResponse, AccessLogResponse,
    FileStatsResponse, TagCreate, TagResponse, SharePublicInfo,
)

router = APIRouter()


# ---- 点赞 ----

@router.post("/files/{file_id}/like")
def toggle_like(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return social_crud.toggle_like(db, file_id, current_user.id)


@router.get("/files/{file_id}/like")
def get_like_status(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return social_crud.get_like_status(db, file_id, current_user.id)


@router.get("/users/me/likes")
def my_likes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    likes = social_crud.get_user_liked_files(db, current_user.id)
    file_ids = [l.file_id for l in likes]
    files = {f.id: f for f in db.query(File).filter(File.id.in_(file_ids)).all()}
    uploader_ids = list({f.uploaded_by for f in files.values() if f.uploaded_by})
    uploaders = {u.id: (u.real_name or u.username) for u in db.query(User).filter(User.id.in_(uploader_ids)).all()}
    return [
        {
            "id": l.id,
            "file_id": l.file_id,
            "file_name": files[l.file_id].name if l.file_id in files else "未知文件",
            "uploader_name": uploaders.get(files[l.file_id].uploaded_by, "") if l.file_id in files and files[l.file_id].uploaded_by else "",
            "created_at": l.created_at.isoformat(),
        }
        for l in likes
    ]


# ---- 收藏 ----

@router.post("/files/{file_id}/favorite")
def toggle_favorite(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return social_crud.toggle_favorite(db, file_id, current_user.id)


@router.get("/files/{file_id}/favorite")
def get_favorite_status(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return social_crud.get_favorite_status(db, file_id, current_user.id)


@router.get("/users/me/favorites")
def my_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    favs = social_crud.get_user_favorites(db, current_user.id)
    file_ids = [f.file_id for f in favs]
    files = {f.id: f for f in db.query(File).filter(File.id.in_(file_ids)).all()}
    uploader_ids = list({f.uploaded_by for f in files.values() if f.uploaded_by})
    uploaders = {u.id: (u.real_name or u.username) for u in db.query(User).filter(User.id.in_(uploader_ids)).all()}
    return [
        {
            "id": fav.id,
            "file_id": fav.file_id,
            "file_name": files[fav.file_id].name if fav.file_id in files else "未知文件",
            "uploader_name": uploaders.get(files[fav.file_id].uploaded_by, "") if fav.file_id in files and files[fav.file_id].uploaded_by else "",
            "created_at": fav.created_at.isoformat(),
        }
        for fav in favs
    ]


# ---- 评论 ----

@router.get("/files/{file_id}/stats", response_model=FileStatsResponse)
def get_file_stats(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return social_crud.get_file_stats(db, file_id)


@router.get("/files/{file_id}/comments")
def list_comments(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    comments = social_crud.get_file_comments(db, file_id)
    user_ids = list({c.user_id for c in comments})
    users = {u.id: (u.real_name or u.username) for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    result = []
    for c in comments:
        d = CommentResponse.model_validate(c).model_dump()
        d['user_real_name'] = users.get(c.user_id, '')
        result.append(d)
    return result


@router.post("/files/{file_id}/comments", response_model=CommentResponse, status_code=201)
def create_comment(
    file_id: int,
    body: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return social_crud.create_comment(db, file_id, current_user.id, body.content, body.parent_id)


@router.put("/comments/{comment_id}", response_model=CommentResponse)
def update_comment(
    comment_id: int,
    body: CommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = social_crud.update_comment(db, comment_id, current_user.id, body.content)
    if not comment:
        raise HTTPException(status_code=404, detail="评论不存在或无权限")
    return comment


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not social_crud.delete_comment(db, comment_id, current_user.id):
        raise HTTPException(status_code=404, detail="评论不存在或无权限")


@router.get("/users/me/comments")
def my_comments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comments = social_crud.get_user_comments(db, current_user.id)
    file_ids = list({c.file_id for c in comments})
    files = {f.id: f for f in db.query(File).filter(File.id.in_(file_ids)).all()}
    uploader_ids = list({f.uploaded_by for f in files.values() if f.uploaded_by})
    uploaders = {u.id: (u.real_name or u.username) for u in db.query(User).filter(User.id.in_(uploader_ids)).all()}
    return [
        {
            "id": c.id,
            "file_id": c.file_id,
            "file_name": files[c.file_id].name if c.file_id in files else "（已删除）",
            "uploader_name": uploaders.get(files[c.file_id].uploaded_by, "") if c.file_id in files else "",
            "parent_id": c.parent_id,
            "content": c.content,
            "created_at": c.created_at.isoformat(),
        }
        for c in comments
    ]


# ---- 访问日志 ----

@router.post("/files/{file_id}/access", status_code=204)
def log_access(
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    social_crud.log_access(db, file_id, current_user.id)


@router.get("/users/me/recent")
def my_recent(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = social_crud.get_user_recent_files(db, current_user.id, limit)
    file_ids = [l.file_id for l in logs]
    files = {f.id: f for f in db.query(File).filter(File.id.in_(file_ids)).all()}
    uploader_ids = list({f.uploaded_by for f in files.values() if f.uploaded_by})
    uploaders = {u.id: (u.real_name or u.username) for u in db.query(User).filter(User.id.in_(uploader_ids)).all()}
    return [
        {
            "id": l.id,
            "file_id": l.file_id,
            "file_name": files[l.file_id].name if l.file_id in files else "（已删除）",
            "uploader_name": uploaders.get(files[l.file_id].uploaded_by, "") if l.file_id in files else "",
            "accessed_at": l.accessed_at.isoformat(),
        }
        for l in logs
        if l.file_id in files  # 过滤已删除文件
    ]


# ---- 分享 ----

@router.post("/shares", response_model=ShareResponse, status_code=201)
def create_share(
    body: ShareCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.share_type == 'password' and not body.share_password:
        raise HTTPException(status_code=400, detail="密钥分享必须设置查看密码")
    return social_crud.create_share(
        db, body.file_id, current_user.id, body.expires_at,
        share_type=body.share_type, share_password=body.share_password,
    )


# ---- 公开分享接口（无需登录）----

def _get_valid_share(token: str, db: Session):
    """校验 token 是否有效（存在、未撤销、未过期），返回 FileShare。"""
    share = social_crud.get_share_by_token(db, token)
    if not share:
        raise HTTPException(status_code=404, detail="分享链接不存在或已失效")
    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="分享链接已过期")
    return share


@router.get("/shares/{token}/public", response_model=SharePublicInfo)
def share_public_info(token: str, db: Session = Depends(get_db)):
    """返回分享的基本信息（文件名/类型/大小/分享类型），不需要登录。"""
    share = _get_valid_share(token, db)
    file_record = db.query(File).filter(File.id == share.file_id).first()
    if not file_record:
        raise HTTPException(status_code=404, detail="原始文件不存在")
    return SharePublicInfo(
        share_token=share.share_token,
        share_type=share.share_type,
        file_id=share.file_id,
        file_name=file_record.name,
        file_type=file_record.file_type,
        file_size=file_record.file_size,
        expires_at=share.expires_at,
    )


@router.post("/shares/{token}/verify-password")
def share_verify_password(token: str, body: dict, db: Session = Depends(get_db)):
    """密钥分享：验证密码是否正确。body: {password: str}"""
    share = _get_valid_share(token, db)
    if share.share_type != 'password':
        return {"ok": True}
    password = (body or {}).get("password", "")
    if not social_crud.verify_share_password(share, password):
        raise HTTPException(status_code=403, detail="密码错误")
    return {"ok": True}


@router.get("/shares/{token}/content")
def share_content(token: str, password: str = "", db: Session = Depends(get_db)):
    """公开文件内容下载（供预览用，不带 JWT）。密钥分享需传 ?password=xxx。"""
    share = _get_valid_share(token, db)
    if share.share_type == 'password':
        if not social_crud.verify_share_password(share, password):
            raise HTTPException(status_code=403, detail="密码错误")

    file_record = db.query(File).filter(File.id == share.file_id).first()
    if not file_record or not os.path.exists(file_record.fs_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    from app.services.doc_processor.office_converter import OFFICE_EXTENSIONS, convert_to_pdf
    ext = file_record.file_type.lower()

    if ext in OFFICE_EXTENSIONS:
        cache_dir = os.path.join(settings.upload_dir, "preview_cache")
        try:
            pdf_path = convert_to_pdf(file_record.fs_path, cache_dir)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"转换失败：{e}")
        stem = file_record.name.rsplit(".", 1)[0]
        return FSFileResponse(path=pdf_path, filename=f"{stem}.pdf", media_type="application/pdf")

    if ext == "pdf":
        return FSFileResponse(
            path=file_record.fs_path,
            filename=file_record.name,
            media_type="application/pdf",
        )

    return FSFileResponse(
        path=file_record.fs_path,
        filename=file_record.name,
        media_type="application/octet-stream",
    )


@router.get("/shares/{token}", response_model=ShareResponse)
def get_share(
    token: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    share = social_crud.get_share_by_token(db, token)
    if not share:
        raise HTTPException(status_code=404, detail="分享链接不存在或已失效")
    return share


@router.delete("/shares/{share_id}", status_code=204)
def revoke_share(
    share_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not social_crud.revoke_share(db, share_id, current_user.id):
        raise HTTPException(status_code=404, detail="分享不存在或无权限")


@router.get("/users/me/shares", response_model=list[ShareResponse])
def my_shares(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return social_crud.get_user_shares(db, current_user.id)


# ---- 文件标签 ----

@router.get("/files/{file_id}/tags", response_model=list[TagResponse])
def list_tags(
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return social_crud.get_file_tags(db, file_id)


@router.post("/files/{file_id}/tags", response_model=TagResponse, status_code=201)
def add_tag(
    file_id: int,
    body: TagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="标签不能为空")
    if len(name) > 9:
        raise HTTPException(status_code=422, detail="标签最多 9 个字")
    existing = social_crud.get_file_tags(db, file_id)
    if any(t.name == name for t in existing):
        raise HTTPException(status_code=409, detail="该标签已存在")
    return social_crud.add_file_tag(db, file_id, name, current_user.id)


@router.delete("/file-tags/{tag_id}", status_code=204)
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not social_crud.delete_file_tag(db, tag_id):
        raise HTTPException(status_code=404, detail="标签不存在")
