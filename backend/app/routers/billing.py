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
    customer_id = session.get("customer")
    subscription = session.get("subscription")
    if not customer_id or not subscription:
        raise HTTPException(status_code=400, detail="Sessão do Stripe não possui customer/subscription.")

    if isinstance(subscription, str):
        subscription = stripe.Subscription.retrieve(subscription)

    price_id = _extract_subscription_price_id(subscription)
    await activate_user_subscription(
        db=db,
        user=user,
        stripe_customer_id=customer_id,
        stripe_subscription_id=subscription["id"],
        price_id=price_id,
        status=subscription.get("status", "active"),
        current_period_end=subscription.get("current_period_end"),
    )
    return session, subscription


@router.get("/public-config")
async def public_config():
    return {
        "publishable_key": settings.STRIPE_PUBLIC_KEY,
        "embedded_checkout_enabled": bool(
            settings.STRIPE_PUBLIC_KEY and settings.STRIPE_PUBLIC_KEY != "pk_test_placeholder"
        ),
    }


@router.post("/create-checkout-session")
async def create_checkout_session_endpoint(
    data: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    plan_name = _resolve_plan_name(data)
    price_id = get_price_id_for_plan(plan_name)
    session = await create_checkout_session(current_user.id, price_id, db)
    return {"checkout_url": session.url}


@router.post("/checkout")
async def create_checkout_session_compat(
    data: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_checkout_session_endpoint(data, current_user, db)


@router.get("/confirm-session")
async def confirm_checkout_session(
    session_id: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session, subscription = await _sync_session_subscription(db, current_user, session_id)
    return {
        "message": "Assinatura ativada com sucesso.",
        "customer_id": session.get("customer"),
        "subscription_id": subscription.get("id"),
        "plan": current_user.plan,
        "reports_limit": current_user.reports_limit,
    }


@router.post("/customer-portal")
async def customer_portal(
    data: CustomerPortalRequest,
    current_user: User = Depends(get_current_user),
):
    if data.user_id and data.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Você não pode abrir o portal de outro usuário.")
    if not current_user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="Usuário sem customer_id no Stripe.")
    portal = create_customer_portal(current_user.stripe_customer_id)
    return {"portal_url": portal.url}


@router.post("/portal")
async def customer_portal_compat(
    data: CustomerPortalRequest,
    current_user: User = Depends(get_current_user),
):
    return await customer_portal(data, current_user)


@router.get("/me", response_model=BillingMeResponse)
async def billing_me(current_user: User = Depends(get_current_user)):
    return BillingMeResponse(
        current_plan=current_user.plan,
        reports_limit=current_user.reports_limit or current_user.plan_limit,
        reports_used=current_user.reports_used,
        subscription_status=current_user.subscription_status,
        next_billing_date=current_user.plan_expires_at,
    )


@router.get("/status")
async def billing_status_compat(current_user: User = Depends(get_current_user)):
    return {
        "plan": current_user.plan,
        "subscription_status": current_user.subscription_status,
        "plan_expires_at": current_user.plan_expires_at,
        "reports_this_month": current_user.reports_used,
        "plan_limit": current_user.reports_limit or current_user.plan_limit,
        "can_create_report": current_user.can_create_report,
    }


async def _handle_checkout_completed(db: AsyncSession, session_obj: dict):
    user = None
    user_id = (session_obj.get("metadata") or {}).get("user_id")
    if user_id:
        result = await db.execute(select(User).where(User.id == int(user_id)))
        user = result.scalar_one_or_none()

    customer_id = session_obj.get("customer")
    if not user and customer_id:
        user = await find_user_for_customer(db, customer_id)

    if not user:
        return

    session_id = session_obj.get("id")
    if not session_id:
        return

    await _sync_session_subscription(db, user, session_id)


async def _handle_invoice_payment_succeeded(db: AsyncSession, invoice: dict):
    customer_id = invoice.get("customer")
    subscription_id = invoice.get("subscription")
    user = await find_user_for_customer(db, customer_id)
    if not user:
        return

    line_items = invoice.get("lines", {}).get("data", [])
    price_id = ""
    if line_items:
        price_id = line_items[0].get("price", {}).get("id", "")
    if not price_id and subscription_id:
        subscription = stripe.Subscription.retrieve(subscription_id)
        price_id = _extract_subscription_price_id(subscription)

    await activate_user_subscription(
        db=db,
        user=user,
        stripe_customer_id=customer_id,
        stripe_subscription_id=subscription_id,
        price_id=price_id,
        status="active",
        current_period_end=invoice.get("period_end"),
    )
    await record_payment(
        db=db,
        user_id=user.id,
        amount=invoice.get("amount_paid", 0),
        currency=invoice.get("currency", "brl"),
        stripe_invoice_id=invoice.get("id"),
        status="paid",
    )


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
