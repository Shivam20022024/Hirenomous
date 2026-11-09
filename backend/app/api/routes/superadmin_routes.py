from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from app.core.database import get_db
from app.models.user import UserInDB, Organization
from app.api.deps import require_super_admin
from app.core.auth import get_password_hash
from app.services import billing_service
from pydantic import BaseModel
from bson import ObjectId

class CreateCompanyRequest(BaseModel):
    company_name: str
    admin_name: str
    admin_email: str
    admin_password: str


class GrantAccessRequest(BaseModel):
    days: int = 30

router = APIRouter()

@router.get("/stats")
async def get_global_stats(current_user: UserInDB = Depends(require_super_admin)):
    db = get_db()
    
    total_companies = await db["organizations"].count_documents({})
    active_companies = await db["organizations"].count_documents({"status": "active"})
    suspended_companies = await db["organizations"].count_documents({"status": "suspended"})
    
    total_users = await db["users"].count_documents({})
    total_jobs = await db["jobs_board"].count_documents({})
    total_candidates = await db["candidates"].count_documents({})
    total_interviews = await db["interviews"].count_documents({})
    total_calls = await db["calls"].count_documents({})
    pending_requests = await db["access_requests"].count_documents({"status": "pending"})
    
    # Calculate call minutes (if duration_seconds exists)
    pipeline = [
        {"$group": {"_id": None, "total_seconds": {"$sum": "$duration_seconds"}}}
    ]
    cursor = db["calls"].aggregate(pipeline)
    call_duration_result = await cursor.to_list(length=1)
    
    total_call_minutes = 0
    if call_duration_result and call_duration_result[0].get("total_seconds"):
        total_call_minutes = round(call_duration_result[0]["total_seconds"] / 60)
        
    return {
        "total_companies": total_companies,
        "active_companies": active_companies,
        "suspended_companies": suspended_companies,
        "total_users": total_users,
        "total_jobs": total_jobs,
        "total_candidates": total_candidates,
        "total_interviews": total_interviews,
        "total_calls": total_calls,
        "total_call_minutes": total_call_minutes,
        "pending_requests": pending_requests,
    }

def _as_object_id(req_id: str) -> ObjectId:
    try:
        return ObjectId(req_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request id")


# `access_requests` has two historical shapes. Normalise to one.
_SECRET_KEYS = ("hashed_password", "password_hash", "password")


def _view_request(req: dict) -> dict:
    """Public view of an access request — no secrets, both schemas mapped."""
    return {
        "_id": str(req["_id"]),
        "company": req.get("company") or req.get("company_name") or "—",
        "name": req.get("name") or req.get("contact_name") or "—",
        "email": req.get("email") or "—",
        "role": req.get("role") or "ORGANIZATION_ADMIN",
        "status": str(req.get("status") or "pending").lower(),
        "created_at": req.get("created_at"),
        "reviewed_at": req.get("reviewed_at"),
        "has_password": any(req.get(k) for k in _SECRET_KEYS),
    }


@router.get("/requests")
async def get_access_requests(current_user: UserInDB = Depends(require_super_admin)):
    db = get_db()
    cursor = db["access_requests"].find().sort("created_at", -1)
    return [_view_request(req) async for req in cursor]

@router.post("/requests/{req_id}/approve")
async def approve_access_request(req_id: str, current_user: UserInDB = Depends(require_super_admin)):
    db = get_db()

    req = await db["access_requests"].find_one({"_id": _as_object_id(req_id)})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if str(req.get("status") or "").lower() != "pending":
        raise HTTPException(status_code=400, detail="Request is already processed")

    email = req.get("email")
    company = req.get("company") or req.get("company_name")
    name = req.get("name") or req.get("contact_name")
    pw_hash = next((req[k] for k in _SECRET_KEYS if req.get(k)), None)

    if not email or not company:
        raise HTTPException(status_code=400, detail="This request is missing an email or company name — reject it and ask the company to submit again.")
    if not pw_hash:
        raise HTTPException(status_code=400, detail="This request has no password on file (it predates the current form). Reject it and ask the company to submit again.")

    # Guard against a race / stale request where the email now belongs to a real user.
    if await db["users"].find_one({"email": email}):
        await db["access_requests"].update_one({"_id": req["_id"]}, {"$set": {"status": "approved"}})
        raise HTTPException(status_code=400, detail="An account already exists for this email.")

    # contact_email brands candidate emails: signed "<Company> Hiring Team", Reply-To here.
    # trial_ends_at starts the free trial clock from the moment the company is approved.
    org_data = Organization(
        name=company, status="active", contact_email=email, trial_ends_at=billing_service.trial_end(),
    ).dict()
    await db["organizations"].insert_one(org_data)
    org_id = org_data["id"]

    user_data = UserInDB(
        name=name or email.split("@")[0],
        email=email,
        hashed_password=pw_hash,
        role="ORGANIZATION_ADMIN",
        organization_id=org_id,
        status="active",
    ).dict()
    await db["users"].insert_one(user_data)

    await db["access_requests"].update_one(
        {"_id": req["_id"]},
        {"$set": {"status": "approved", "reviewed_by": current_user.id, "reviewed_at": datetime.utcnow(),
                  "organization_id": org_id}},
    )

    return {"message": "Approved. The company can now sign in.", "organization_id": org_id}

@router.post("/requests/{req_id}/reject")
async def reject_access_request(req_id: str, current_user: UserInDB = Depends(require_super_admin)):
    db = get_db()

    req = await db["access_requests"].find_one({"_id": _as_object_id(req_id)})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if str(req.get("status") or "").lower() != "pending":
        raise HTTPException(status_code=400, detail="Request is already processed")

    await db["access_requests"].update_one(
        {"_id": req["_id"]},
        {"$set": {"status": "rejected", "reviewed_by": current_user.id, "reviewed_at": datetime.utcnow()}},
    )

    return {"message": "Request rejected"}

@router.get("/companies")
async def get_all_companies(current_user: UserInDB = Depends(require_super_admin)):
    db = get_db()
    companies = []
    
    # Find all organizations
    cursor = db["organizations"].find().sort("created_at", -1)
    async for org in cursor:
        org_id = org["id"]
        
        # Get usage stats for this organization
        users_count = await db["users"].count_documents({"organization_id": org_id})
        jobs_count = await db["jobs_board"].count_documents({"organization_id": org_id})
        candidates_count = await db["candidates"].count_documents({"organization_id": org_id})
        interviews_count = await db["interviews"].count_documents({"organization_id": org_id})
        admin = await db["users"].find_one(
            {"organization_id": org_id, "role": "ORGANIZATION_ADMIN"}, {"_id": 0, "name": 1, "email": 1}
        )
        billing = billing_service.compute_access(org)
        wallet = await db["wallets"].find_one({"$or": [{"organization_id": org_id}, {"company_id": org_id}]})

        companies.append({
            "id": org_id,
            "name": org.get("name"),
            "status": org.get("status"),
            "created_at": org.get("created_at"),
            "admin": admin,
            "billing": billing,
            "wallet_balance": round(wallet.get("balance", 0.0), 2) if wallet else 0.0,
            "stats": {
                "users": users_count,
                "jobs": jobs_count,
                "candidates": candidates_count,
                "interviews": interviews_count,
            }
        })
        
    return companies


@router.get("/companies/{org_id}/billing")
async def get_company_billing(org_id: str, current_user: UserInDB = Depends(require_super_admin)):
    """Retrieve billing, wallet balance, and usage records for a specific company."""
    db = get_db()
    org = await db["organizations"].find_one({"id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Company not found")
        
    wallet_data = await billing_service.get_dashboard_data(db, org_id)
    usage = []
    async for u in db.usage_records.find({"$or": [{"organization_id": org_id}, {"company_id": org_id}]}).sort("created_at", -1).limit(50):
        u["_id"] = None
        usage.append(u)
    transactions = []
    async for tx in db.transactions.find({"$or": [{"organization_id": org_id}, {"company_id": org_id}]}).sort("created_at", -1).limit(50):
        tx["_id"] = None
        transactions.append(tx)
    return {"status": "success", "wallet": wallet_data, "usage": usage, "transactions": transactions}


@router.post("/companies/{org_id}/impersonate")
async def impersonate_company(org_id: str, current_user: UserInDB = Depends(require_super_admin)):
    """Single Sign-In: generate an authenticated session as the company's admin in one click."""
    db = get_db()
    org = await db["organizations"].find_one({"id": org_id})
    if not org:
        raise HTTPException(status_code=404, detail="Company not found")

    user = await db["users"].find_one({"organization_id": org_id, "role": "ORGANIZATION_ADMIN"})
    if not user:
        user = await db["users"].find_one({"organization_id": org_id})

    if not user:
        import uuid
        now = datetime.utcnow()
        user_id = str(uuid.uuid4())
        user_data = {
            "id": user_id,
            "name": f"{org.get('name', 'Company')} Admin",
            "email": org.get("contact_email") or f"admin_{org_id[:8]}@hirenomous.internal",
            "hashed_password": get_password_hash("hirenomous123"),
            "role": "ORGANIZATION_ADMIN",
            "organization_id": org_id,
            "status": "active",
            "created_at": now,
            "updated_at": now
        }
        await db["users"].insert_one(user_data)
        user = user_data

    from app.core.auth import create_access_token
    token = create_access_token(
        data={"sub": str(user["id"]), "role": user.get("role", "ORGANIZATION_ADMIN"), "org_id": org_id}
    )
    user_resp = {
        "id": str(user["id"]),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
        "organization_id": org_id,
        "organization_name": org.get("name"),
        "status": user.get("status", "active")
    }
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": user_resp,
        "impersonated": True,
        "company_name": org.get("name")
    }


@router.post("/companies")
async def create_company(request: CreateCompanyRequest, current_user: UserInDB = Depends(require_super_admin)):
    db = get_db()
    
    # Check if user already exists
    existing_user = await db["users"].find_one({"email": request.admin_email})
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")
        
    # Create Organization
    org_data = Organization(
        name=request.company_name, status="active", contact_email=request.admin_email,
        trial_ends_at=billing_service.trial_end(),
    ).dict()
    await db["organizations"].insert_one(org_data)
    org_id = org_data["id"]
    
    # Create Admin User
    hashed_password = get_password_hash(request.admin_password)
    user_data = UserInDB(
        name=request.admin_name,
        email=request.admin_email,
        role="ORGANIZATION_ADMIN",
        organization_id=org_id,
        hashed_password=hashed_password
    ).dict()
    
    await db["users"].insert_one(user_data)
    
    # Remove ObjectId for JSON serialization
    org_data.pop("_id", None)
    
    return {
        "success": True,
        "organization": org_data,
        "admin_user": {
            "email": request.admin_email,
            "name": request.admin_name
        }
    }

@router.post("/companies/{org_id}/grant-access")
async def grant_company_access(
    org_id: str, payload: GrantAccessRequest, current_user: UserInDB = Depends(require_super_admin)
):
    """Extend a company's paid_until without a payment — comps, offline deals."""
    db = get_db()
    if not await db["organizations"].find_one({"id": org_id}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=404, detail="Company not found")
    if payload.days <= 0 or payload.days > 3650:
        raise HTTPException(status_code=400, detail="days must be between 1 and 3650")
    return await billing_service.grant_free_access(org_id=org_id, days=payload.days)


@router.get("/users")
async def get_all_users(current_user: UserInDB = Depends(require_super_admin)):
    db = get_db()
    users = []
    
    # Pre-fetch organizations to map org_id to org_name
    orgs_cursor = db["organizations"].find()
    orgs_map = {}
    async for org in orgs_cursor:
        orgs_map[org["id"]] = org["name"]
        
    cursor = db["users"].find().sort("created_at", -1)
    async for user in cursor:
        org_id = user.get("organization_id")
        org_name = orgs_map.get(org_id, "N/A") if org_id else "N/A"
        
        users.append({
            "id": user.get("id"),
            "name": user.get("name"),
            "email": user.get("email"),
            "role": user.get("role"),
            "organization_name": org_name,
            "created_at": user.get("created_at")
        })
        
    return users
