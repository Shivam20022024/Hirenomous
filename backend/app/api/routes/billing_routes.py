"""Billing API. `/status` and the create/verify pair are recruiter-JWT
endpoints scoped to the caller's organization (never `X-View-As-Org` — a
super admin browsing a company's data doesn't pay for it). `/webhook` has no
auth; it verifies its own Razorpay signature."""
import logging
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import get_current_active_user, get_context_organization_id
from app.models.billing import CreateOrderRequest, VerifyPaymentRequest
from app.models.user import UserInDB
from app.services import billing_service
from app.core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["Billing"])


class WalletOrderRequest(BaseModel):
    amount: float
    currency: str = "INR"


class WalletVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def _org_id(user: UserInDB) -> str:
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="This account has no organization to bill.")
    return user.organization_id


@router.get("/status")
async def billing_status(user: UserInDB = Depends(get_current_active_user)):
    if user.role == "SUPER_ADMIN":
        return {"access": True, "status": "active", "days_left": None, "billing_enabled": billing_service.is_configured()}
    return await billing_service.get_status(_org_id(user))


# ---------------------------------------------------------------------------
# Wallet & Usage Endpoints (ported from Talkly)
# ---------------------------------------------------------------------------

@router.get("/wallet")
async def get_wallet_dashboard(user: UserInDB = Depends(get_current_active_user)):
    db = get_db()
    org_id = user.organization_id
    if not org_id and user.role == "SUPER_ADMIN":
        # Super admin fallback
        org = await db.organizations.find_one({})
        org_id = org["id"] if org else "platform"
    elif not org_id:
        raise HTTPException(status_code=400, detail="No organization associated with this account")
    return await billing_service.get_dashboard_data(db, org_id)


@router.get("/transactions")
async def get_transactions(limit: int = 50, skip: int = 0, user: UserInDB = Depends(get_current_active_user)):
    db = get_db()
    org_id = user.organization_id or ""
    cursor = db.transactions.find(
        {"$or": [{"organization_id": org_id}, {"company_id": org_id}]}
    ).sort("created_at", -1).skip(skip).limit(limit)
    transactions = []
    async for tx in cursor:
        tx["_id"] = None
        transactions.append(tx)
    return transactions


@router.get("/usage")
async def get_usage(limit: int = 50, skip: int = 0, user: UserInDB = Depends(get_current_active_user)):
    db = get_db()
    org_id = user.organization_id or ""
    cursor = db.usage_records.find(
        {"$or": [{"organization_id": org_id}, {"company_id": org_id}]}
    ).sort("created_at", -1).skip(skip).limit(limit)
    usage = []
    call_ids = []
    async for u in cursor:
        u["_id"] = None
        usage.append(u)
        if u.get("call_id"):
            call_ids.append(u["call_id"])

    # Enrich with candidate details if available
    if call_ids:
        cands = await db.candidates.find(
            {"$or": [{"id": {"$in": call_ids}}, {"bolna_call_id": {"$in": call_ids}}, {"call_id": {"$in": call_ids}}]}
        ).to_list(len(call_ids))
        cand_map = {}
        for c in cands:
            cand_map[c.get("id")] = c
            if c.get("bolna_call_id"):
                cand_map[c.get("bolna_call_id")] = c
            if c.get("call_id"):
                cand_map[c.get("call_id")] = c
        for u in usage:
            cid = u.get("call_id")
            if cid in cand_map:
                c = cand_map[cid]
                u["candidate_name"] = c.get("name") or "Candidate"
                u["phone"] = c.get("phone") or ""
                u["status"] = c.get("status") or "Completed"
                u["role"] = c.get("role") or "Candidate"

    # Fallback to calls collection if usage_records is empty
    if not usage:
        calls_cursor = db.calls.find(
            {"$or": [{"organization_id": org_id}, {"company_id": org_id}]}
        ).sort("created_at", -1).skip(skip).limit(limit)
        async for c in calls_cursor:
            dur = float(c.get("duration_seconds") or 0)
            cost = 0.0 if dur < 5.0 else round(dur * 0.20, 2)
            mins = 0.0 if dur < 5.0 else round(dur / 60.0, 2)
            usage.append({
                "id": str(c.get("_id")),
                "call_id": c.get("call_id") or str(c.get("_id")),
                "candidate_name": c.get("candidate_name") or c.get("customer_name") or "Candidate",
                "phone": c.get("customer_id") or c.get("phone") or "",
                "duration_seconds": dur,
                "billed_minutes": mins,
                "customer_cost": cost,
                "service_type": f"{c.get('direction', 'outbound')}_call",
                "status": c.get("status") or "Completed",
                "created_at": c.get("created_at")
            })

    return usage


@router.post("/wallet/razorpay/create-order")
async def create_wallet_order(req: WalletOrderRequest, user: UserInDB = Depends(get_current_active_user)):
    db = get_db()
    org_id = _org_id(user)
    try:
        return await billing_service.create_wallet_recharge_order(
            db, org_id=org_id, amount=req.amount, currency=req.currency, actor_user_id=user.id
        )
    except Exception as e:
        logger.error(f"Wallet create-order failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/wallet/razorpay/verify")
async def verify_wallet_order(req: WalletVerifyRequest, user: UserInDB = Depends(get_current_active_user)):
    db = get_db()
    org_id = _org_id(user)
    try:
        return await billing_service.verify_wallet_recharge(
            db,
            org_id=org_id,
            order_id=req.razorpay_order_id,
            payment_id=req.razorpay_payment_id,
            signature=req.razorpay_signature
        )
    except Exception as e:
        logger.error(f"Wallet verify failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))



@router.post("/create-order")
async def create_order(payload: CreateOrderRequest, user: UserInDB = Depends(get_current_active_user)):
    try:
        return await billing_service.create_order(org_id=_org_id(user), plan=payload.plan, actor_user_id=user.id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error(f"create_order failed: {exc}")
        raise HTTPException(status_code=502, detail="Could not reach the payment gateway. Please try again.")


@router.post("/verify")
async def verify_payment(payload: VerifyPaymentRequest, user: UserInDB = Depends(get_current_active_user)):
    try:
        return await billing_service.verify_and_apply(
            org_id=_org_id(user),
            order_id=payload.razorpay_order_id,
            payment_id=payload.razorpay_payment_id,
            signature=payload.razorpay_signature,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/webhook")
async def webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-razorpay-signature")
    try:
        return await billing_service.handle_webhook(raw_body, signature)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
