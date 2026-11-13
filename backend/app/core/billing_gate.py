"""Server-side billing gate — blocks API access for an organization whose free
trial has ended and hasn't recharged. This is independent of any frontend
paywall: a frontend-only check can be bypassed by calling the API directly,
so this is the layer that actually enforces it.

It looks only at the recruiter JWT's `role` / `org_id` claims:
  - no bearer token at all       -> not our concern (candidate interview-session
                                     token, or the route will 401 on its own)
  - role == SUPER_ADMIN          -> never gated
  - a normal recruiter token     -> gated on that org's billing status

Always reachable regardless of billing status: auth, the billing endpoints
themselves (a blocked company must still see its status and pay), and the
superadmin API.
"""
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.auth import decode_access_token
from app.core.database import get_db
from app.services import billing_service

logger = logging.getLogger(__name__)

_ALLOWED_PREFIXES = ("/api/billing", "/api/auth", "/api/superadmin", "/docs", "/openapi.json", "/redoc")
_ALLOWED_EXACT = ("/", "/ping", "/health")


class BillingGateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in _ALLOWED_EXACT or any(path.startswith(p) for p in _ALLOWED_PREFIXES):
            return await call_next(request)

        auth_header = request.headers.get("authorization", "")
        if not auth_header.lower().startswith("bearer "):
            return await call_next(request)

        payload = decode_access_token(auth_header.split(" ", 1)[1].strip())
        if not payload or payload.get("role") == "SUPER_ADMIN":
            return await call_next(request)

        org_id = payload.get("org_id")
        if not org_id:
            return await call_next(request)

        try:
            db = get_db()
            org = await db.organizations.find_one(
                {"id": org_id}, {"_id": 0, "trial_ends_at": 1, "paid_until": 1}
            )
            access = billing_service.compute_access(org)
        except Exception as exc:
            # Never let a billing-check failure take the whole app down.
            logger.error(f"billing gate check failed, allowing request through: {exc}")
            return await call_next(request)

        if not access["access"]:
            return JSONResponse(
                status_code=402,
                content={
                    "detail": "billing_required",
                    "message": "Your free trial has ended. Recharge to keep using Hireonomous.",
                    "status": access["status"],
                },
            )
        return await call_next(request)
