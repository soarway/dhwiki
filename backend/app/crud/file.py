from typing import Optional
from sqlalchemy.orm import Session

from app.models.file import File, Folder, WatchDirectory, ProcessStatus
from app.schemas.file import WatchDirectoryCreate


def get_watch_directories(db: Session, kb_id: Optional[int] = None) -> list[WatchDirectory]:
    q = db.query(WatchDirectory)
    if kb_id is not None:
        q = q.filter(WatchDirectory.kb_id == kb_id)
    return q.all()


def update_watch_directory(db: Session, wd: WatchDirectory, data: dict) -> WatchDirectory:
    for key, value in data.items():
        setattr(wd, key, value)
    db.commit()
    db.refresh(wd)
    return wd


def delete_watch_directory(db: Session, wd: WatchDirectory) -> None:
    db.delete(wd)
    db.commit()


def get_watch_directory(db: Session, wd_id: int) -> Optional[WatchDirectory]:
    return db.query(WatchDirectory).filter(WatchDirectory.id == wd_id).first()


def create_watch_directory(db: Session, data: WatchDirectoryCreate, user_id: int) -> WatchDirectory:
    wd = WatchDirectory(
        name=data.name,
        fs_path=data.fs_path,
        description=data.description or "",
        created_by=user_id,
        require_approval=data.require_approval,
        kb_id=data.kb_id,
    )
    db.add(wd)
    db.commit()
    db.refresh(wd)
    return wd


def create_file(
    db: Session,
    name: str,
    fs_path: str,
    file_type: str,
    file_size: int,
    file_hash: Optional[str] = None,
    kb_id: Optional[int] = None,
    kb_folder_id: Optional[int] = None,
    uploaded_by: Optional[int] = None,
) -> File:
    f = File(
        name=name,
        fs_path=fs_path,
        file_type=file_type,
        file_size=file_size,
        file_hash=file_hash,
        process_status=ProcessStatus.pending,
        kb_id=kb_id,
        kb_folder_id=kb_folder_id,
        uploaded_by=uploaded_by,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def get_files_by_folder(
    db: Session,
    folder_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    kb_id: Optional[int] = None,
    name: Optional[str] = None,
) -> tuple[list[File], int]:
    query = db.query(File)
    if kb_id is not None:
        query = query.filter(File.kb_id == kb_id)
    if folder_id is not None:
        # 指定文件夹：只显示该文件夹内的文件
        query = query.filter(File.kb_folder_id == folder_id)
    elif kb_id is not None and not name:
        # 知识库根目录浏览（无搜索词）：只显示未归入任何子文件夹的根级文件
        query = query.filter(File.kb_folder_id == None)
    # 有 name 搜索词时跨全 KB 搜索，不限文件夹层级
    if name:
        query = query.filter(File.name.contains(name))
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return items, total


def get_file(db: Session, file_id: int) -> Optional[File]:
    return db.query(File).filter(File.id == file_id).first()


def get_folders_by_parent(db: Session, parent_id: Optional[int]) -> list[Folder]:
    return db.query(Folder).filter(Folder.parent_id == parent_id).all()


def delete_file_record(db: Session, file_record: File) -> None:
    from app.models.permission import Permission, ResourceType
    db.query(Permission).filter(
        Permission.resource_type == ResourceType.file,
        Permission.resource_id == file_record.id,
    ).delete()
    db.delete(file_record)
    db.commit()


def retry_file_processing(db: Session, file_record: File) -> File:
    file_record.process_status = ProcessStatus.pending
    file_record.process_error = None
    db.commit()
    db.refresh(file_record)
    return file_record
