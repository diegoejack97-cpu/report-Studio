from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from datetime import datetime, timezone
import stripe

from app.core.database import get_db
from app.core.auth import hash_password, verify_password, create_access_token, get_current_user
from app.core.config import settings
from app.models.user import User, PlanType

router = APIRouter()
stripe.api_key = settings.STRIPE_SECRET_KEY


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    plan: str
    reports_this_month: int
    reports_total: int
    plan_limit: int
    can_create_report: bool
    subscription_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def _price_to_plan_map():
    mapping = {
        settings.STRIPE_PRICE_INDIVIDUAL_LITE or settings.STRIPE_PRICE_STARTER: (PlanType.STARTER, settings.PLAN_STARTER_LIMIT),
        settings.STRIPE_PRICE_INDIVIDUAL_PRO or settings.STRIPE_PRICE_PRO: (PlanType.PRO, settings.PLAN_PRO_LIMIT),
        settings.STRIPE_PRICE_INDIVIDUAL_PLUS or settings.STRIPE_PRICE_BUSINESS: (PlanType.BUSINESS, settings.PLAN_BUSINESS_LIMIT),
        settings.STRIPE_PRICE_STARTER or settings.STRIPE_PRICE_INDIVIDUAL_LITE: (PlanType.STARTER, settings.PLAN_STARTER_LIMIT),
        settings.STRIPE_PRICE_PRO or settings.STRIPE_PRICE_INDIVIDUAL_PRO: (PlanType.PRO, settings.PLAN_PRO_LIMIT),
        settings.STRIPE_PRICE_BUSINESS or settings.STRIPE_PRICE_INDIVIDUAL_PLUS: (PlanType.BUSINESS, settings.PLAN_BUSINESS_LIMIT),
    }
    return {price_id: plan for price_id, plan in mapping.items() if price_id}


async def _sync_existing_stripe_subscription(user: User, db: AsyncSession):
    if not settings.STRIPE_SECRET_KEY or settings.STRIPE_SECRET_KEY == "sk_test_placeholder":
        return

    try:
        customers = stripe.Customer.list(email=user.email, limit=1).data
        if not customers:
            return

        customer = customers[0]
        user.stripe_customer_id = customer.id

        subscriptions = stripe.Subscription.list(customer=customer.id, status="all", limit=5).data
        if not subscriptions:
            await db.flush()
            return

        valid_statuses = {"active", "trialing", "past_due", "incomplete"}
        price_map = _price_to_plan_map()
        active_subscription = next((sub for sub in subscriptions if sub.get("status") in valid_statuses), subscriptions[0])
        items = active_subscription.get("items", {}).get("data", [])
        price_id = items[0].get("price", {}).get("id", "") if items else ""
        plan_details = price_map.get(price_id)

        user.stripe_subscription_id = active_subscription.get("id")
        user.subscription_status = active_subscription.get("status") or "inactive"
        if plan_details:
            user.plan = plan_details[0]
            user.reports_limit = plan_details[1]

        current_period_end = active_subscription.get("current_period_end")
        if current_period_end:
            user.plan_expires_at = datetime.fromtimestamp(current_period_end, tz=timezone.utc)

        await db.flush()
    except Exception:
        # Billing reconciliation is best effort and must not block auth flows.
        return


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == data.email.lower()))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Senha deve ter no mínimo 8 caracteres")

    user = User(
        email=data.email.lower(),
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        plan=PlanType.FREE,
        reports_limit=settings.PLAN_FREE_LIMIT,
        reports_used=0,
        reports_this_month=0,
        usage_reset_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    await _sync_existing_stripe_subscription(user, db)
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user=UserOut(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            plan=user.plan,
            reports_this_month=user.reports_this_month,
            reports_total=user.reports_total,
            plan_limit=user.plan_limit,
            can_create_report=user.can_create_report,
            subscription_status=user.subscription_status,
            created_at=user.created_at,
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email.lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Conta desativada")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        user=UserOut(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            plan=user.plan,
            reports_this_month=user.reports_this_month,
            reports_total=user.reports_total,
            plan_limit=user.plan_limit,
            can_create_report=user.can_create_report,
            subscription_status=user.subscription_status,
            created_at=user.created_at,
        ),
    )


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        plan=current_user.plan,
        reports_this_month=current_user.reports_this_month,
        reports_total=current_user.reports_total,
        plan_limit=current_user.plan_limit,
        can_create_report=current_user.can_create_report,
        subscription_status=current_user.subscription_status,
        created_at=current_user.created_at,
    )
