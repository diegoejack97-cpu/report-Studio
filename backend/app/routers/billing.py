from datetime import datetime, timezone
import logging
from typing import Optional

import stripe
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.background import run_async_task
from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.subscription import Subscription
from app.models.user import PlanType, User
from app.services.stripe_service import (
    activate_user_subscription,
    construct_webhook_event,
    create_checkout_session,
    create_customer_portal,
    deactivate_user_subscription,
    find_user_for_customer,
    get_user_by_id,
    get_or_create_customer,
    get_plan_config_by_price,
    get_price_id_for_plan,
    record_payment,
    retrieve_checkout_session,
)
from app.services.email_events import (
    send_payment_failed_email,
    send_payment_success_email,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class CheckoutSessionRequest(BaseModel):
    plan_name: Optional[str] = None
    plan: Optional[str] = None


class CustomerPortalRequest(BaseModel):
    user_id: Optional[int] = None


class BillingMeResponse(BaseModel):
    current_plan: str
    reports_limit: int
    reports_used: int
    subscription_status: str
    next_billing_date: Optional[datetime] = None


def _resolve_plan_name(data: CheckoutSessionRequest) -> str:
    plan_name = (data.plan_name or data.plan or "").strip()
    if not plan_name:
        raise HTTPException(status_code=400, detail="plan_name é obrigatório.")
    return plan_name


def _extract_subscription_price_id(subscription_obj) -> str:
    items = subscription_obj.get("items", {}).get("data", [])
    if not items:
        raise HTTPException(status_code=400, detail="Assinatura do Stripe sem itens.")
    return items[0].get("price", {}).get("id", "")


async def _sync_session_subscription(db: AsyncSession, user: User, session_id: str):
    session = retrieve_checkout_session(session_id)

    # 🔥 CORREÇÃO PRINCIPAL AQUI
    customer = session.get("customer")
    customer_id = customer.id if hasattr(customer, "id") else customer

    subscription = session.get("subscription")

    if not customer_id or not subscription:
        raise HTTPException(
            status_code=400,
            detail="Sessão do Stripe não possui customer/subscription."
        )

    # 🔥 GARANTE QUE subscription É OBJETO COMPLETO
    if isinstance(subscription, str):
        subscription = stripe.Subscription.retrieve(subscription)

    # 🔥 EXTRAÇÃO DO PRICE
    price_id = _extract_subscription_price_id(subscription)

    # 🔥 ATIVAÇÃO DA ASSINATURA
    await activate_user_subscription(
        db=db,
        user=user,
        stripe_customer_id=customer_id,  # ✅ agora sempre string
        stripe_subscription_id=subscription["id"],
        price_id=price_id,
        status=subscription.get("status", "active"),
        current_period_end=subscription.get("current_period_end"),
    )

    return session, subscription

@router.post("/create-checkout-session")
async def create_stripe_checkout_session(
    data: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan_name = _resolve_plan_name(data)

    try:
        price_id = get_price_id_for_plan(plan_name)
        customer_id = await get_or_create_customer(db, current_user)
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=f"{settings.APP_URL}/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.APP_URL}/pricing",
            metadata={
                "user_id": str(current_user.id),
                "plan_name": plan_name,
            },
        )
    except HTTPException:
        raise
    except stripe.error.StripeError as exc:
        message = getattr(exc, "user_message", None) or str(exc)
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao criar checkout na Stripe: {message}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Erro interno ao criar sessão de checkout.",
        ) from exc

    if not getattr(session, "url", None):
        raise HTTPException(
            status_code=500,
            detail="Stripe não retornou URL de checkout.",
        )

    return {"checkout_url": session.url}


@router.get("/public-config")
async def get_public_billing_config():
    return {"publishable_key": settings.STRIPE_PUBLIC_KEY}


async def _handle_invoice_payment_failed(
    db: AsyncSession,
    invoice: dict,
    background_tasks: BackgroundTasks | None = None,
):
    customer_id = invoice.get("customer")
    user = await find_user_for_customer(db, customer_id)
    if not user:
        return

    user.subscription_status = "past_due"
    await db.flush()
    await record_payment(
        db=db,
        user_id=user.id,
        amount=invoice.get("amount_due", 0),
        currency=invoice.get("currency", "brl"),
        stripe_invoice_id=invoice.get("id"),
        status="failed",
    )
    if background_tasks is not None:
        background_tasks.add_task(run_async_task, send_payment_failed_email(user))


async def _handle_subscription_updated(db: AsyncSession, subscription: dict):
    customer_id = subscription.get("customer")
    user = await find_user_for_customer(db, customer_id)
    if not user:
        return

    price_id = _extract_subscription_price_id(subscription)
    status = subscription.get("status", "inactive")
    if status in {"active", "trialing", "past_due", "incomplete"}:
        await activate_user_subscription(
            db=db,
            user=user,
            stripe_customer_id=customer_id,
            stripe_subscription_id=subscription.get("id"),
            price_id=price_id,
            status=status,
            current_period_end=subscription.get("current_period_end"),
        )
        return

    await deactivate_user_subscription(
        db=db,
        user=user,
        stripe_subscription_id=subscription.get("id"),
        status=status,
    )


async def _handle_subscription_deleted(db: AsyncSession, subscription: dict):
    customer_id = subscription.get("customer")
    user = await find_user_for_customer(db, customer_id)
    if not user:
        return

    await deactivate_user_subscription(
        db=db,
        user=user,
        stripe_subscription_id=subscription.get("id"),
        status="canceled",
    )


async def get_user_by_stripe_customer(db: AsyncSession, customer_id: str) -> Optional[User]:
    return await find_user_for_customer(db, customer_id)


async def handle_checkout_completed(session: dict, db: AsyncSession):
    try:
        customer_id = session.get("customer")
        user_id = (session.get("metadata") or {}).get("user_id")
        plan_name = (session.get("metadata") or {}).get("plan_name", "pro")
        plan_value = plan_name if plan_name in PlanType._value2member_map_ else PlanType.PRO.value

        if not user_id:
            logger.warning("Stripe checkout.session.completed sem metadata.user_id.")
            return

        try:
            user = await get_user_by_id(db, int(user_id))
        except (TypeError, ValueError):
            logger.warning(
                "Stripe checkout.session.completed com metadata.user_id invalido: %s.",
                user_id,
            )
            return
        except HTTPException:
            logger.warning(
                "Stripe checkout.session.completed sem usuario para user_id=%s.",
                user_id,
            )
            return

        if not user:
            logger.warning(
                "Stripe checkout.session.completed sem usuario para user_id=%s.",
                user_id,
            )
            return

        if customer_id and not user.stripe_customer_id:
            user.stripe_customer_id = customer_id

        subscription_id = session.get("subscription")
        user.subscription_status = "active"
        user.is_active = True
        user.plan = PlanType(plan_value)
        if subscription_id:
            user.stripe_subscription_id = subscription_id

        await db.commit()
    except Exception:
        logger.exception("Erro ao processar checkout.session.completed.")
        await db.rollback()


async def _handle_checkout_completed(db: AsyncSession, session: dict):
    await handle_checkout_completed(session, db)


async def handle_invoice_payment_succeeded(
    event,
    db: AsyncSession,
    background_tasks: BackgroundTasks | None = None,
):
    try:
        invoice = event["data"]["object"]
        customer_id = invoice.get("customer")

        if customer_id is None:
            logger.warning("Stripe invoice.payment_succeeded sem customer_id.")
            return

        user = await get_user_by_stripe_customer(db, customer_id)
        if not user:
            logger.warning(
                "Stripe invoice.payment_succeeded sem usuario para customer_id=%s.",
                customer_id,
            )
            return

        user.subscription_status = "active"
        user.is_active = True
        if not user.stripe_customer_id:
            user.stripe_customer_id = customer_id

        subscription_id = invoice.get("subscription") or user.stripe_subscription_id
        lines = (invoice.get("lines") or {}).get("data", [])
        price_id = None
        current_period_end = None
        if lines:
            price_id = ((lines[0] or {}).get("price") or {}).get("id")
            period = (lines[0] or {}).get("period") or {}
            current_period_end = period.get("end")

        if price_id and subscription_id:
            await activate_user_subscription(
                db=db,
                user=user,
                stripe_customer_id=customer_id,
                stripe_subscription_id=subscription_id,
                price_id=price_id,
                status="active",
                current_period_end=current_period_end,
            )
        else:
            if subscription_id:
                user.stripe_subscription_id = subscription_id

            stmt = select(Subscription).where(Subscription.user_id == user.id)
            if subscription_id:
                stmt = select(Subscription).where(Subscription.stripe_subscription_id == subscription_id)
            result = await db.execute(stmt)
            subscription = result.scalar_one_or_none()
            if subscription:
                subscription.status = "active"
                if subscription_id:
                    subscription.stripe_subscription_id = subscription_id
                subscription.stripe_customer_id = customer_id

            await db.flush()

        await record_payment(
            db=db,
            user_id=user.id,
            amount=invoice.get("amount_paid", invoice.get("amount_due", 0)),
            currency=invoice.get("currency", "brl"),
            stripe_invoice_id=invoice.get("id"),
            status="paid",
        )
        await db.commit()
        if background_tasks is not None:
            background_tasks.add_task(run_async_task, send_payment_success_email(user))
    except Exception:
        logger.exception("Erro ao processar invoice.payment_succeeded.")
        await db.rollback()


async def _handle_invoice_payment_succeeded(
    db: AsyncSession,
    invoice: dict,
    background_tasks: BackgroundTasks | None = None,
):
    await handle_invoice_payment_succeeded(
        {"data": {"object": invoice}},
        db,
        background_tasks=background_tasks,
    )


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    stripe_signature: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    try:
        payload = await request.body()
        event = construct_webhook_event(payload, stripe_signature)
        event_type = event["type"]
        data = event["data"]["object"]

        if event_type == "checkout.session.completed":
            await _handle_checkout_completed(db, data)
        elif event_type == "invoice.payment_succeeded":
            await handle_invoice_payment_succeeded(event, db, background_tasks=background_tasks)
        elif event_type == "invoice.payment_failed":
            await _handle_invoice_payment_failed(db, data, background_tasks=background_tasks)
        elif event_type == "customer.subscription.updated":
            await _handle_subscription_updated(db, data)
        elif event_type == "customer.subscription.deleted":
            await _handle_subscription_deleted(db, data)
    except Exception:
        logger.exception("Erro ao processar webhook Stripe.")
        await db.rollback()

    return {"status": "success"}


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
            "plan": row.plan,
            "status": row.status,
            "current_period_end": row.current_period_end,
            "created_at": row.created_at,
        }
        for row in rows
    ]
