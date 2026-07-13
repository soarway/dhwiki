# backend/app/tasks/sync_directory.py
from app.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.file import WatchDirectory
from app.watcher.scanner import scan_watch_directory


@celery_app.task(name="app.tasks.sync_directory.scan_watch_dir")
def scan_watch_dir(watch_dir_id: int) -> dict:
    """扫描单个监控目录"""
    db = SessionLocal()
    try:
        watch_dir = db.query(WatchDirectory).filter(
            WatchDirectory.id == watch_dir_id
        ).first()
        if not watch_dir:
            return {"error": f"WatchDirectory {watch_dir_id} not found"}
        stats = scan_watch_directory(db, watch_dir)
        return {"watch_dir_id": watch_dir_id, **stats}
    finally:
        db.close()


@celery_app.task(name="app.tasks.sync_directory.scan_all_watch_dirs")
def scan_all_watch_dirs() -> list[dict]:
    """由 Celery Beat 定时调用，扫描所有活跃目录"""
    db = SessionLocal()
    try:
        active_dirs = db.query(WatchDirectory).filter(
            WatchDirectory.is_active == True
        ).all()
        results = []
        for wd in active_dirs:
            stats = scan_watch_directory(db, wd)
            results.append({"watch_dir_id": wd.id, **stats})
        return results
    finally:
        db.close()
