from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from app.core.auth import verify_password, create_access_token, get_password_hash
from app.models.user import UserResponse, UserInDB
from app.core.database import get_db
from app.core.config import settings
from app.api.deps import get_current_active_user
from app.services import billing_service
import uuid
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

class RegisterCompanyRequest(BaseModel):
    name: str
    company_name: str
    email: str
    password: str
    industry: Optional[str] = "tech"

class ForgotPasswordRequest(BaseModel):
    email: str

class RequestAccessRequest(BaseModel):
    name: str
    email: str
    company: str
    role: str
    password: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class TelephonySettingsRequest(BaseModel):
    mode: str = "shared"  # shared or custom
    provider: str = "plivo"  # plivo, twilio, bolna
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None
    phone_number: Optional[str] = None

class EmailSettingsRequest(BaseModel):
    sender_name: str
    sender_email: str
    reply_to: Optional[str] = None
    custom_smtp: bool = False
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = 587
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: Optional[bool] = True

router = APIRouter()

@router.post("/register")
async def register_company(request: RegisterCompanyRequest):
    """Instant self-service company registration. Every new company receives
    immediate access and 10 free minutes of AI voice calling."""
    db = get_db()
    email = request.email.strip().lower()

    # Guard duplicate user email
    existing = await db["users"].find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    now = datetime.utcnow()
    org_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    # 1. Create Organization with 10 free minutes trial
    org_doc = {
        "id": org_id,
        "name": request.company_name.strip(),
        "status": "active",
        "plan_type": "trial",
        "contact_email": email,
        "reply_to": email,
        "industry": request.industry or "tech",
        "trial_ends_at": billing_service.trial_end(),
        "telephony": {
            "mode": "shared",
            "provider": "plivo",
            "phone_number": settings.PLIVO_PHONE_NUMBER or "+918065535758"
        },
        "email_settings": {
            "sender_name": f"{request.company_name.strip()} Hiring Team",
            "sender_email": email,
            "reply_to": email,
            "custom_smtp": False
        },
        "created_at": now,
        "updated_at": now
    }
    await db["organizations"].insert_one(org_doc)

    # 2. Initialize wallet
    await billing_service.get_or_create_wallet(db, org_id)

    # 3. Create Organization Admin user
    hashed_pw = get_password_hash(request.password)
    user_doc = {
        "id": user_id,
        "name": request.name.strip(),
        "email": email,
        "hashed_password": hashed_pw,
        "role": "ORGANIZATION_ADMIN",
        "organization_id": org_id,
        "status": "active",
        "created_at": now,
        "updated_at": now
    }
    await db["users"].insert_one(user_doc)

    # 4. Generate JWT access token
    access_token = create_access_token(
        data={"sub": user_id, "role": "ORGANIZATION_ADMIN", "org_id": org_id}
    )

    user_resp = {
        "id": user_id,
        "name": request.name.strip(),
        "email": email,
        "role": "ORGANIZATION_ADMIN",
        "organization_id": org_id,
        "organization_name": request.company_name.strip(),
        "status": "active"
    }

    return {
        "status": "success",
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_resp,
        "message": "Welcome to HirePilot! Your workspace is ready with 10 free interview minutes."
    }

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    db = get_db()
    # Find user by email
    user = await db["users"].find_one({"email": form_data.username})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not await verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if user.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user",
        )
        
    access_token = create_access_token(
        data={"sub": str(user["id"]), "role": user["role"], "org_id": user.get("organization_id")}
    )
    
    # Fetch org name for UI
    org_name = None
    if user.get("organization_id"):
        org = await db["organizations"].find_one({"id": user["organization_id"]})
        if org:
            org_name = org.get("name")
            
    user_response = UserResponse(**user).dict()
    user_response["organization_name"] = org_name

    # We return the standard OAuth2 token response
    return {"access_token": access_token, "token_type": "bearer", "user": user_response}


@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    db = get_db()
    user = await db["users"].find_one({"email": request.email})
    
    if not user:
        # Return generic success message to prevent email enumeration
        return {"message": "If that email is in our system, we have sent a password reset link."}
        
    reset_token = str(uuid.uuid4())
    expiry = datetime.utcnow() + timedelta(hours=1)
    
    await db["users"].update_one(
        {"_id": user["_id"]},
        {"$set": {"reset_token": reset_token, "reset_token_expiry": expiry}}
    )
    
    from app.services.email_service import EmailService
    reset_link = f"http://localhost:5173/reset-password?token={reset_token}"
    
    # We'll also log it so it's easy to test locally
    logger.info(f"Password reset link for {request.email}: {reset_link}")
    
    try:
        await EmailService.send_password_reset_email(request.email, reset_link)
    except Exception as e:
        logger.error(f"Failed to send password reset email: {str(e)}")
        # Don't fail the request if email fails, just log it
    
    return {"message": "If that email is in our system, we have sent a password reset link."}

@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest):
    db = get_db()
    
    # Find user by reset token
    user = await db["users"].find_one({"reset_token": request.token})
    
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        
    # Check expiry
    expiry = user.get("reset_token_expiry")
    if not expiry or datetime.utcnow() > expiry:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        
    # Hash new password
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    hashed_password = pwd_context.hash(request.new_password)
    
    # Update password and clear token
    await db["users"].update_one(
        {"_id": user["_id"]},
        {"$set": {"hashed_password": hashed_password}, "$unset": {"reset_token": "", "reset_token_expiry": ""}}
    )
    
    return {"message": "Password successfully reset. You can now log in."}

@router.post("/request-access")
async def request_access(request: RequestAccessRequest):
    db = get_db()
    
    # Check if already requested or exists
    existing = await db["users"].find_one({"email": request.email})
    if existing:
        raise HTTPException(status_code=400, detail="Account already exists for this email.")
        
    existing_request = await db["access_requests"].find_one({"email": request.email})
    if existing_request:
        raise HTTPException(status_code=400, detail="You have already requested access. We will be in touch soon.")
        
    request_data = request.dict()
    request_data["status"] = "pending"
    request_data["created_at"] = datetime.utcnow()
    
    # Hash password before storing in request
    raw_password = request_data.pop("password")
    request_data["hashed_password"] = get_password_hash(raw_password)
    
    await db["access_requests"].insert_one(request_data)
    
    logger.info(f"New access request received from {request.name} ({request.email}) at {request.company}")
    
    return {"message": "Request received successfully. We will review and grant access soon."}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user = Depends(get_current_active_user)):
    db = get_db()
    user_dict = dict(current_user)
    if user_dict.get("organization_id"):
        org = await db["organizations"].find_one({"id": user_dict["organization_id"]})
        if org:
            user_dict["organization_name"] = org.get("name")
    return user_dict


class UpdateProfileRequest(BaseModel):
    name: str


class UpdateOrganizationRequest(BaseModel):
    name: str


@router.put("/profile")
@router.patch("/profile")
async def update_profile(req: UpdateProfileRequest, current_user: UserInDB = Depends(get_current_active_user)):
    db = get_db()
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    user_id = str(current_user.id)
    await db["users"].update_one(
        {"id": user_id},
        {"$set": {"name": name, "updated_at": datetime.utcnow()}}
    )
    user = await db["users"].find_one({"id": user_id}) or await db["users"].find_one({"email": current_user.email})
    org_name = None
    if user and user.get("organization_id"):
        org = await db["organizations"].find_one({"id": user["organization_id"]})
        if org:
            org_name = org.get("name")
    user_resp = UserResponse(**user).dict()
    user_resp["organization_name"] = org_name
    return {"status": "success", "message": "Profile updated successfully", "user": user_resp}


@router.put("/organization")
@router.patch("/organization")
async def update_organization_name(req: UpdateOrganizationRequest, current_user: UserInDB = Depends(get_current_active_user)):
    db = get_db()
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization associated with this account")
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Company name cannot be empty")

    await db["organizations"].update_one(
        {"id": org_id},
        {"$set": {"name": name, "updated_at": datetime.utcnow()}}
    )
    return {"status": "success", "message": "Organization updated successfully", "organization_name": name}


# ---------------------------------------------------------------------------
# Organization Telephony & Email Configuration Endpoints
# ---------------------------------------------------------------------------

@router.get("/organization/telephony")
async def get_org_telephony(current_user: UserInDB = Depends(get_current_active_user)):
    db = get_db()
    org_id = current_user.organization_id
    if not org_id and current_user.role == "SUPER_ADMIN":
        org = await db["organizations"].find_one({})
        org_id = org["id"] if org else None
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization associated with this account")

    org = await db["organizations"].find_one({"id": org_id})
    tel = (org or {}).get("telephony", {})
    return {
        "status": "success",
        "mode": tel.get("mode", "shared"),
        "provider": tel.get("provider", "plivo"),
        "phone_number": tel.get("phone_number") or settings.PLIVO_PHONE_NUMBER or "+918065535758",
        "account_sid": tel.get("account_sid") or "",
        "has_auth_token": bool(tel.get("auth_token")),
        "shared_phone_number": settings.PLIVO_PHONE_NUMBER or "+918065535758"
    }


@router.post("/organization/telephony")
async def update_org_telephony(req: TelephonySettingsRequest, current_user: UserInDB = Depends(get_current_active_user)):
    db = get_db()
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization associated with this account")

    org = await db["organizations"].find_one({"id": org_id})
    existing_tel = (org or {}).get("telephony") or {}

    update_data = {
        "mode": req.mode,
        "provider": req.provider,
        "phone_number": req.phone_number or (settings.PLIVO_PHONE_NUMBER or "+918065535758"),
    }
    if req.account_sid is not None:
        update_data["account_sid"] = req.account_sid.strip()
    if req.auth_token and req.auth_token.strip():
        update_data["auth_token"] = req.auth_token.strip()
    elif existing_tel.get("auth_token"):
        update_data["auth_token"] = existing_tel["auth_token"]

    await db["organizations"].update_one(
        {"id": org_id},
        {"$set": {"telephony": update_data, "updated_at": datetime.utcnow()}}
    )
    return {"status": "success", "message": "Telephony configuration updated successfully"}


@router.get("/organization/email-settings")
async def get_org_email_settings(current_user: UserInDB = Depends(get_current_active_user)):
    db = get_db()
    org_id = current_user.organization_id
    if not org_id and current_user.role == "SUPER_ADMIN":
        org = await db["organizations"].find_one({})
        org_id = org["id"] if org else None
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization associated with this account")

    org = await db["organizations"].find_one({"id": org_id})
    em = (org or {}).get("email_settings", {})
    return {
        "status": "success",
        "sender_name": em.get("sender_name") or f"{org.get('name', 'Company')} Hiring Team",
        "sender_email": em.get("sender_email") or org.get("contact_email") or "",
        "reply_to": em.get("reply_to") or org.get("reply_to") or org.get("contact_email") or "",
        "custom_smtp": bool(em.get("custom_smtp", False)),
        "smtp_host": em.get("smtp_host") or "",
        "smtp_port": em.get("smtp_port") or 587,
        "smtp_user": em.get("smtp_user") or "",
        "has_smtp_password": bool(em.get("smtp_password")),
        "smtp_use_tls": em.get("smtp_use_tls", True),
    }


@router.post("/organization/email-settings")
async def update_org_email_settings(req: EmailSettingsRequest, current_user: UserInDB = Depends(get_current_active_user)):
    db = get_db()
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization associated with this account")

    org = await db["organizations"].find_one({"id": org_id})
    existing_em = (org or {}).get("email_settings") or {}

    update_data = {
        "sender_name": req.sender_name.strip(),
        "sender_email": req.sender_email.strip(),
        "reply_to": (req.reply_to or req.sender_email).strip(),
        "custom_smtp": req.custom_smtp,
        "smtp_host": (req.smtp_host or "").strip(),
        "smtp_port": req.smtp_port or 587,
        "smtp_user": (req.smtp_user or "").strip(),
        "smtp_use_tls": req.smtp_use_tls,
    }
    if req.smtp_password and req.smtp_password.strip():
        update_data["smtp_password"] = req.smtp_password.strip()
    elif existing_em.get("smtp_password"):
        update_data["smtp_password"] = existing_em["smtp_password"]

    await db["organizations"].update_one(
        {"id": org_id},
        {"$set": {
            "email_settings": update_data,
            "contact_email": req.sender_email.strip(),
            "reply_to": (req.reply_to or req.sender_email).strip(),
            "updated_at": datetime.utcnow()
        }}
    )
    return {"status": "success", "message": "Email settings updated successfully"}


@router.post("/organization/email-settings/test")
async def test_org_email_settings(current_user: UserInDB = Depends(get_current_active_user)):
    """Sends a real test email through the company's configured custom SMTP server."""
    db = get_db()
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization associated with this account")

    org = await db["organizations"].find_one({"id": org_id})
    from app.services.email_service import EmailService
    sender = EmailService.sender_for(org, current_user.name)
    custom_smtp = sender.get("custom_smtp")

    if not custom_smtp or not custom_smtp.get("smtp_host"):
        raise HTTPException(status_code=400, detail="Custom SMTP is not enabled or SMTP host is missing.")

    if not custom_smtp.get("smtp_password"):
        raise HTTPException(
            status_code=400,
            detail="SMTP password has not been saved yet. Please enter your App Password and click 'Save Email Settings' first."
        )

    to_email = current_user.email
    subject = f"Test Email from {org.get('name', 'Company')} via Custom SMTP"
    body = (
        f"Hi {current_user.name},\n\n"
        f"This confirms that your company's custom SMTP configuration is working correctly!\n\n"
        f"Server: {custom_smtp.get('smtp_host')}:{custom_smtp.get('smtp_port', 587)}\n"
        f"User: {custom_smtp.get('smtp_user')}\n"
        f"Display Name: {sender.get('from_name')}\n"
        f"Reply-To: {sender.get('reply_to')}\n\n"
        f"Candidate interview invitations and notification emails will now be sent directly through your custom mail server.\n\n"
        f"Best regards,\n"
        f"{sender.get('from_name')}"
    )

    try:
        from starlette.concurrency import run_in_threadpool
        await run_in_threadpool(
            lambda: EmailService.send_email(to_email, subject, body, **sender)
        )
        return {
            "status": "success",
            "message": f"Test email sent successfully to {to_email} via your custom SMTP server ({custom_smtp.get('smtp_user')})!"
        }
    except Exception as e:
        logger.error(f"Custom SMTP test email failed: {e}")
        raise HTTPException(status_code=400, detail=f"Custom SMTP delivery failed: {str(e)}")
