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

    if org is None:
        # No such org (deleted, bad org_id on the token) — nothing to grandfather.
        return {"access": False, "status": "expired", "trial_ends_at": None,
                "paid_until": None, "days_left": 0}

    # Internal / Demo / Unlimited orgs have perpetual active access
    if org.get("plan_type") == "unlimited" or org.get("unlimited_calls") is True or org.get("is_demo") is True:
        return {"access": True, "status": "unlimited", "trial_ends_at": None,
                "paid_until": None, "days_left": None}

    trial_ends_at = org.get("trial_ends_at")
    paid_until = org.get("paid_until")

    if trial_ends_at is None and paid_until is None:
        # Org predates this feature — it was never given a trial, so there is
        # nothing to have "expired". Never retroactively lock out an existing
        # company; billing only applies to orgs created after this shipped
        # (they always get trial_ends_at set at creation).
        return {"access": True, "status": "legacy", "trial_ends_at": None,
                "paid_until": None, "days_left": None}

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
    db = get_db()
    if db is None:
        return
    indexes = [
        (db.payments, [("organization_id", 1), ("created_at", -1)], {}),
        (db.payments, [("razorpay_order_id", 1)], {"unique": True}),
        (db.wallets, [("organization_id", 1)], {"unique": True, "sparse": True}),
        (db.transactions, [("organization_id", 1), ("created_at", -1)], {}),
        (db.usage_records, [("organization_id", 1), ("created_at", -1)], {}),
        (db.usage_records, [("call_id", 1)], {"unique": True, "sparse": True}),
    ]
    for coll, keys, kwargs in indexes:
        try:
            await coll.create_index(keys, **kwargs)
        except Exception:
            pass
    logger.info("Billing indexes ensured.")


# ---------------------------------------------------------------------------
# Wallet & Usage Tracking (ported from Talkly)
# ---------------------------------------------------------------------------
import uuid

DEFAULT_PRICING = {
    "outbound": {"provider_cost": 8.0, "customer_price": 12.0},
    "inbound": {"provider_cost": 7.0, "customer_price": 11.0},
    "default": {"provider_cost": 8.0, "customer_price": 12.0}
}
TRIAL_FREE_SECONDS = 10 * 60  # 10 minutes free trial calls

async def get_or_create_wallet(db, org_id: str) -> dict:
    wallet = await db.wallets.find_one({"$or": [{"organization_id": org_id}, {"company_id": org_id}]})
    if not wallet:
        wallet = {
            "id": str(uuid.uuid4()),
            "organization_id": org_id,
            "company_id": org_id,
            "balance": 0.0,
            "currency": "INR",
            "status": "active",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        await db.wallets.insert_one(wallet)
    return wallet

async def add_credits(db, org_id: str, amount: float, payment_provider: str, provider_transaction_id: str, description: str):
    # Idempotency check
    existing_tx = await db.transactions.find_one({
        "provider_transaction_id": provider_transaction_id,
        "type": "CREDIT",
        "status": "COMPLETED"
    })
    if existing_tx:
        return existing_tx
        
    wallet = await get_or_create_wallet(db, org_id)
    
    tx = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "company_id": org_id,
        "wallet_id": wallet["id"],
        "type": "CREDIT",
        "amount": amount,
        "currency": wallet.get("currency", "INR"),
        "payment_provider": payment_provider,
        "provider_transaction_id": provider_transaction_id,
        "status": "COMPLETED",
        "description": description,
        "created_at": datetime.utcnow()
    }
    await db.transactions.insert_one(tx)

    await db.wallets.update_one(
        {"id": wallet["id"]},
        {"$inc": {"balance": amount}, "$set": {"updated_at": datetime.utcnow()}}
    )
    return tx

async def get_trial_seconds_used(db, org_id: str) -> float:
    pipeline = [
        {"$match": {"$or": [{"organization_id": org_id}, {"company_id": org_id}]}},
        {"$group": {"_id": None, "total": {"$sum": "$duration_seconds"}}}
    ]
    agg = await db.usage_records.aggregate(pipeline).to_list(1)
    return float(agg[0]["total"]) if agg and agg[0].get("total") else 0.0

async def check_call_allowance(db, org_id: str) -> dict:
    org = await db.organizations.find_one({"id": org_id})
    if org and (org.get("plan_type") == "unlimited" or org.get("unlimited_calls") is True or org.get("is_demo") is True):
        return {"allowed": True, "reason": "unlimited_plan"}

    is_trial = not org or org.get("plan_type") == "trial" or not org.get("paid_until")
    if is_trial:
        used = await get_trial_seconds_used(db, org_id)
        if used < TRIAL_FREE_SECONDS:
            return {"allowed": True, "reason": "trial_minutes_remaining"}

    wallet = await get_or_create_wallet(db, org_id)
    if wallet.get("balance", 0.0) > 0:
        return {"allowed": True, "reason": "has_balance"}

    return {
        "allowed": False,
        "reason": "Free trial minutes are exhausted and wallet balance is ₹0. Please recharge to place calls."
    }

async def process_call_billing(db, call_id: str, org_id: str, direction: str, duration_seconds: float, provider: str = "plivo"):
    if duration_seconds <= 0:
        return None

    existing_usage = await db.usage_records.find_one({"call_id": call_id})
    if existing_usage:
        return existing_usage

    duration_seconds = float(duration_seconds)
    pricing = DEFAULT_PRICING.get(direction, DEFAULT_PRICING["default"])
    free_seconds_applied = 0.0

    if duration_seconds < 5.0:
        customer_cost = 0.0
        provider_cost = 0.0
        billed_minutes = 0.0
    else:
        provider_cost = round(duration_seconds * (pricing["provider_cost"] / 60.0), 2)
        billed_minutes = round(duration_seconds / 60.0, 2)
        billable_seconds = duration_seconds

        org = await db.organizations.find_one({"id": org_id})
        is_unlimited = bool(org) and (
            org.get("plan_type") == "unlimited" or
            org.get("unlimited_calls") is True or
            org.get("is_demo") is True
        )
        is_trial = not is_unlimited and (not org or org.get("plan_type") == "trial" or not org.get("paid_until"))
        
        if is_unlimited:
            free_seconds_applied = duration_seconds
            billable_seconds = 0.0
        elif is_trial:
            used_so_far = await get_trial_seconds_used(db, org_id)
            free_remaining = max(0.0, TRIAL_FREE_SECONDS - used_so_far)
            free_seconds_applied = min(duration_seconds, free_remaining)
            billable_seconds = duration_seconds - free_seconds_applied

        customer_cost = 0.0 if is_unlimited else round(billable_seconds * (pricing["customer_price"] / 60.0), 2)

    wallet = await get_or_create_wallet(db, org_id)

    usage_record = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "company_id": org_id,
        "call_id": call_id,
        "provider": provider,
        "duration_seconds": duration_seconds,
        "billed_minutes": billed_minutes,
        "provider_cost": provider_cost,
        "customer_cost": customer_cost,
        "free_seconds_applied": free_seconds_applied,
        "service_type": f"{direction}_call",
        "created_at": datetime.utcnow()
    }
    await db.usage_records.insert_one(usage_record)

    if customer_cost > 0:
        tx = {
            "id": str(uuid.uuid4()),
            "organization_id": org_id,
            "company_id": org_id,
            "wallet_id": wallet["id"],
            "type": "DEBIT",
            "amount": customer_cost,
            "currency": wallet.get("currency", "INR"),
            "payment_provider": "wallet",
            "provider_transaction_id": call_id,
            "status": "COMPLETED",
            "description": f"AI Interview Screening Call: {int(round(duration_seconds))}s ({direction})",
            "created_at": datetime.utcnow()
        }
        await db.transactions.insert_one(tx)
        await db.wallets.update_one(
            {"id": wallet["id"]},
            {"$inc": {"balance": -customer_cost}, "$set": {"updated_at": datetime.utcnow()}}
        )

    return usage_record

async def get_dashboard_data(db, org_id: str):
    wallet = await get_or_create_wallet(db, org_id)
    org = await db.organizations.find_one({"id": org_id})
    is_unlimited = bool(org) and (
        org.get("plan_type") == "unlimited" or
        org.get("unlimited_calls") is True or
        org.get("is_demo") is True
    )
    is_trial = not is_unlimited and (not org or org.get("plan_type") == "trial" or not org.get("paid_until"))
    
    if is_unlimited:
        plan_name = "Enterprise Unlimited (Company Demo)"
    elif is_trial:
        plan_name = "Trial (10 Min Included)"
    else:
        plan_name = "Pay-As-You-Go"

    included_minutes = 999999 if is_unlimited else (TRIAL_FREE_SECONDS / 60.0 if is_trial else 0)

    pipeline = [
        {"$match": {"$or": [{"organization_id": org_id}, {"company_id": org_id}]}},
        {"$group": {
            "_id": "$service_type",
            "total_seconds": {"$sum": "$duration_seconds"},
            "total_cost": {"$sum": "$customer_cost"}
        }}
    ]

    cursor = db.usage_records.aggregate(pipeline)
    by_direction = {"outbound": {"seconds": 0.0, "cost": 0.0}, "inbound": {"seconds": 0.0, "cost": 0.0}}
    async for doc in cursor:
        direction = str(doc.get("_id") or "outbound_call").replace("_call", "")
        if direction not in by_direction:
            by_direction[direction] = {"seconds": 0.0, "cost": 0.0}
        by_direction[direction]["seconds"] += float(doc.get("total_seconds") or 0)
        by_direction[direction]["cost"] += float(doc.get("total_cost") or 0)

    minutes_used = round(sum(d["seconds"] for d in by_direction.values()) / 60.0, 1)
    total_spending = round(sum(d["cost"] for d in by_direction.values()), 2)

    total_calls = await db.calls.count_documents({"$or": [{"organization_id": org_id}, {"company_id": org_id}]})
    completed_calls = await db.calls.count_documents({
        "$or": [{"organization_id": org_id}, {"company_id": org_id}],
        "status": {"$in": ["completed", "Completed", "analyzed", "Analyzed"]}
    })
    minutes_remaining = 999999 if is_unlimited else (max(0.0, round(included_minutes - minutes_used, 1)) if included_minutes > 0 else 0.0)

    return {
        "balance": round(wallet.get("balance", 0.0), 2),
        "currency": wallet.get("currency", "INR"),
        "plan_name": plan_name,
        "is_trial": is_trial,
        "is_unlimited": is_unlimited,
        "minutes_used": minutes_used,
        "minutes_included": included_minutes,
        "minutes_remaining": minutes_remaining,
        "trial_free_seconds": 0 if is_unlimited else (TRIAL_FREE_SECONDS if is_trial else 0),
        "trial_remaining_seconds": 0 if is_unlimited else (int(minutes_remaining * 60) if is_trial else 0),
        "total_spending": total_spending,
        "breakdown": {
            k: {"minutes": round(v["seconds"] / 60.0, 1), "spending": round(v["cost"], 2)}
            for k, v in by_direction.items()
        },
        "total_calls": total_calls,
        "completed_calls": completed_calls,
        "rate_per_minute": 0.0 if is_unlimited else 12.0,
        "organization_name": (org or {}).get("name") or "Company",
        "company_name": (org or {}).get("name") or "Company",
    }

async def create_wallet_recharge_order(db, org_id: str, amount: float, currency: str = "INR", actor_user_id: Optional[str] = None):
    if not is_configured():
        raise RuntimeError("Razorpay payments not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.")
    if amount <= 0:
        raise ValueError("Recharge amount must be greater than 0")

    amount_paise = int(round(amount * 100))
    receipt = f"w-{org_id[:16]}-{int(datetime.utcnow().timestamp())}"

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{_RAZORPAY_API}/orders",
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET),
            json={
                "amount": amount_paise,
                "currency": currency,
                "receipt": receipt,
                "notes": {"organization_id": org_id, "type": "wallet_recharge"},
            },
        )
        resp.raise_for_status()
        order = resp.json()

    await db.payments.insert_one({
        "organization_id": org_id,
        "type": "wallet_recharge",
        "amount_inr": amount,
        "razorpay_order_id": order["id"],
        "razorpay_payment_id": None,
        "status": "created",
        "created_by": actor_user_id,
        "created_at": datetime.utcnow(),
    })

    return {
        "order_id": order["id"],
        "amount": amount_paise,
        "amount_inr": amount,
        "currency": currency,
        "key_id": settings.RAZORPAY_KEY_ID,
    }

async def verify_wallet_recharge(db, org_id: str, order_id: str, payment_id: str, signature: str):
    if not is_configured():
        raise RuntimeError("Payments not configured.")
    if not _verify_signature(order_id, payment_id, signature):
        raise ValueError("Payment signature verification failed.")

    payment = await db.payments.find_one({"razorpay_order_id": order_id, "organization_id": org_id})
    if not payment:
        raise ValueError("Payment order not found.")

    amount = float(payment.get("amount_inr") or 0.0)
    await add_credits(
        db,
        org_id=org_id,
        amount=amount,
        payment_provider="razorpay",
        provider_transaction_id=payment_id,
        description=f"Wallet recharge via Razorpay ({order_id})"
    )

    await db.payments.update_one(
        {"_id": payment["_id"]},
        {"$set": {"status": "paid", "razorpay_payment_id": payment_id, "paid_at": datetime.utcnow()}}
    )
    return await get_dashboard_data(db, org_id)

