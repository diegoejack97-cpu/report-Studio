from sqlalchemy import String, Boolean, Integer, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
import enum

from app.core.database import Base


class PlanType(str, enum.Enum):
    FREE = "free"
    STARTER = "starter"
    PRO = "pro"
    BUSINESS = "business"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Plan
    plan: Mapped[str] = mapped_column(SAEnum(PlanType), default=PlanType.FREE)
    reports_limit: Mapped[int] = mapped_column(Integer, default=3)
    reports_used: Mapped[int] = mapped_column(Integer, default=0)
    stripe_customer_id: Mapped[str] = mapped_column(String(255), nullable=True)
    subscription_id: Mapped[int] = mapped_column(Integer, nullable=True)
    stripe_subscription_id: Mapped[str] = mapped_column(String(255), nullable=True)
    stripe_price_id: Mapped[str] = mapped_column(String(255), nullable=True)
    subscription_status: Mapped[str] = mapped_column(String(50), default="inactive")
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    pending_price_id: Mapped[str] = mapped_column(String(255), nullable=True)
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    plan_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Usage
    reports_this_month: Mapped[int] = mapped_column(Integer, default=0)
    reports_total: Mapped[int] = mapped_column(Integer, default=0)
    usage_reset_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    reports: Mapped[list["Report"]] = relationship(  # noqa: F821
        "Report", back_populates="owner", cascade="all, delete-orphan"
    )
    subscriptions: Mapped[list["Subscription"]] = relationship(  # noqa: F821
        "Subscription", back_populates="user", cascade="all, delete-orphan"
    )
    payments: Mapped[list["Payment"]] = relationship(  # noqa: F821
        "Payment", back_populates="user", cascade="all, delete-orphan"
    )

    @property
    def password_hash(self) -> str:
        return self.hashed_password

    @password_hash.setter
    def password_hash(self, value: str) -> None:
        self.hashed_password = value

    @property
    def plan_limit(self) -> int:
        from app.core.config import settings
        limits = {
            PlanType.FREE:     settings.PLAN_FREE_LIMIT,
            PlanType.STARTER:  settings.PLAN_STARTER_LIMIT,
            PlanType.PRO:      settings.PLAN_PRO_LIMIT,
            PlanType.BUSINESS: settings.PLAN_BUSINESS_LIMIT,
        }
        limit = self.reports_limit or limits.get(self.plan, 3)
        return limit or 3

    @property
    def can_create_report(self) -> bool:
        now = datetime.now(timezone.utc)
        # Reset counter if new month
        if self.usage_reset_at.month != now.month or self.usage_reset_at.year != now.year:
            return True
        current_usage = max(self.reports_used or 0, self.reports_this_month or 0)
        return current_usage < self.plan_limit
