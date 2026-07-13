# backend/app/celery_app.py
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "knowledge_base",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.tasks.process_document",
        "app.tasks.sync_directory",
        "app.tasks.sync_permissions",
        "app.tasks.crawl_url",
        "app.tasks.generate_wiki",          # NEW
        "app.tasks.aeo_plugin",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "scan-watch-dirs-every-5-min": {
            "task": "app.tasks.sync_directory.scan_all_watch_dirs",
            "schedule": settings.watch_scan_interval_seconds,
        },
    },
)
