import secrets
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.models.social import FileLike, FileFavorite, FileComment, FileAccessLog, FileShare, FileTag


# ---- 点赞 ----

def toggle_like(db: Session, file_id: int, user_id: int) -> dict:
    like = db.query(FileLike).filter(
        FileLike.file_id == file_id, FileLike.user_id == user_id
    ).first()
    if like:
        db.delete(like)
        db.commit()
        liked = False
    else:
        db.add(FileLike(file_id=file_id, user_id=user_id))
        db.commit()
        liked = True
    count = db.query(func.count(FileLike.id)).filter(FileLike.file_id == file_id).scalar() or 0
    return {"liked": liked, "like_count": count}


def get_like_status(db: Session, file_id: int, user_id: int) -> dict:
    liked = db.query(FileLike).filter(
        FileLike.file_id == file_id, FileLike.user_id == user_id
    ).first() is not None
    count = db.query(func.count(FileLike.id)).filter(FileLike.file_id == file_id).scalar() or 0
    return {"liked": liked, "like_count": count}


def get_user_liked_files(db: Session, user_id: int) -> list[FileLike]:
    return db.query(FileLike).filter(FileLike.user_id == user_id).order_by(FileLike.created_at.desc()).all()


# ---- 收藏 ----

def toggle_favorite(db: Session, file_id: int, user_id: int) -> dict:
    fav = db.query(FileFavorite).filter(
        FileFavorite.file_id == file_id, FileFavorite.user_id == user_id
    ).first()
    if fav:
        db.delete(fav)
        db.commit()
        favorited = False
    else:
        db.add(FileFavorite(file_id=file_id, user_id=user_id))
        db.commit()
        favorited = True
    count = db.query(func.count(FileFavorite.id)).filter(FileFavorite.file_id == file_id).scalar() or 0
    return {"favorited": favorited, "favorite_count": count}


def get_favorite_status(db: Session, file_id: int, user_id: int) -> dict:
    favorited = db.query(FileFavorite).filter(
        FileFavorite.file_id == file_id, FileFavorite.user_id == user_id
    ).first() is not None
    count = db.query(func.count(FileFavorite.id)).filter(FileFavorite.file_id == file_id).scalar() or 0
    return {"favorited": favorited, "favorite_count": count}


def get_user_favorites(db: Session, user_id: int) -> list[FileFavorite]:
    return db.query(FileFavorite).filter(FileFavorite.user_id == user_id).order_by(FileFavorite.created_at.desc()).all()


# ---- 评论 ----

def get_file_comments(db: Session, file_id: int) -> list[FileComment]:
    return db.query(FileComment).filter(
        FileComment.file_id == file_id,
        FileComment.is_deleted == False,
    ).order_by(FileComment.created_at.asc()).all()


def create_comment(db: Session, file_id: int, user_id: int, content: str, parent_id: Optional[int] = None) -> FileComment:
    comment = FileComment(file_id=file_id, user_id=user_id, content=content, parent_id=parent_id)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def update_comment(db: Session, comment_id: int, user_id: int, content: str) -> Optional[FileComment]:
    comment = db.get(FileComment, comment_id)
    if not comment or comment.is_deleted or comment.user_id != user_id:
        return None
    comment.content = content
    db.commit()
    db.refresh(comment)
    return comment


def delete_comment(db: Session, comment_id: int, user_id: int) -> bool:
    comment = db.get(FileComment, comment_id)
    if not comment or comment.is_deleted or comment.user_id != user_id:
        return False
    comment.is_deleted = True
    db.commit()
    return True


def get_user_comments(db: Session, user_id: int) -> list[FileComment]:
    return db.query(FileComment).filter(
        FileComment.user_id == user_id,
        FileComment.is_deleted == False,
    ).order_by(FileComment.created_at.desc()).all()


# ---- 访问日志 ----

def log_access(db: Session, file_id: int, user_id: int) -> FileAccessLog:
    log = FileAccessLog(file_id=file_id, user_id=user_id)
    db.add(log)
    db.commit()
    return log


def get_user_recent_files(db: Session, user_id: int, limit: int = 20) -> list[FileAccessLog]:
    subq = (
        db.query(FileAccessLog.file_id, func.max(FileAccessLog.accessed_at).label("last_at"))
        .filter(FileAccessLog.user_id == user_id)
        .group_by(FileAccessLog.file_id)
        .subquery()
    )
    return (
        db.query(FileAccessLog)
        .join(subq, (FileAccessLog.file_id == subq.c.file_id) & (FileAccessLog.accessed_at == subq.c.last_at))
        .filter(FileAccessLog.user_id == user_id)
        .order_by(subq.c.last_at.desc())
        .limit(limit)
        .all()
    )


# ---- 分享 ----

def create_share(
    db: Session,
    file_id: int,
    shared_by: int,
    expires_at: Optional[datetime] = None,
    share_type: str = 'time',
    share_password: Optional[str] = None,
) -> FileShare:
    import bcrypt as _bcrypt
    token = secrets.token_urlsafe(48)
    pw_hash: Optional[str] = None
    if share_type == 'password' and share_password:
        pw_hash = _bcrypt.hashpw(share_password.encode('utf-8'), _bcrypt.gensalt()).decode('utf-8')
    share = FileShare(
        file_id=file_id,
        shared_by=shared_by,
        share_token=token,
        share_type=share_type,
        password_hash=pw_hash,
        expires_at=expires_at,
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return share


def get_share_by_token(db: Session, token: str) -> Optional[FileShare]:
    return db.query(FileShare).filter(FileShare.share_token == token, FileShare.is_active == True).first()


def verify_share_password(share: FileShare, password: str) -> bool:
    import bcrypt as _bcrypt
    if not share.password_hash:
        return False
    return _bcrypt.checkpw(password.encode('utf-8'), share.password_hash.encode('utf-8'))


def revoke_share(db: Session, share_id: int, user_id: int) -> bool:
    share = db.get(FileShare, share_id)
    if not share or share.shared_by != user_id:
        return False
    share.is_active = False
    db.commit()
    return True


def get_user_shares(db: Session, user_id: int) -> list[FileShare]:
    return db.query(FileShare).filter(FileShare.shared_by == user_id).order_by(FileShare.created_at.desc()).all()


# ---- 统计 ----

def get_file_stats(db: Session, file_id: int) -> dict:
    from app.models.user import User
    like_count = db.query(func.count(FileLike.id)).filter(FileLike.file_id == file_id).scalar() or 0
    favorite_count = db.query(func.count(FileFavorite.id)).filter(FileFavorite.file_id == file_id).scalar() or 0
    comment_count = (
        db.query(func.count(FileComment.id))
        .filter(FileComment.file_id == file_id, FileComment.is_deleted == False)
        .scalar() or 0
    )
    share_count = (
        db.query(func.count(FileShare.id))
        .filter(FileShare.file_id == file_id, FileShare.is_active == True)
        .scalar() or 0
    )
    liked_users = (
        db.query(User)
        .join(FileLike, User.id == FileLike.user_id)
        .filter(FileLike.file_id == file_id)
        .all()
    )
    favorited_users = (
        db.query(User)
        .join(FileFavorite, User.id == FileFavorite.user_id)
        .filter(FileFavorite.file_id == file_id)
        .all()
    )
    return {
        "like_count": like_count,
        "favorite_count": favorite_count,
        "comment_count": comment_count,
        "share_count": share_count,
        "liked_users": [{"id": u.id, "username": u.username, "real_name": u.real_name} for u in liked_users],
        "favorited_users": [{"id": u.id, "username": u.username, "real_name": u.real_name} for u in favorited_users],
    }


# ---- 文件标签 ----

def get_file_tags(db: Session, file_id: int) -> list[FileTag]:
    return db.query(FileTag).filter(FileTag.file_id == file_id).order_by(FileTag.created_at).all()


def add_file_tag(db: Session, file_id: int, name: str, user_id: int) -> FileTag:
    tag = FileTag(file_id=file_id, name=name, created_by=user_id)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


def delete_file_tag(db: Session, tag_id: int) -> bool:
    tag = db.get(FileTag, tag_id)
    if not tag:
        return False
    db.delete(tag)
    db.commit()
    return True
