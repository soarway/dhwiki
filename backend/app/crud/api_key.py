# backend/app/crud/api_key.py
import json
import secrets
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.models.api_key import ApiKey


def create_api_key(
    db: Session,
    name: str,
    owner_id: int,
    allowed_kb_ids: Optional[list[int]] = None,
    rate_limit_per_min: int = 60,
) -> ApiKey:
    key = ApiKey(
        name=name,
        key=secrets.token_hex(32),
        owner_id=owner_id,
        allowed_kb_ids=json.dumps(allowed_kb_ids) if allowed_kb_ids is not None else None,
        rate_limit_per_min=rate_limit_per_min,
        created_at=datetime.utcnow(),
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return key


def update_api_key(
    db: Session,
    key_id: int,
    owner_id: int,
    name: Optional[str] = None,
    allowed_kb_ids: Optional[list[int]] = None,
    clear_kb_restriction: bool = False,
    rate_limit_per_min: Optional[int] = None,
) -> Optional[ApiKey]:
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.owner_id == owner_id).first()
    if not key:
        return None
    if name is not None:
        key.name = name
    if clear_kb_restriction:
        key.allowed_kb_ids = None
    elif allowed_kb_ids is not None:
        key.allowed_kb_ids = json.dumps(allowed_kb_ids)
    if rate_limit_per_min is not None:
        key.rate_limit_per_min = rate_limit_per_min
    db.commit()
    db.refresh(key)
    return key


def get_api_key_by_value(db: Session, key: str) -> Optional[ApiKey]:
    return db.query(ApiKey).filter(ApiKey.key == key, ApiKey.is_active == True).first()


def list_api_keys_for_owner(db: Session, owner_id: int) -> list[ApiKey]:
    return db.query(ApiKey).filter(ApiKey.owner_id == owner_id).all()


def delete_api_key(db: Session, key_id: int, owner_id: int) -> bool:
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.owner_id == owner_id).first()
    if not key:
        return False
    db.delete(key)
    db.commit()
    return True


def touch_last_used(db: Session, key_id: int) -> None:
    key = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if key:
        key.last_used_at = datetime.utcnow()
        db.commit()
