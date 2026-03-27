from datetime import datetime, timezone
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, get_current_user_optional
from app.core.database import get_db
from app.models.subscription import Subscription
from app.models.user import PlanType, User
from app.services.stripe_service import (
    clear_downgrade_schedule,
    construct_webhook_event,
    create_checkout_session,
    create_customer_portal,
    deactivate_user_subscription,
    find_user_for_customer,
    get_or_create_customer,
    get_plan_rank,
    get_price_id_for_plan,
    get_subscription_item_id,
    record_payment,
    retrieve_checkout_session,
    retrieve_subscription,
    schedule_downgrade,
    sync_subscription_by_id,
    sync_subscription_state,
    update_subscription_cancelation,
    update_subscription_price,
)

router = APIRouter()
webhook_router = APIRouter()
logger = logging.getLogger(__name__)


class CheckoutSessionRequest(BaseModel):
    plan_name: Optional[str] = None
    plan: Optional[str] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CustomerPortalRequest(BaseModel):
    return_url: Optional[str] = None


class PriceChangeRequest(BaseModel):
    new_price_id: str


class BillingManageResponse(BaseModel):
    status: str
    message: str
    current_plan: str
    current_price_id: Optional[str] = None
    pending_price_id: Optional[str] = None
    subscription_status: str
    cancel_at_period_end: bool = False
    current_period_end: Optional[datetime] = None


class BillingStatusResponse(BillingManageResponse):
    reports_limit: int
    reports_used: int


class ConfirmSessionResponse(BaseModel):
    status: str
    session_id: str
    user_id: int
    email: str
    plan: str
    subscription_status: str
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    stripe_price_id: Optional[str] = None


def _serialize_billing(user: User, message: str = "ok", status_label: str = "active") -> BillingManageResponse:
    return BillingManageResponse(
        status=status_label,
        message=message,
        current_plan=user.plan.value if isinstance(user.plan, PlanType) else str(user.plan),
        current_price_id=user.stripe_price_id,
        pending_price_id=user.pending_price_id,
        subscription_status=user.subscription_status,
        cancel_at_period_end=bool(user.cancel_at_period_end),
        current_period_end=user.current_period_end or user.plan_expires_at,
    )


def _serialize_billing_status(user: User) -> BillingStatusResponse:
    base = _serialize_billing(user, status_label=user.subscription_status or "inactive")
    return BillingStatusResponse(
        **base.model_dump(),
        reports_limit=user.plan_limit,
        reports_used=max(user.reports_used or 0, user.reports_this_month or 0),
    )


def _resolve_plan_name(data: CheckoutSessionRequest) -> str:
    plan_name = (data.plan_name or data.plan or "").strip()
    if not plan_name:
        raise HTTPException(status_code=400, detail="plan_name é obrigatório.")
    return plan_name


async def _resolve_checkout_user(
    db: AsyncSession,
    session: dict,
    current_user: User | None = None,
) -> User:
    if current_user is not None:
        return current_user

    metadata = session.get("metadata") or {}
    user_id = metadata.get("user_id")
    if user_id:
        result = await db.execute(select(User).where(User.id == int(user_id)))
        user = result.scalar_one_or_none()
        if user:
            return user

    customer_id = session.get("customer")
    if customer_id:
        user = await find_user_for_customer(db, customer_id)
        if user:
            return user

    raise HTTPException(status_code=404, detail="Usuário do checkout não encontrado.")


async def _get_owned_subscription(current_user: User) -> dict:
    if not current_user.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="Usuário não possui assinatura ativa na Stripe.")

    subscription = retrieve_subscription(current_user.stripe_subscription_id)
    customer_id = subscription.get("customer")
    if current_user.stripe_customer_id and customer_id != current_user.stripe_customer_id:
        raise HTTPException(status_code=403, detail="Assinatura não pertence ao usuário autenticado.")
    return subscription


def _validate_price_change(current_price_id: Optional[str], new_price_id: str, mode: str) -> None:
    current_rank = get_plan_rank(current_price_id)
    new_rank = get_plan_rank(new_price_id)
    if not new_rank:
        raise HTTPException(status_code=400, detail="new_price_id inválido.")
    if current_price_id == new_price_id:
        raise HTTPException(status_code=400, detail="O usuário já está nesse plano.")
    if mode == "upgrade" and new_rank <= current_rank:
        raise HTTPException(status_code=400, detail="Upgrade inválido para o plano informado.")
    if mode == "downgrade" and new_rank >= current_rank:
        raise HTTPException(status_code=400, detail="Downgrade inválido para o plano informado.")


async def _sync_session_subscription(db: AsyncSession, user: User, session_id: str) -> ConfirmSessionResponse:
    session = retrieve_checkout_session(session_id)
    session_status = session.get("status")
    payment_status = session.get("payment_status")
    subscription = session.get("subscription")

    if session_status != "complete" or payment_status not in {"paid", "no_payment_required"}:
        return ConfirmSessionResponse(
            status="pending",
            session_id=session_id,
            user_id=user.id,
            email=user.email,
            plan=user.plan.value if isinstance(user.plan, PlanType) else str(user.plan),
            subscription_status=user.subscription_status,
            stripe_customer_id=user.stripe_customer_id,
            stripe_subscription_id=user.stripe_subscription_id,
            stripe_price_id=user.stripe_price_id,
        )

    if isinstance(subscription, str):
        await sync_subscription_by_id(db, subscription)
    elif subscription and subscription.get("id"):
        await sync_subscription_state(db, user, subscription)

    await db.commit()
    await db.refresh(user)
    return ConfirmSessionResponse(
        status="active",
        session_id=session_id,
        user_id=user.id,
        email=user.email,
        plan=user.plan.value if isinstance(user.plan, PlanType) else str(user.plan),
        subscription_status=user.subscription_status,
        stripe_customer_id=user.stripe_customer_id,
        stripe_subscription_id=user.stripe_subscription_id,
        stripe_price_id=user.stripe_price_id,
    )


@router.post("/create-checkout-session")
async def create_stripe_checkout_session(
    data: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan_name = _resolve_plan_name(data)
    price_id = get_price_id_for_plan(plan_name)
    session = await create_checkout_session(
        current_user.id,
        price_id,
        db,
        success_url=data.success_url,
        cancel_url=data.cancel_url,
    )
    return {"checkout_url": session.url}


@router.post("/checkout")
async def create_checkout_session_alias(
    data: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_stripe_checkout_session(data, current_user=current_user, db=db)


@router.get("/public-config")
async def get_public_billing_config():
    from app.core.config import settings
    return {"publishable_key": settings.STRIPE_PUBLIC_KEY}


@router.get("/status", response_model=BillingStatusResponse)
async def get_billing_status(current_user: User = Depends(get_current_user)):
    return _serialize_billing_status(current_user)


@router.post("/portal")
async def create_billing_portal(
    data: CustomerPortalRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.stripe_customer_id:
        await get_or_create_customer(db, current_user)
        await db.flush()
    session = create_customer_portal(current_user.stripe_customer_id, return_url=(data.return_url or "").strip() or None)
    return {"portal_url": session.url}


@router.get("/confirm-session", response_model=ConfirmSessionResponse)
async def confirm_checkout_session(
    session_id: str = Query(..., min_length=1),
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    checkout_session = retrieve_checkout_session(session_id)
    user = await _resolve_checkout_user(db, checkout_session, current_user=current_user)
    return await _sync_session_subscription(db, user, session_id)


@router.post("/cancel", response_model=BillingManageResponse)
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subscription = await _get_owned_subscription(current_user)
    updated = update_subscription_cancelation(subscription["id"], True)
    current_user.cancel_at_period_end = True
    current_user.current_period_end = datetime.fromtimestamp(updated.get("current_period_end"), tz=timezone.utc) if updated.get("current_period_end") else current_user.current_period_end
    await db.flush()
    await db.commit()
    return _serialize_billing(current_user, message="Cancelamento agendado para o fim do período.", status_label="canceling")


@router.post("/resume", response_model=BillingManageResponse)
async def resume_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subscription = await _get_owned_subscription(current_user)
    updated = update_subscription_cancelation(subscription["id"], False)
    current_user.cancel_at_period_end = False
    if current_user.pending_price_id:
        clear_downgrade_schedule(subscription["id"])
        current_user.pending_price_id = None
    current_user.current_period_end = datetime.fromtimestamp(updated.get("current_period_end"), tz=timezone.utc) if updated.get("current_period_end") else current_user.current_period_end
    await db.flush()
    await db.commit()
    return _serialize_billing(current_user, message="Assinatura reativada com sucesso.", status_label="active")


@router.post("/upgrade", response_model=BillingManageResponse)
async def upgrade_subscription(
    data: PriceChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subscription = await _get_owned_subscription(current_user)
    current_price_id = current_user.stripe_price_id or ((subscription.get("items") or {}).get("data", [{}])[0].get("price") or {}).get("id")
    _validate_price_change(current_price_id, data.new_price_id, "upgrade")
    subscription_item_id = get_subscription_item_id(subscription)
    update_subscription_price(subscription["id"], subscription_item_id, data.new_price_id)
    clear_downgrade_schedule(subscription["id"])
    current_user.pending_price_id = None
    await db.flush()
    await db.commit()
    return _serialize_billing(current_user, message="Upgrade solicitado. A atualização será confirmada via webhook.", status_label="pending")


@router.post("/downgrade", response_model=BillingManageResponse)
async def downgrade_subscription(
    data: PriceChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    subscription = await _get_owned_subscription(current_user)
    current_price_id = current_user.stripe_price_id or ((subscription.get("items") or {}).get("data", [{}])[0].get("price") or {}).get("id")
    _validate_price_change(current_price_id, data.new_price_id, "downgrade")
    schedule_downgrade(subscription, data.new_price_id)
    current_user.pending_price_id = data.new_price_id
    await db.flush()
    await db.commit()
    return _serialize_billing(current_user, message="Downgrade agendado para o próximo ciclo.", status_label="scheduled")


@router.get("/subscriptions")
async def list_user_subscriptions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == current_user.id)
        .order_by(Subscription.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": row.id,
            "stripe_subscription_id": row.stripe_subscription_id,
            "stripe_customer_id": row.stripe_customer_id,
            "stripe_price_id": row.stripe_price_id,
            "plan": row.plan,
            "status": row.status,
            "cancel_at_period_end": row.cancel_at_period_end,
            "pending_price_id": row.pending_price_id,
            "current_period_end": row.current_period_end,
            "created_at": row.created_at,
        }
        for row in rows
    ]


async def _handle_checkout_completed(db: AsyncSession, session: dict):
    metadata = session.get("metadata") or {}
    user_id = metadata.get("user_id")
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    if not user_id:
        logger.warning("checkout.session.completed sem metadata.user_id.")
        return

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("checkout.session.completed sem usuário user_id=%s.", user_id)
        return

    if customer_id:
        user.stripe_customer_id = customer_id
    if subscription_id:
        user.stripe_subscription_id = subscription_id
        await sync_subscription_by_id(db, subscription_id)
    else:
        await db.flush()
    await db.commit()


async def _handle_invoice_paid(db: AsyncSession, invoice: dict):
    subscription_id = invoice.get("subscription")
    customer_id = invoice.get("customer")
    logger.info(
        "invoice.paid recebido invoice_id=%s subscription_id=%s customer_id=%s",
        invoice.get("id"),
        subscription_id,
        customer_id,
    )

    user = None
    if subscription_id:
        user = await sync_subscription_by_id(db, subscription_id)
    elif customer_id:
        user = await find_user_for_customer(db, customer_id)

    if not user:
        logger.warning("invoice.paid sem usuário associado.")
        return

    await record_payment(
        db=db,
        user_id=user.id,
        amount=invoice.get("amount_paid", invoice.get("amount_due", 0)),
        currency=invoice.get("currency", "brl"),
        stripe_invoice_id=invoice.get("id"),
        status="paid",
    )
    await db.commit()


async def _handle_subscription_updated(db: AsyncSession, subscription: dict):
    subscription_id = subscription.get("id")
    if not subscription_id:
        logger.warning("customer.subscription.updated sem subscription id.")
        return
    await sync_subscription_by_id(db, subscription_id)
    await db.commit()


async def _handle_subscription_deleted(db: AsyncSession, subscription: dict):
    subscription_id = subscription.get("id")
    user = None
    if subscription_id:
        result = await db.execute(select(User).where(User.stripe_subscription_id == subscription_id))
        user = result.scalar_one_or_none()
    if not user and subscription.get("customer"):
        user = await find_user_for_customer(db, subscription.get("customer"))
    if not user:
        logger.warning("customer.subscription.deleted sem usuário associado.")
        return
    await deactivate_user_subscription(db, user, subscription_id, "canceled")
    await db.commit()


async def _dispatch_webhook(db: AsyncSession, event_type: str, data: dict):
    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(db, data)
        return
    if event_type in {"invoice.paid", "invoice.payment_succeeded"}:
        await _handle_invoice_paid(db, data)
        return
    if event_type == "customer.subscription.updated":
        await _handle_subscription_updated(db, data)
        return
    if event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(db, data)
        return
    logger.info("Webhook Stripe ignorado event_type=%s.", event_type)


@router.post("/webhook")
async def stripe_webhook_alias(
    request: Request,
    stripe_signature: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    payload = await request.body()
    event = construct_webhook_event(payload, stripe_signature)
    logger.info("Stripe webhook alias event_type=%s event_id=%s.", event["type"], event.get("id"))
    await _dispatch_webhook(db, event["type"], event["data"]["object"])
    return {"status": "success"}


@webhook_router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = await request.body()
        event = construct_webhook_event(payload, stripe_signature)
        logger.info("Stripe webhook event_type=%s event_id=%s.", event["type"], event.get("id"))
        await _dispatch_webhook(db, event["type"], event["data"]["object"])
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        logger.exception("Erro ao processar webhook Stripe.")
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erro ao processar webhook Stripe.")

    return {"status": "success"}
