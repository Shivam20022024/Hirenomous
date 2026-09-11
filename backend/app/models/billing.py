"""Billing / subscription models. One Razorpay-backed plan today ("monthly");
`plan` is kept as a field so a second plan is a data change, not a schema one."""
from pydantic import BaseModel


class CreateOrderRequest(BaseModel):
    plan: str = "monthly"


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
