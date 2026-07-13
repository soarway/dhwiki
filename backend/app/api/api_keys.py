# backend/app/api/api_keys.py
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.crud.api_key import (
    create_api_key, list_api_keys_for_owner, delete_api_key, update_api_key
)
from app.models.user import User
from app.schemas.api_key import ApiKeyCreate, ApiKeyUpdate, ApiKeyResponse, ApiKeyPublicResponse

router = APIRouter()


def _to_public(k) -> ApiKeyPublicResponse:
    kb_ids = None
    if k.allowed_kb_ids:
        try:
            kb_ids = json.loads(k.allowed_kb_ids)
        except Exception:
            kb_ids = None
    return ApiKeyPublicResponse(
        id=k.id,
        name=k.name,
        key_preview=k.key[:8] + "...",
        owner_id=k.owner_id,
        is_active=k.is_active,
        allowed_kb_ids=kb_ids,
        rate_limit_per_min=k.rate_limit_per_min,
        created_at=k.created_at,
        last_used_at=k.last_used_at,
    )


@router.post("", response_model=ApiKeyResponse, status_code=status.HTTP_201_CREATED)
def create_key(
    data: ApiKeyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new API key. Returns the full key once — store it safely."""
    key = create_api_key(
        db,
        name=data.name,
        owner_id=current_user.id,
        allowed_kb_ids=data.allowed_kb_ids,
        rate_limit_per_min=data.rate_limit_per_min,
    )
    kb_ids = None
    if key.allowed_kb_ids:
        try:
            kb_ids = json.loads(key.allowed_kb_ids)
        except Exception:
            kb_ids = None
    return ApiKeyResponse(
        id=key.id,
        name=key.name,
        key=key.key,
        owner_id=key.owner_id,
        is_active=key.is_active,
        allowed_kb_ids=kb_ids,
        rate_limit_per_min=key.rate_limit_per_min,
        created_at=key.created_at,
        last_used_at=key.last_used_at,
    )


@router.get("", response_model=list[ApiKeyPublicResponse])
def list_keys(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List the current user's API keys (key value is masked)."""
    keys = list_api_keys_for_owner(db, current_user.id)
    return [_to_public(k) for k in keys]


@router.patch("/{key_id}", response_model=ApiKeyPublicResponse)
def update_key(
    key_id: int,
    data: ApiKeyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update name, allowed KB scope or rate limit of an API key."""
    key = update_api_key(
        db,
        key_id=key_id,
        owner_id=current_user.id,
        name=data.name,
        allowed_kb_ids=data.allowed_kb_ids,
        clear_kb_restriction=data.clear_kb_restriction,
        rate_limit_per_min=data.rate_limit_per_min,
    )
    if not key:
        raise HTTPException(status_code=404, detail="API Key 不存在或无权修改")
    return _to_public(key)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_key(
    key_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an API key (owner only)."""
    deleted = delete_api_key(db, key_id=key_id, owner_id=current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="API Key 不存在或无权删除")
