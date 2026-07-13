"""
初始数据种子脚本 — 在 alembic 迁移完成后由 docker-entrypoint.sh 调用。
幂等设计：全部使用 "不存在则插入" 逻辑，可安全重复执行。
"""
import sys
import logging

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


def seed():
    from app.core.database import SessionLocal
    from app.core.security import get_password_hash

    db = SessionLocal()
    try:
        _seed_roles(db)
        _seed_admin(db)
        db.commit()
        log.info("[seed] 完成")
    except Exception as e:
        db.rollback()
        log.error("[seed] 失败: %s", e)
        sys.exit(1)
    finally:
        db.close()


def _seed_roles(db):
    from app.models.role import Role

    system_roles = [
        ("super_admin", "超级管理员"),
        ("dept_admin",  "部门管理员"),
        ("member",      "普通成员"),
    ]
    for name, desc in system_roles:
        if not db.query(Role).filter_by(name=name).first():
            db.add(Role(name=name, description=desc, is_system=True))
            log.info("[seed] 创建角色: %s", name)
    db.flush()


def _seed_admin(db):
    from app.models.user import User
    from app.models.role import Role

    # 动态导入 UserRole（表名可能不同）
    try:
        from app.models.user_role import UserRole
    except ImportError:
        from app.models.user import UserRole  # fallback

    if db.query(User).filter_by(username="admin").first():
        log.info("[seed] 管理员账号已存在，跳过")
        return

    admin = User(
        username="admin",
        real_name="系统管理员",
        email="admin@company.com",
        password_hash=get_password_hash("Admin@123456"),
        status=True,
        auth_source="local",
    )
    db.add(admin)
    db.flush()

    role = db.query(Role).filter_by(name="super_admin").first()
    if role:
        db.add(UserRole(user_id=admin.id, role_id=role.id))

    log.info("[seed] 创建管理员账号 admin（初始密码：Admin@123456）")


if __name__ == "__main__":
    seed()
