from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, select, exists

from app.models.knowledge_base import KnowledgeBase, KbFolder
from app.models.file import File


def get_kb_list(db: Session, search: str = "", dir_tag: Optional[str] = None) -> list[KnowledgeBase]:
    q = db.query(KnowledgeBase).filter(KnowledgeBase.is_deleted == False)
    if search:
        q = q.filter(KnowledgeBase.name.contains(search))
    if dir_tag == "general":
        q = q.filter(KnowledgeBase.dir_tag.is_(None))
    elif dir_tag is not None:
        q = q.filter(KnowledgeBase.dir_tag == dir_tag)
    return q.order_by(KnowledgeBase.sort_order.is_(None), KnowledgeBase.sort_order.asc(), KnowledgeBase.created_at.desc()).all()


def get_kb(db: Session, kb_id: int) -> Optional[KnowledgeBase]:
    return db.query(KnowledgeBase).filter(
        KnowledgeBase.id == kb_id, KnowledgeBase.is_deleted == False
    ).first()


def create_kb(db: Session, name: str, created_by: int,
              description: str = None, is_default_visible: bool = True,
              dir_tag: str = None) -> KnowledgeBase:
    kb = KnowledgeBase(
        name=name,
        created_by=created_by,
        description=description,
        is_default_visible=is_default_visible,
        dir_tag=dir_tag,
    )
    db.add(kb)
    db.commit()
    db.refresh(kb)
    return kb


def update_kb(db: Session, kb_id: int, **kwargs) -> Optional[KnowledgeBase]:
    kb = get_kb(db, kb_id)
    if not kb:
        return None
    for k, v in kwargs.items():
        if v is not None:
            setattr(kb, k, v)
    db.commit()
    db.refresh(kb)
    return kb


def delete_kb(db: Session, kb_id: int) -> bool:
    kb = get_kb(db, kb_id)
    if not kb:
        return False
    kb.is_deleted = True
    db.commit()
    return True


def get_kb_stats(db: Session, kb_id: int) -> dict:
    result = db.execute(
        select(func.count(File.id), func.sum(File.file_size))
        .where(File.kb_id == kb_id)
    ).one()
    return {"file_count": result[0] or 0, "total_size": result[1] or 0}


def get_global_stats(db: Session, dir_tag: Optional[str] = None) -> dict:
    kb_q = db.query(KnowledgeBase).filter(KnowledgeBase.is_deleted == False)
    if dir_tag == "general":
        kb_q = kb_q.filter(KnowledgeBase.dir_tag.is_(None))
    elif dir_tag is not None:
        kb_q = kb_q.filter(KnowledgeBase.dir_tag == dir_tag)
    kb_count = kb_q.count()

    file_stmt = (
        select(func.count(File.id), func.sum(File.file_size))
        .join(KnowledgeBase, File.kb_id == KnowledgeBase.id)
        .where(KnowledgeBase.is_deleted == False)
    )
    if dir_tag == "general":
        file_stmt = file_stmt.where(KnowledgeBase.dir_tag.is_(None))
    elif dir_tag is not None:
        file_stmt = file_stmt.where(KnowledgeBase.dir_tag == dir_tag)
    result = db.execute(file_stmt).one()

    return {
        "kb_count": kb_count,
        "file_count": result[0] or 0,
        "total_size": result[1] or 0,
    }


# ---- 文件夹 CRUD ----

def is_folder_empty(db: Session, folder_id: int) -> bool:
    has_subfolders = db.query(
        exists().where(KbFolder.parent_id == folder_id, KbFolder.is_deleted == False)
    ).scalar()
    if has_subfolders:
        return False
    has_files = db.query(
        exists().where(File.kb_folder_id == folder_id)
    ).scalar()
    return not has_files


def get_kb_folders(db: Session, kb_id: int, parent_id: Optional[int] = None) -> list[KbFolder]:
    q = db.query(KbFolder).filter(KbFolder.kb_id == kb_id, KbFolder.is_deleted == False)
    if parent_id is None:
        q = q.filter(KbFolder.parent_id == None)
    else:
        q = q.filter(KbFolder.parent_id == parent_id)
    return q.all()


def create_kb_folder(db: Session, kb_id: int, name: str,
                     created_by: int, parent_id: Optional[int] = None) -> KbFolder:
    folder = KbFolder(kb_id=kb_id, name=name, parent_id=parent_id, created_by=created_by)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def rename_kb_folder(db: Session, folder_id: int, name: str) -> Optional[KbFolder]:
    folder = db.get(KbFolder, folder_id)
    if not folder or folder.is_deleted:
        return None
    folder.name = name
    db.commit()
    db.refresh(folder)
    return folder


def delete_kb_folder(db: Session, folder_id: int) -> bool:
    folder = db.get(KbFolder, folder_id)
    if not folder:
        return False
    folder.is_deleted = True
    db.commit()
    return True
