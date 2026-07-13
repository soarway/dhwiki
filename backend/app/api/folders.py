from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud import knowledge_base as kb_crud
from app.crud import kb_permission as perm_crud
from app.models.knowledge_base import KbFolder
from app.models.user import User
from app.schemas.knowledge_base import KbFolderCreate, KbFolderResponse
from app.services.permission_service import get_user_context

router = APIRouter()


@router.get("", response_model=list[KbFolderResponse])
@router.get("/", response_model=list[KbFolderResponse], include_in_schema=False)
def list_folders(
    kb_id: int,
    parent_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    kb = kb_crud.get_kb(db, kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="知识库不存在")
    ctx = get_user_context(db, current_user)
    if not perm_crud.can_user_access_kb(
        db, kb.id, kb.is_default_visible,
        ctx["user_id"], ctx["dept_ids"], ctx["role_ids"], ctx["is_super_admin"],
    ):
        raise HTTPException(status_code=403, detail="无权访问此知识库")
    folders = kb_crud.get_kb_folders(db, kb_id, parent_id)
    result = []
    for f in folders:
        item = KbFolderResponse.model_validate(f)
        item.is_empty = kb_crud.is_folder_empty(db, f.id)
        result.append(item)
    return result


@router.post("", response_model=KbFolderResponse, status_code=201)
@router.post("/", response_model=KbFolderResponse, status_code=201, include_in_schema=False)
def create_folder(
    body: KbFolderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return kb_crud.create_kb_folder(
        db,
        kb_id=body.kb_id,
        name=body.name,
        created_by=current_user.id,
        parent_id=body.parent_id,
    )


@router.put("/{folder_id}", response_model=KbFolderResponse)
def rename_folder(
    folder_id: int,
    name: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    folder = kb_crud.rename_kb_folder(db, folder_id, name)
    if not folder:
        raise HTTPException(status_code=404, detail="文件夹不存在")
    return folder


@router.delete("/{folder_id}", status_code=204)
def delete_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    folder = db.get(kb_crud.KbFolder, folder_id)
    if not folder or folder.is_deleted:
        raise HTTPException(status_code=404, detail="文件夹不存在")
    if not kb_crud.is_folder_empty(db, folder_id):
        raise HTTPException(status_code=400, detail="文件夹不为空，无法删除")
    if not kb_crud.delete_kb_folder(db, folder_id):
        raise HTTPException(status_code=404, detail="文件夹不存在")
