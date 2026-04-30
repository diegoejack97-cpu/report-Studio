from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone

from app.core.database import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), default="Relatório sem título")
    description: Mapped[str] = mapped_column(String(500), default="")

    # Config JSON — stores all editor state (columns, rows, KPIs, chart configs, colors)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    report_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Storage — original file path if uploaded
    source_file: Mapped[str] = mapped_column(String(500), nullable=True)

    # Export — cached HTML path
    html_path: Mapped[str] = mapped_column(String(500), nullable=True)

    # Stats
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    col_count: Mapped[int] = mapped_column(Integer, default=0)
    export_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="reports")  # noqa: F821
