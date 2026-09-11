"""Billing / subscription logic (Razorpay).

Model: every organization gets `TRIAL_DAYS` free from creation (`trial_ends_at`).
A successful recharge extends `paid_until`. Access is allowed while
`now < paid_until` OR `now < trial_ends_at` — nothing else decides it, so the
server-side gate (billing_gate.py) and the status API never disagree.

Razorpay is called directly over HTTPS (Basic Auth, key_id:key_secret) — no
SDK, consistent with the rest of this codebase (OpenAI/Bolna are called the
same way). Wire-up is complete; it is inert until RAZORPAY_KEY_ID /
RAZORPAY_KEY_SECRET are set (test-mode keys are free from the Razorpay
dashboard) — `is_configured()` gates every call that would otherwise 500.
"""
import hashlib
import hmac
import json
import logging
import math
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings
from app.core.database import get_db

logger = logging.getLogger(__name__)

# One plan today. A second plan is a data change here, not a schema change —
# CreateOrderRequest.plan already carries a plan key end to end.
PLANS: Dict[str, Dict[str, Any]] = {
    "monthly": {
        "label": "Monthly",
        "amount_inr": settings.BILLING_PLAN_AMOUNT_INR,
        "days": settings.BILLING_PLAN_DAYS,
    },
}

_RAZORPAY_API = "https://api.razorpay.com/v1"


def is_configured() -> bool:
    return bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)


def trial_end(from_dt: Optional[datetime] = None) -> datetime:
    """Called when an organization is created."""
    return (from_dt or datetime.utcnow()) + timedelta(days=settings.TRIAL_DAYS)


def compute_access(org: Optional[dict]) -> Dict[str, Any]:
    """The single source of truth for whether an org can use the app right now."""
    now = datetime.utcnow()
    org = org or {}
    trial_ends_at = org.get("trial_ends_at")
    paid_until = org.get("paid_until")

    if paid_until and paid_until > now:
        return {"access": True, "status": "active", "trial_ends_at": trial_ends_at,
                "paid_until": paid_until, "days_left": None}
    if trial_ends_at and trial_ends_at > now:
        days_left = max(1, math.ceil((trial_ends_at - now).total_seconds() / 86400))
        return {"access": True, "status": "trial", "trial_ends_at": trial_ends_at,
                "paid_until": paid_until, "days_left": days_left}
    return {"access": False, "status": "expired", "trial_ends_at": trial_ends_at,
            "paid_until": paid_until, "days_left": 0}


async def get_status(org_id: str) -> Dict[str, Any]:
    db = get_db()
    org = await db.organizations.find_one(
        {"id": org_id}, {"_id": 0, "trial_ends_at": 1, "paid_until": 1, "name": 1}
    )
    result = compute_access(org)
    result["organization_name"] = (org or {}).get("name")
    result["plans"] = PLANS
    result["billing_enabled"] = is_configured()
    return result


async def create_order(*, org_id: str, plan: str, actor_user_id: Optional[str]) -> Dict[str, Any]:
    if not is_configured():
        raise RuntimeError("Payments are not configured yet. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET.")
    plan_def = PLANS.get(plan)
    if not plan_def:
        raise ValueError(f"Unknown plan '{plan}'.")

    db = get_db()
    amount_paise = plan_def["amount_inr"] * 100
    receipt = f"{org_id[:24]}-{int(datetime.utcnow().timestamp())}"

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{_RAZORPAY_API}/orders",
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
            json={
                "amount": amount_paise,
                "currency": "INR",
                "receipt": receipt,
                "notes": {"organization_id": org_id, "plan": plan},
            },
        )
        resp.raise_for_status()
        order = resp.json()

    await db.payments.insert_one({
        "organization_id": org_id,
        "plan": plan,
        "amount_inr": plan_def["amount_inr"],
        "razorpay_order_id": order["id"],
        "razorpay_payment_id": None,
        "status": "created",
        "created_by": actor_user_id,
        "created_at": datetime.utcnow(),
    })

    return {
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "key_id": settings.RAZORPAY_KEY_ID,
        "plan": plan,
        "plan_label": plan_def["label"],
    }


def _verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _apply_payment(db, payment: dict, payment_id: str) -> None:
    """Extend the org's access and mark the payment paid. Idempotent on
    razorpay_payment_id — safe to call from both the checkout callback and the
    webhook for the same payment (whichever arrives first wins; the other is a no-op)."""
    already = await db.payments.find_one({"razorpay_payment_id": payment_id, "status": "paid"})
    if already:
        return

    org_id = payment["organization_id"]
    plan_def = PLANS.get(payment["plan"], PLANS["monthly"])
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "paid_until": 1})
    now = datetime.utcnow()
    base = (org or {}).get("paid_until") or now
    if base < now:
        base = now
    new_paid_until = base + timedelta(days=plan_def["days"])

    await db.organizations.update_one({"id": org_id}, {"$set": {"paid_until": new_paid_until, "updated_at": now}})
    await db.payments.update_one(
        {"_id": payment["_id"]},
        {"$set": {"status": "paid", "razorpay_payment_id": payment_id, "paid_at": now}},
    )
    logger.info(f"Billing: org {org_id} recharged, paid_until={new_paid_until.isoformat()}")


async def verify_and_apply(*, org_id: str, order_id: str, payment_id: str, signature: str) -> Dict[str, Any]:
    if not is_configured():
        raise RuntimeError("Payments are not configured yet.")
    if not _verify_signature(order_id, payment_id, signature):
        raise ValueError("Payment signature did not verify.")

    db = get_db()
    payment = await db.payments.find_one({"razorpay_order_id": order_id, "organization_id": org_id})
    if not payment:
        raise ValueError("No matching order for this organization.")

    await _apply_payment(db, payment, payment_id)
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "paid_until": 1, "trial_ends_at": 1})
    return compute_access(org)


async def handle_webhook(raw_body: bytes, signature: Optional[str]) -> Dict[str, Any]:
    """Razorpay webhook — a reliability backstop in case the browser closes
    before the checkout success handler fires. Verifies its own signature
    (a separate secret from the order/payment HMAC)."""
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        logger.warning("Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set — ignoring.")
        return {"status": "ignored"}
    if not signature:
        raise ValueError("Missing webhook signature.")
    expected = hmac.new(settings.RAZORPAY_WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise ValueError("Webhook signature did not verify.")

    payload = json.loads(raw_body)
    event = payload.get("event")
    if event not in ("payment.captured", "order.paid"):
        return {"status": "ignored", "event": event}

    entity = (payload.get("payload", {}).get("payment", {}) or {}).get("entity", {})
    order_id = entity.get("order_id")
    payment_id = entity.get("id")
    if not order_id or not payment_id:
        return {"status": "ignored", "reason": "no order/payment id in payload"}

    db = get_db()
    payment = await db.payments.find_one({"razorpay_order_id": order_id})
    if not payment:
        logger.warning(f"Razorpay webhook for unknown order {order_id}")
        return {"status": "ignored", "reason": "unknown order"}

    await _apply_payment(db, payment, payment_id)
    return {"status": "ok"}


async def grant_free_access(*, org_id: str, days: int) -> Dict[str, Any]:
    """Super-admin override — extend an org's paid_until without a payment
    (comps, enterprise deals negotiated offline, etc.)."""
    db = get_db()
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "paid_until": 1})
    now = datetime.utcnow()
    base = (org or {}).get("paid_until") or now
    if base < now:
        base = now
    new_paid_until = base + timedelta(days=days)
    await db.organizations.update_one({"id": org_id}, {"$set": {"paid_until": new_paid_until, "updated_at": now}})
    return compute_access({"paid_until": new_paid_until})


async def ensure_billing_indexes() -> None:
    try:
        db = get_db()
        await db.payments.create_index([("organization_id", 1), ("created_at", -1)])
        await db.payments.create_index([("razorpay_order_id", 1)], unique=True)
        logger.info("Billing indexes ensured.")
    except Exception as exc:
        logger.error(f"ensure_billing_indexes failed: {exc}")
