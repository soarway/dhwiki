from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("departments.id"), nullable=True
    )
    manager_user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    children: Mapped[list["Department"]] = relationship(
        "Department", back_populates="parent"
    )
    parent: Mapped[Optional["Department"]] = relationship(
        "Department", back_populates="children", remote_side=[id]
    )
    manager: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[manager_user_id], lazy="joined"
    )

    @property
    def manager_user_name(self) -> Optional[str]:
        return self.manager.real_name if self.manager else None
