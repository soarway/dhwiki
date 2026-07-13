from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_super_admin, get_current_user
from app.crud import department as crud
from app.schemas.department import (
    DepartmentCreate, DepartmentUpdate, DepartmentResponse, DepartmentTree
)
from app.models.user import User

router = APIRouter()


@router.get("/tree", response_model=list[DepartmentTree])
def get_department_tree(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    departments = crud.get_all_departments(db)
    return crud.build_tree(departments)


@router.post("", response_model=DepartmentResponse, status_code=201)
@router.post("/", response_model=DepartmentResponse, status_code=201, include_in_schema=False)
def create_department(
    data: DepartmentCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    return crud.create_department(db, data)


@router.put("/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: int,
    data: DepartmentUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    dept = crud.get_department(db, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="部门不存在")
    return crud.update_department(db, dept, data)


@router.delete("/{dept_id}", status_code=204)
def delete_department(
    dept_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    dept = crud.get_department(db, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="部门不存在")
    crud.delete_department(db, dept)
