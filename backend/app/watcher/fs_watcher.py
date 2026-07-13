# backend/app/watcher/fs_watcher.py
"""
实时文件系统监听（watchdog），检测文件新增/修改/删除事件。
"""
import threading
from datetime import datetime
from pathlib import Path

from watchdog.observers import Observer
from watchdog.events import (
    FileSystemEventHandler,
    FileCreatedEvent,
    FileModifiedEvent,
    FileDeletedEvent,
    FileMovedEvent,
)

from app.core.database import SessionLocal
from app.models.file import File, ProcessStatus, WatchDirectory
from app.watcher.scanner import (
    SUPPORTED_EXTENSIONS,
    compute_file_hash,
    get_or_create_folder,
)
from app.tasks.process_document import process_document
from app.services.storage.milvus_client import delete_by_doc_id
from app.services.storage.meili_client import delete_by_doc_id as meili_delete_by_doc_id


class KnowledgeBaseEventHandler(FileSystemEventHandler):
    def __init__(self, watch_dir_id: int):
        self.watch_dir_id = watch_dir_id

    def on_created(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            return
        self._handle_new_or_modified(str(path))

    def on_modified(self, event):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            return
        self._handle_new_or_modified(str(path))

    def on_deleted(self, event):
        if event.is_directory:
            return
        self._handle_deleted(event.src_path)

    def on_moved(self, event):
        if event.is_directory:
            return
        self._handle_deleted(event.src_path)
        path = Path(event.dest_path)
        if path.suffix.lower() in SUPPORTED_EXTENSIONS:
            self._handle_new_or_modified(str(path))

    def _handle_new_or_modified(self, fs_path: str):
        db = SessionLocal()
        try:
            watch_dir = db.query(WatchDirectory).filter(
                WatchDirectory.id == self.watch_dir_id
            ).first()
            if not watch_dir:
                return

            path = Path(fs_path)
            folder_path = str(path.parent)
            folder = get_or_create_folder(db, folder_path, watch_dir)
            db.commit()

            try:
                file_hash = compute_file_hash(fs_path)
            except (FileNotFoundError, PermissionError):
                return

            stat = path.stat()
            existing = db.query(File).filter(File.fs_path == fs_path).first()

            if existing is None:
                file_record = File(
                    name=path.name,
                    folder_id=folder.id,
                    fs_path=fs_path,
                    file_hash=file_hash,
                    file_type=path.suffix.lstrip(".").lower(),
                    file_size=stat.st_size,
                    process_status=ProcessStatus.pending,
                    last_modified_at=datetime.fromtimestamp(stat.st_mtime),
                )
                db.add(file_record)
                db.flush()
                process_document.delay(file_record.id)
            elif existing.file_hash != file_hash:
                existing.file_hash = file_hash
                existing.process_status = ProcessStatus.pending
                existing.process_error = None
                existing.chunk_count = 0
                db.flush()
                process_document.delay(existing.id)

            db.commit()
        finally:
            db.close()

    def _handle_deleted(self, fs_path: str):
        db = SessionLocal()
        try:
            file_record = db.query(File).filter(File.fs_path == fs_path).first()
            if file_record:
                delete_by_doc_id(file_record.id)
                meili_delete_by_doc_id(file_record.id)
                file_record.process_status = ProcessStatus.failed
                file_record.process_error = "文件已从磁盘删除"
                db.commit()
        finally:
            db.close()


_observer: Observer | None = None
_observer_lock = threading.Lock()


def start_watchers() -> None:
    """启动所有活跃监控目录的 watchdog observer"""
    global _observer

    with _observer_lock:
        if _observer and _observer.is_alive():
            return

        db = SessionLocal()
        try:
            watch_dirs = db.query(WatchDirectory).filter(
                WatchDirectory.is_active == True
            ).all()

            if not watch_dirs:
                return

            _observer = Observer()
            for wd in watch_dirs:
                handler = KnowledgeBaseEventHandler(wd.id)
                _observer.schedule(handler, wd.fs_path, recursive=True)

            _observer.start()
        finally:
            db.close()


def stop_watchers() -> None:
    global _observer
    with _observer_lock:
        if _observer and _observer.is_alive():
            _observer.stop()
            _observer.join()
            _observer = None
