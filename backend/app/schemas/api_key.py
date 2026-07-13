# backend/app/schemas/api_key.py
import json
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator, model_validator


class ApiKeyCreate(BaseModel):
    name: str
    allowed_kb_ids: Optional[list[int]] = None  # None = no restriction
    rate_limit_per_min: int = 60


class ApiKeyUpdate(BaseModel):
    name: Optional[str] = None
    allowed_kb_ids: Optional[list[int]] = None   # None = keep current; [] = clear restriction
    clear_kb_restriction: bool = False            # True = allow all KBs
    rate_limit_per_min: Optional[int] = None


class ApiKeyResponse(BaseModel):
    id: int
    name: str
    key: str
    owner_id: int
    is_active: bool
    allowed_kb_ids: Optional[list[int]] = None
    rate_limit_per_min: int
    created_at: datetime
    last_used_at: Optional[datetime]

    model_config = {"from_attributes": True}

    @model_validator(mode='before')
    @classmethod
    def parse_kb_ids(cls, values):
        if hasattr(values, '__dict__'):
            raw = getattr(values, 'allowed_kb_ids', None)
        else:
            raw = values.get('allowed_kb_ids') if isinstance(values, dict) else None
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
                if hasattr(values, '__dict__'):
                    object.__setattr__(values, 'allowed_kb_ids', parsed)
                else:
                    values['allowed_kb_ids'] = parsed
            except Exception:
                pass
        return values


class ApiKeyPublicResponse(BaseModel):
    id: int
    name: str
    key_preview: str
    owner_id: int
    is_active: bool
    allowed_kb_ids: Optional[list[int]] = None
    rate_limit_per_min: int
    created_at: datetime
    last_used_at: Optional[datetime]
