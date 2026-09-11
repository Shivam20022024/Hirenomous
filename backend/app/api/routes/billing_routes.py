"""Billing API. `/status` and the create/verify pair are recruiter-JWT
endpoints scoped to the caller's organization (never `X-View-As-Org` — a
super admin browsing a company's data doesn't pay for it). `/webhook` has no
auth; it verifies its own Razorpay signature."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import get_current_active_user
from app.models.billing import CreateOrderRequest, VerifyPaymentRequest
from app.models.user import UserInDB
from app.services import billing_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["Billing"])


def _org_id(user: UserInDB) -> str:
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="This account has no organization to bill.")
    return user.organization_id


@router.get("/status")
async def billing_status(user: UserInDB = Depends(get_current_active_user)):
    if user.role == "SUPER_ADMIN":
        return {"access": True, "status": "active", "days_left": None, "billing_enabled": billing_service.is_configured()}
    return await billing_service.get_status(_org_id(user))


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
