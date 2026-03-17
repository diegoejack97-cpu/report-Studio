from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.payment import Payment
from app.models.subscription import Subscription
from app.models.user import PlanType, User

stripe.api_key = settings.STRIPE_SECRET_KEY

PLAN_CATALOG = {
    "individual_lite": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_LITE or settings.STRIPE_PRICE_STARTER,
        "plan": PlanType.STARTER,
        "reports_limit": settings.PLAN_STARTER_LIMIT,
    },
    "individual_pro": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_PRO or settings.STRIPE_PRICE_PRO,
        "plan": PlanType.PRO,
        "reports_limit": settings.PLAN_PRO_LIMIT,
    },
    "individual_plus": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_PLUS or settings.STRIPE_PRICE_BUSINESS,
        "plan": PlanType.BUSINESS,
        "reports_limit": settings.PLAN_BUSINESS_LIMIT,
    },
    # Compatibility aliases
    "starter": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_LITE or settings.STRIPE_PRICE_STARTER,
        "plan": PlanType.STARTER,
        "reports_limit": settings.PLAN_STARTER_LIMIT,
    },
    "pro": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_PRO or settings.STRIPE_PRICE_PRO,
        "plan": PlanType.PRO,
        "reports_limit": settings.PLAN_PRO_LIMIT,
    },
    "business": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_PLUS or settings.STRIPE_PRICE_BUSINESS,
        "plan": PlanType.BUSINESS,
        "reports_limit": settings.PLAN_BUSINESS_LIMIT,
    },
}

PRICE_ID_TO_PLAN = {}
for plan_name, config in PLAN_CATALOG.items():
    price_id = config.get("price_id")
    if price_id and price_id not in PRICE_ID_TO_PLAN:
        PRICE_ID_TO_PLAN[price_id] = {
            "plan_name": plan_name,
            "plan": config["plan"],
            "reports_limit": config["reports_limit"],
        }


def get_price_id_for_plan(plan_name: str) -> str:
    config = PLAN_CATALOG.get(plan_name)
    if not config or not config.get("price_id"):
        raise HTTPException(status_code=400, detail="Plano inválido ou não configurado no Stripe.")
    return config["price_id"]


def get_plan_config_by_price(price_id: str) -> dict:
    config = PRICE_ID_TO_PLAN.get(price_id)
    if not config:
        raise HTTPException(status_code=400, detail="Price ID do Stripe não mapeado para nenhum plano.")
    return config


async def get_user_by_id(db: AsyncSession, user_id: int) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return user


async def get_or_create_customer(db: AsyncSession, user: User) -> str:
    if user.stripe_customer_id:
        return user.stripe_customer_id

    customer = stripe.Customer.create(
        email=user.email,
        name=user.full_name,
        metadata={"user_id": str(user.id)},
    )
    user.stripe_customer_id = customer.id
    await db.flush()
    return customer.id


async def create_checkout_session(user_id: int, price_id: str, db: AsyncSession):
    user = await get_user_by_id(db, user_id)
    customer_id = await get_or_create_customer(db, user)

    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{settings.APP_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.APP_URL}/pricing",
            metadata={"user_id": str(user.id)},
            billing_address_collection="auto",
            allow_promotion_codes=True,
        )
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(status_code=400, detail=f"Erro ao criar checkout na Stripe: {message}") from exc
    return session


def retrieve_checkout_session(session_id: str):
    return stripe.checkout.Session.retrieve(
        session_id,
        expand=["subscription", "line_items.data.price", "customer"],
    )


def create_customer_portal(customer_id: str):
    try:
        return stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{settings.APP_URL}/dashboard",
        )
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(status_code=400, detail=f"Erro ao abrir portal da Stripe: {message}") from exc


def construct_webhook_event(payload: bytes, sig_header: Optional[str]):
    if not settings.STRIPE_WEBHOOK_SECRET or settings.STRIPE_WEBHOOK_SECRET == "whsec_placeholder":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="STRIPE_WEBHOOK_SECRET não configurado.",
        )

    try:
        return stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Payload de webhook inválido.") from exc
    except stripe.error.SignatureVerificationError as exc:
        raise HTTPException(status_code=400, detail="Assinatura do webhook inválida.") from exc


async def upsert_subscription_record(
    db: AsyncSession,
    user: User,
    stripe_subscription_id: str,
    stripe_customer_id: str,
    plan: str,
    status: str,
    current_period_end: Optional[datetime],
) -> Subscription:
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_subscription_id)
    )
    subscription = result.scalar_one_or_none()
    if not subscription:
        subscription = Subscription(
            user_id=user.id,
            stripe_subscription_id=stripe_subscription_id,
            stripe_customer_id=stripe_customer_id,
            plan=plan,
            status=status,
            current_period_end=current_period_end,
        )
        db.add(subscription)
        await db.flush()
    else:
        subscription.user_id = user.id
        subscription.stripe_customer_id = stripe_customer_id
        subscription.plan = plan
        subscription.status = status
        subscription.current_period_end = current_period_end
        await db.flush()

    user.subscription_id = subscription.id
    return subscription


async def record_payment(
    db: AsyncSession,
    user_id: int,
    amount: int,
    currency: str,
    stripe_invoice_id: Optional[str],
    status: str,
) -> Payment:
    payment = None
    if stripe_invoice_id:
        result = await db.execute(select(Payment).where(Payment.stripe_invoice_id == stripe_invoice_id))
        payment = result.scalar_one_or_none()

    if not payment:
        payment = Payment(
            user_id=user_id,
            amount=amount,
            currency=currency,
            stripe_invoice_id=stripe_invoice_id,
            status=status,
        )
        db.add(payment)
    else:
        payment.user_id = user_id
        payment.amount = amount
        payment.currency = currency
        payment.status = status

    await db.flush()
    return payment


async def find_user_for_customer(db: AsyncSession, stripe_customer_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.stripe_customer_id == stripe_customer_id))
    user = result.scalar_one_or_none()
    if user:
        return user

    customer = stripe.Customer.retrieve(stripe_customer_id)
    email = (customer.get("email") or "").strip().lower()
    if not email:
        return None

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user and not user.stripe_customer_id:
        user.stripe_customer_id = stripe_customer_id
        await db.flush()
    return user


async def activate_user_subscription(
    db: AsyncSession,
    user: User,
    stripe_customer_id: str,
    stripe_subscription_id: str,
    price_id: str,
    status: str,
    current_period_end: Optional[int],
):
    plan_config = get_plan_config_by_price(price_id)
    expires_at = None
    if current_period_end:
        expires_at = datetime.fromtimestamp(current_period_end, tz=timezone.utc)

    subscription = await upsert_subscription_record(
        db=db,
        user=user,
        stripe_subscription_id=stripe_subscription_id,
        stripe_customer_id=stripe_customer_id,
        plan=plan_config["plan"].value,
        status=status,
        current_period_end=expires_at,
    )

    user.plan = plan_config["plan"]
    user.reports_limit = plan_config["reports_limit"]
    user.reports_used = user.reports_used or 0
    user.reports_this_month = user.reports_used
    user.stripe_customer_id = stripe_customer_id
    user.stripe_subscription_id = stripe_subscription_id
    user.subscription_id = subscription.id
    user.subscription_status = status
    user.plan_expires_at = expires_at
    await db.flush()
    return subscription


async def deactivate_user_subscription(
    db: AsyncSession,
    user: User,
    stripe_subscription_id: Optional[str],
    status: str,
):
    if stripe_subscription_id:
        result = await db.execute(
            select(Subscription).where(Subscription.stripe_subscription_id == stripe_subscription_id)
        )
        subscription = result.scalar_one_or_none()
        if subscription:
            subscription.status = status
            await db.flush()

    user.plan = PlanType.FREE
    user.reports_limit = settings.PLAN_FREE_LIMIT
    user.reports_this_month = user.reports_used or 0
    user.stripe_subscription_id = stripe_subscription_id
    user.subscription_status = status
    user.plan_expires_at = None
    await db.flush()
