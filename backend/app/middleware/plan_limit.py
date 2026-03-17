from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.models.user import User


def reset_report_usage_if_needed(user: User) -> None:
    now = datetime.now(timezone.utc)
    reset = user.usage_reset_at
    if reset is None or reset.month != now.month or reset.year != now.year:
        user.reports_used = 0
        user.reports_this_month = 0
        user.usage_reset_at = now


def check_plan_limit(user: User) -> None:
    reset_report_usage_if_needed(user)
    current_usage = max(user.reports_used or 0, user.reports_this_month or 0)
    if current_usage >= user.plan_limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Você atingiu o limite do seu plano. Faça upgrade para continuar.",
        )
