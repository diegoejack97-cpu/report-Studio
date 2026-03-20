from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    get_plan_config_by_price,
    get_price_id_for_plan,
    record_payment,
    retrieve_checkout_session,
)

router = APIRouter()


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

async def _handle_invoice_payment_failed(db: AsyncSession, invoice: dict):
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


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    payload = await request.body()
    event = construct_webhook_event(payload, stripe_signature)
    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(db, data)
    elif event_type == "invoice.payment_succeeded":
        await _handle_invoice_payment_succeeded(db, data)
    elif event_type == "invoice.payment_failed":
        await _handle_invoice_payment_failed(db, data)
    elif event_type == "customer.subscription.updated":
        await _handle_subscription_updated(db, data)
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(db, data)

    return {"received": True, "event_type": event_type}


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
