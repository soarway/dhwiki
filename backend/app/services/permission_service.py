# backend/app/services/permission_service.py
from typing import Optional
from sqlalchemy.orm import Session

from app.models.user import User


def get_user_context(db: Session, user: User) -> dict:
    """
    返回用户权限上下文：
    {
        "user_id": int,
        "dept_ids": list[int],
        "role_ids": list[int],
        "is_super_admin": bool,
    }
    """
    dept_ids = [ud.dept_id for ud in user.departments]

    role_ids = []
    is_super_admin = False
    for ur in user.roles:
        role_ids.append(ur.role_id)
        if hasattr(ur, "role") and ur.role and ur.role.name == "super_admin":
            is_super_admin = True

    return {
        "user_id": user.id,
        "dept_ids": dept_ids,
        "role_ids": role_ids,
        "is_super_admin": is_super_admin,
    }


def build_milvus_filter(
    user_id: int,
    dept_ids: list[int],
    role_ids: list[int],
    is_super_admin: bool,
) -> Optional[str]:
    """
    构建 Milvus 向量检索的权限过滤表达式。
    超级管理员返回 None（不过滤）。

    示例输出：
      is_public == true or
      array_contains(allowed_user_ids, 5) or
      array_contains_any(allowed_dept_ids, [2, 3]) or
      array_contains_any(allowed_role_ids, [1])
    """
    if is_super_admin:
        return None

    parts = [
        "is_public == true",
        f"array_contains(allowed_user_ids, {user_id})",
    ]

    if dept_ids:
        dept_list = "[" + ", ".join(str(d) for d in dept_ids) + "]"
        parts.append(f"array_contains_any(allowed_dept_ids, {dept_list})")

    if role_ids:
        role_list = "[" + ", ".join(str(r) for r in role_ids) + "]"
        parts.append(f"array_contains_any(allowed_role_ids, {role_list})")

    return " or ".join(parts)
