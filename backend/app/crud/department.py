from typing import Optional
from sqlalchemy.orm import Session

from app.models.department import Department
from app.schemas.department import DepartmentCreate, DepartmentUpdate, DepartmentTree


def get_department(db: Session, dept_id: int) -> Optional[Department]:
    return db.query(Department).filter(Department.id == dept_id).first()


def get_all_departments(db: Session) -> list[Department]:
    return db.query(Department).all()


def create_department(db: Session, data: DepartmentCreate) -> Department:
    dept = Department(**data.model_dump())
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


def update_department(db: Session, dept: Department, data: DepartmentUpdate) -> Department:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(dept, field, value)
    db.commit()
    db.refresh(dept)
    return dept


def delete_department(db: Session, dept: Department) -> None:
    db.delete(dept)
    db.commit()


def build_tree(departments: list[Department]) -> list[DepartmentTree]:
    dept_map = {d.id: DepartmentTree.model_validate(d) for d in departments}
    for dept in dept_map.values():
        dept.children = []  # 清除 ORM relationship 已加载的子节点，避免重复
    roots = []
    for dept in dept_map.values():
        if dept.parent_id is None:
            roots.append(dept)
        elif dept.parent_id in dept_map:
            dept_map[dept.parent_id].children.append(dept)
    return roots
