from datetime import datetime, timezone
import logging
from typing import Optional

import stripe
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.payment import Payment
from app.models.subscription import Subscription
from app.models.user import PlanType, User

logger = logging.getLogger(__name__)
stripe.api_key = settings.STRIPE_SECRET_KEY

PLAN_CATALOG = {
    "individual_lite": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_LITE or settings.STRIPE_PRICE_STARTER,
        "plan": PlanType.STARTER,
        "reports_limit": settings.PLAN_STARTER_LIMIT,
        "rank": 1,
    },
    "individual_pro": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_PRO or settings.STRIPE_PRICE_PRO,
        "plan": PlanType.PRO,
        "reports_limit": settings.PLAN_PRO_LIMIT,
        "rank": 2,
    },
    "individual_plus": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_PLUS or settings.STRIPE_PRICE_BUSINESS,
        "plan": PlanType.BUSINESS,
        "reports_limit": settings.PLAN_BUSINESS_LIMIT,
        "rank": 3,
    },
    "starter": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_LITE or settings.STRIPE_PRICE_STARTER,
        "plan": PlanType.STARTER,
        "reports_limit": settings.PLAN_STARTER_LIMIT,
        "rank": 1,
    },
    "pro": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_PRO or settings.STRIPE_PRICE_PRO,
        "plan": PlanType.PRO,
        "reports_limit": settings.PLAN_PRO_LIMIT,
        "rank": 2,
    },
    "business": {
        "price_id": settings.STRIPE_PRICE_INDIVIDUAL_PLUS or settings.STRIPE_PRICE_BUSINESS,
        "plan": PlanType.BUSINESS,
        "reports_limit": settings.PLAN_BUSINESS_LIMIT,
        "rank": 3,
    },
}

PRICE_ID_TO_PLAN: dict[str, dict] = {}
for plan_name, config in PLAN_CATALOG.items():
    price_id = config.get("price_id")
    if price_id and price_id not in PRICE_ID_TO_PLAN:
        PRICE_ID_TO_PLAN[price_id] = {
            "plan_name": plan_name,
            "plan": config["plan"],
            "reports_limit": config["reports_limit"],
            "rank": config["rank"],
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


def get_plan_rank(value: str | None) -> int:
    if not value:
        return 0
    if value in PRICE_ID_TO_PLAN:
        return PRICE_ID_TO_PLAN[value]["rank"]
    config = PLAN_CATALOG.get(value)
    return config["rank"] if config else 0


def _normalize_stripe_id(value) -> Optional[str]:
    if value is None:
        return None
    if hasattr(value, "id"):
        return value.id
    if isinstance(value, dict):
        return value.get("id")
    return value


def _to_datetime(timestamp: Optional[int]) -> Optional[datetime]:
    if not timestamp:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc)


def _extract_subscription_price_id(subscription_obj) -> str:
    items = (subscription_obj.get("items") or {}).get("data", [])
    if not items:
        raise HTTPException(status_code=400, detail="Assinatura do Stripe sem itens.")
    price = (items[0] or {}).get("price") or {}
    return price.get("id", "")


def _extract_subscription_item_id(subscription_obj) -> str:
    items = (subscription_obj.get("items") or {}).get("data", [])
    if not items:
        raise HTTPException(status_code=400, detail="Assinatura do Stripe sem itens.")
    item_id = (items[0] or {}).get("id")
    if not item_id:
        raise HTTPException(status_code=400, detail="Subscription item da Stripe não encontrado.")
    return item_id


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


async def create_checkout_session(
    user_id: int,
    price_id: str,
    db: AsyncSession,
    success_url: Optional[str] = None,
    cancel_url: Optional[str] = None,
):
    user = await get_user_by_id(db, user_id)
    customer_id = await get_or_create_customer(db, user)

    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=success_url or f"{settings.get_public_app_url()}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=cancel_url or f"{settings.get_public_app_url()}/pricing",
            metadata={"user_id": str(user.id), "user_email": user.email},
            client_reference_id=str(user.id),
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


def create_customer_portal(customer_id: str, return_url: Optional[str] = None):
    try:
        return stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url or f"{settings.get_public_app_url()}/dashboard",
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
    stripe_price_id: Optional[str],
    plan: str,
    status: str,
    current_period_end: Optional[datetime],
    cancel_at_period_end: bool = False,
    pending_price_id: Optional[str] = None,
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
            stripe_price_id=stripe_price_id,
            plan=plan,
            status=status,
            current_period_end=current_period_end,
            cancel_at_period_end=cancel_at_period_end,
            pending_price_id=pending_price_id,
        )
        db.add(subscription)
        await db.flush()
    else:
        subscription.user_id = user.id
        subscription.stripe_customer_id = stripe_customer_id
        subscription.stripe_price_id = stripe_price_id
        subscription.plan = plan
        subscription.status = status
        subscription.current_period_end = current_period_end
        subscription.cancel_at_period_end = cancel_at_period_end
        subscription.pending_price_id = pending_price_id
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


async def find_user_for_subscription(db: AsyncSession, stripe_subscription_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.stripe_subscription_id == stripe_subscription_id))
    user = result.scalar_one_or_none()
    if user:
        return user

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_subscription_id)
    )
    subscription = result.scalar_one_or_none()
    if not subscription:
        return None
    result = await db.execute(select(User).where(User.id == subscription.user_id))
    return result.scalar_one_or_none()


def retrieve_subscription(subscription_id: str):
    try:
        return stripe.Subscription.retrieve(subscription_id, expand=["items.data.price"])
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(status_code=400, detail=f"Erro ao consultar assinatura na Stripe: {message}") from exc


def update_subscription_cancelation(subscription_id: str, cancel_at_period_end: bool):
    try:
        return stripe.Subscription.modify(
            subscription_id,
            cancel_at_period_end=cancel_at_period_end,
        )
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(status_code=400, detail=f"Erro ao atualizar cancelamento: {message}") from exc


def update_subscription_price(subscription_id: str, subscription_item_id: str, new_price_id: str):
    try:
        return stripe.Subscription.modify(
            subscription_id,
            items=[{"id": subscription_item_id, "price": new_price_id}],
            proration_behavior="create_prorations",
        )
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(status_code=400, detail=f"Erro ao realizar upgrade: {message}") from exc


def _release_active_schedule(subscription_id: str) -> None:
    schedules = stripe.SubscriptionSchedule.list(subscription=subscription_id, limit=10).data
    for schedule in schedules:
        if schedule.get("status") not in {"released", "canceled", "completed"}:
            stripe.SubscriptionSchedule.release(schedule["id"])


def schedule_downgrade(subscription_obj, new_price_id: str):
    current_period_end = subscription_obj.get("current_period_end")
    current_price_id = _extract_subscription_price_id(subscription_obj)
    subscription_id = subscription_obj.get("id")
    if not current_period_end:
        raise HTTPException(status_code=400, detail="Assinatura sem current_period_end para agendar downgrade.")

    try:
        _release_active_schedule(subscription_id)
        return stripe.SubscriptionSchedule.create(
            from_subscription=subscription_id,
            end_behavior="release",
            phases=[
                {
                    "items": [{"price": current_price_id, "quantity": 1}],
                    "start_date": "now",
                    "end_date": current_period_end,
                },
                {
                    "items": [{"price": new_price_id, "quantity": 1}],
                },
            ],
        )
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(status_code=400, detail=f"Erro ao agendar downgrade: {message}") from exc


def clear_downgrade_schedule(subscription_id: str) -> None:
    try:
        _release_active_schedule(subscription_id)
    except stripe.error.StripeError as exc:
        logger.warning("Nao foi possivel liberar subscription schedule para %s: %s", subscription_id, exc)


async def activate_user_subscription(
    db: AsyncSession,
    user: User,
    stripe_customer_id: str,
    stripe_subscription_id: str,
    price_id: str,
    status: str,
    current_period_end: Optional[int],
    cancel_at_period_end: bool = False,
):
    plan_config = get_plan_config_by_price(price_id)
    expires_at = _to_datetime(current_period_end)
    pending_price_id = user.pending_price_id
    if pending_price_id == price_id:
        pending_price_id = None

    subscription = await upsert_subscription_record(
        db=db,
        user=user,
        stripe_subscription_id=stripe_subscription_id,
        stripe_customer_id=stripe_customer_id,
        stripe_price_id=price_id,
        plan=plan_config["plan"].value,
        status=status,
        current_period_end=expires_at,
        cancel_at_period_end=cancel_at_period_end,
        pending_price_id=pending_price_id,
    )

    user.plan = plan_config["plan"]
    user.reports_limit = plan_config["reports_limit"]
    user.reports_used = user.reports_used or 0
    user.reports_this_month = user.reports_used
    user.stripe_customer_id = stripe_customer_id
    user.stripe_subscription_id = stripe_subscription_id
    user.stripe_price_id = price_id
    user.subscription_id = subscription.id
    user.subscription_status = status
    user.cancel_at_period_end = cancel_at_period_end
    user.pending_price_id = pending_price_id
    user.current_period_end = expires_at
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
            subscription.cancel_at_period_end = False
            subscription.pending_price_id = None
            await db.flush()

    user.plan = PlanType.FREE
    user.reports_limit = settings.PLAN_FREE_LIMIT
    user.reports_this_month = user.reports_used or 0
    user.stripe_subscription_id = None
    user.stripe_price_id = None
    user.subscription_status = status
    user.cancel_at_period_end = False
    user.pending_price_id = None
    user.current_period_end = None
    user.plan_expires_at = None
    await db.flush()


async def sync_subscription_state(
    db: AsyncSession,
    user: User,
    subscription_obj: dict,
):
    customer_id = _normalize_stripe_id(subscription_obj.get("customer"))
    subscription_id = subscription_obj.get("id")
    status = subscription_obj.get("status", "inactive")

    if not customer_id:
        raise HTTPException(status_code=400, detail="Assinatura Stripe sem customer.")
    if not subscription_id:
        raise HTTPException(status_code=400, detail="Assinatura Stripe sem id.")

    if status in {"canceled", "unpaid", "incomplete_expired"}:
        await deactivate_user_subscription(db, user, subscription_id, status)
        return None

    price_id = _extract_subscription_price_id(subscription_obj)
    return await activate_user_subscription(
        db=db,
        user=user,
        stripe_customer_id=customer_id,
        stripe_subscription_id=subscription_id,
        price_id=price_id,
        status=status,
        current_period_end=subscription_obj.get("current_period_end"),
        cancel_at_period_end=bool(subscription_obj.get("cancel_at_period_end")),
    )


async def sync_subscription_by_id(db: AsyncSession, stripe_subscription_id: str) -> Optional[User]:
    subscription_obj = retrieve_subscription(stripe_subscription_id)
    user = await find_user_for_subscription(db, stripe_subscription_id)
    if not user:
        customer_id = _normalize_stripe_id(subscription_obj.get("customer"))
        if not customer_id:
            return None
        user = await find_user_for_customer(db, customer_id)
        if not user:
            return None
    await sync_subscription_state(db, user, subscription_obj)
    return user


def get_price_metadata(price_id: str) -> dict:
    return get_plan_config_by_price(price_id)


def get_subscription_item_id(subscription_obj) -> str:
    return _extract_subscription_item_id(subscription_obj)
