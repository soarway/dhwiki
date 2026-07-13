from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_super_admin, get_current_user
from app.crud.file import get_watch_directories, create_watch_directory, get_watch_directory, update_watch_directory, delete_watch_directory
from app.models.user import User
from app.schemas.file import WatchDirectoryCreate, WatchDirectoryUpdate, WatchDirectoryResponse

router = APIRouter()


@router.get("/", response_model=list[WatchDirectoryResponse])
def list_watch_dirs(
    kb_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return get_watch_directories(db, kb_id=kb_id)


@router.post("/", response_model=WatchDirectoryResponse, status_code=201)
def create_watch_dir(
    data: WatchDirectoryCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    import os
    if not os.path.isdir(data.fs_path):
        raise HTTPException(status_code=400, detail=f"路径不存在或不是目录: {data.fs_path}")

    wd = create_watch_directory(db, data, current_user.id)

    # 触发初次全量扫描
    from app.tasks.sync_directory import scan_watch_dir
    background_tasks.add_task(scan_watch_dir.delay, wd.id)

    return wd


@router.patch("/{wd_id}", response_model=WatchDirectoryResponse)
def update_watch_dir(
    wd_id: int,
    data: WatchDirectoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    wd = get_watch_directory(db, wd_id)
    if not wd:
        raise HTTPException(status_code=404, detail="监控目录不存在")
    return update_watch_directory(db, wd, data.model_dump(exclude_none=True))


@router.delete("/{wd_id}", status_code=204)
def delete_watch_dir(
    wd_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    wd = get_watch_directory(db, wd_id)
    if not wd:
        raise HTTPException(status_code=404, detail="监控目录不存在")
    delete_watch_directory(db, wd)


@router.post("/{wd_id}/scan", status_code=202)
def trigger_scan(
    wd_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    wd = get_watch_directory(db, wd_id)
    if not wd:
        raise HTTPException(status_code=404, detail="监控目录不存在")
    from app.tasks.sync_directory import scan_watch_dir
    scan_watch_dir.delay(wd_id)
    return {"message": "扫描任务已触发"}
