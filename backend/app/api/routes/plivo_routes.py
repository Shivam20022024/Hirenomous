import os
import sys
import time
import json
import base64
import asyncio
import logging
import re
from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Request, Response, WebSocket, WebSocketDisconnect, HTTPException, Depends, Query, Body
from app.core.database import get_db
from app.core.config import settings
from app.api.deps import get_context_organization_id, get_current_active_user
from app.models.user import UserInDB
from app.telephony.plivo_provider import PlivoProvider
from app.services import billing_service
from app.services.sarvam_tts import SarvamTTSSession, sarvam_voice_for
from app.services.bakbak_tts import BakbakTTSSession, bakbak_voice_for

logger = logging.getLogger("hirenomous-plivo")
plivo_router = APIRouter()

PLIVO_CALL_CACHE: Dict[str, dict] = {}

HALLUCINATION_PHRASES = {
    "thank you for watching", "thanks for watching",
    "subscribe to my channel", "please subscribe",
    "see you in the next video", "like and subscribe",
    "amara.org", "subtitles by", "captioned by",
}

def safe_print(*args, **kwargs):
    text = " ".join(str(a) for a in args)
    print(text, flush=True)

def is_degenerate_transcript(text: str) -> bool:
    clean = re.sub(r'[^\w\s]', '', text.strip().lower())
    words = clean.split()
    if len(words) >= 4 and len(set(words)) == 1:
        return True
    return False

def clean_tts_text(text: str, customer_name: str = "", is_subsequent: bool = False) -> str:
    cleaned = re.sub(r'[*_#`~]', '', text)
    cleaned = re.sub(r'\(.*?\)', '', cleaned)
    cleaned = re.sub(r'\[.*?\]', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

async def resolve_call_voice_context(db, call_id: str, company_id: str = None) -> dict:
    """Resolves recruiter screening prompt, candidate greeting, and voice configuration."""
    call_doc = None
    candidate = None
    org = None
    
    if db is not None:
        call_doc = await db.calls.find_one({"call_id": call_id}) if call_id else None
        
        # Try finding candidate
        if call_doc and call_doc.get("candidate_id"):
            candidate = await db.candidates.find_one({"id": call_doc["candidate_id"]})
        if not candidate and call_id:
            candidate = await db.candidates.find_one({"$or": [{"id": call_id}, {"bolna_call_id": call_id}, {"call_id": call_id}]})
        
        org_id = company_id or (call_doc.get("organization_id") if call_doc else None) or (candidate.get("organization_id") if candidate else None)
        org = await db.organizations.find_one({"id": org_id}) if org_id else None
    else:
        org_id = company_id
    company_name = (org.get("name") if org else "") or settings.APP_NAME
    
    candidate_name = (candidate.get("name") if candidate else "") or (call_doc.get("candidate_name") if call_doc else "") or "there"
    job_title = (candidate.get("role") if candidate else "") or (call_doc.get("job_title") if call_doc else "") or "open position"
    
    welcome_text = f"Hi {candidate_name}, this is the recruitment team from {company_name} calling regarding your application for the {job_title} role. Is this a good time for a quick 2-minute chat?"
    
    screening_questions = []
    if candidate and candidate.get("job_id"):
        config = await db.job_ai_config.find_one({"job_id": candidate["job_id"]})
        if config and config.get("screening_questions"):
            screening_questions = config.get("screening_questions")
            
    questions_block = ""
    if screening_questions:
        questions_block = "Screening questions to evaluate:\n" + "\n".join(f"- {q}" for q in screening_questions)
        
    system_prompt = f"""You are an AI recruitment screening assistant representing {company_name}.
You are speaking on a live phone call with the candidate {candidate_name} regarding the {job_title} role.

Your objectives:
1. Confirm if this is {candidate_name} and if they are available to talk.
2. Verify their years of relevant experience in this domain.
3. Ask about key skills relevant to {job_title}.
{questions_block}
4. Ask about their current location and notice period.
5. Keep turns very concise (maximum 1-2 sentences). Be professional, polite, and conversational.
6. When closing the call, say: "Thank you so much for your time today, {candidate_name}. Our recruitment team will review your responses and be in touch soon. Goodbye and have a great day!"
"""

    return {
        "call_id": call_id,
        "company_id": org_id,
        "company": org,
        "customer_name": candidate_name,
        "candidate": candidate,
        "welcome_text": welcome_text,
        "system_prompt": system_prompt,
        "transcription_lang": "en",
        "bakbak_voice_id": "3fe4afbc-3bde-4c97-ab8e-37e3fb8c7ba2",
        "bakbak_language": "en-in",
        "bakbak_model": "m1",
        "sarvam_speaker": "simran_en_conversation"
    }

async def finalize_plivo_call(call_id: str, company_id: str = None, transcript_parts: list = None):
    db = get_db()
    if db is None:
        safe_print("[PLIVO WARNING]: Database not connected during finalize_plivo_call.")
        return
    now = datetime.utcnow()
    cached = PLIVO_CALL_CACHE.pop(call_id, {})
    call_start = cached.get("start_time")
    
    call_doc = await db.calls.find_one({"call_id": call_id}) if call_id else None
    org_id = company_id or (call_doc.get("organization_id") if call_doc else None)
    
    dur = 0.0
    if call_start:
        dur = max(0.0, (time.time() - call_start))
    elif call_doc and call_doc.get("call_started_at"):
        dur = max(0.0, (now - call_doc["call_started_at"]).total_seconds())
    dur = round(dur, 1)

    full_transcript = "\n".join(transcript_parts or [])
    if not full_transcript and call_doc:
        full_transcript = call_doc.get("transcript", "")

    # Update call record
    await db.calls.update_one(
        {"call_id": call_id},
        {"$set": {
            "status": "completed",
            "duration_seconds": dur,
            "transcript": full_transcript,
            "ended_at": now,
            "updated_at": now
        }},
        upsert=True
    )

    # Update candidate record
    cand_id = (call_doc.get("candidate_id") if call_doc else None) or call_id
    await db.candidates.update_one(
        {"$or": [{"id": cand_id}, {"call_id": call_id}, {"bolna_call_id": call_id}]},
        {"$set": {
            "status": "called",
            "call_status": "completed",
            "call_duration": dur,
            "transcript": full_transcript,
            "last_interaction": now,
            "interest": "contacted"
        }}
    )

    # Process usage and deduct wallet balance
    if org_id and dur > 0:
        try:
            await billing_service.process_call_billing(
                db, call_id=call_id, org_id=org_id, direction="outbound", duration_seconds=dur, provider="plivo"
            )
            safe_print(f"[PLIVO BILLING]: Call {call_id} billed for org {org_id} ({dur}s)")
        except Exception as e:
            safe_print(f"[PLIVO BILLING ERROR]: {e}")

@plivo_router.get("/answer")
@plivo_router.post("/answer")
async def plivo_answer_call(request: Request, call_id: str = Query(None), company_id: str = Query(None)):
    """Called by Plivo when recipient answers the call. Returns XML with WebSocket audio stream."""
    safe_print(f"[PLIVO ANSWER]: Answer webhook triggered for call_id={call_id}, company_id={company_id}")
    
    host = request.headers.get("host") or "localhost:8001"
    proto = request.headers.get("x-forwarded-proto", "http")
    ws_proto = "wss" if proto == "https" else "ws"
    
    PLIVO_CALL_CACHE[call_id] = {
        "start_time": time.time(),
        "company_id": company_id
    }
    
    ws_url = f"{ws_proto}://{host}/api/v1/plivo/stream?call_id={call_id}&company_id={company_id}"
    
    # Plivo XML Response
    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Record action="" method="POST" maxLength="1800" playBeep="false" fileFormat="mp3" redirect="false" />
    <Stream bidirection="true" keepCallAlive="true" contentType="audio/x-mulaw">{ws_url}</Stream>
</Response>"""
    return Response(content=xml_content, media_type="application/xml")

@plivo_router.get("/hangup")
@plivo_router.post("/hangup")
async def plivo_hangup_handler(request: Request, call_id: str = Query(None), company_id: str = Query(None)):
    """Called by Plivo when call terminates."""
    safe_print(f"[PLIVO HANGUP]: Hangup received for call_id={call_id}")
    await finalize_plivo_call(call_id, company_id=company_id)
    return Response(content="<Response></Response>", media_type="application/xml")

@plivo_router.websocket("/stream")
async def plivo_realtime_audio_stream(websocket: WebSocket, call_id: str = Query(None), company_id: str = Query(None)):
    """Duplex bidirectional audio streaming over Plivo WebSocket using Sarvam STT, OpenAI, and Raya/Bakbak TTS."""
    await websocket.accept()
    safe_print(f"[PLIVO STREAM]: Connected stream for call_id={call_id}, company_id={company_id}")
    
    db = get_db()
    ctx = await resolve_call_voice_context(db, call_id, company_id)
    
    from app.api.routes.plivo_decoupled import run_decoupled_pipeline
    await run_decoupled_pipeline(websocket, call_id=call_id, company_id=company_id, db=db, ctx=ctx)

@plivo_router.post("/call-candidate/{candidate_id}")
async def trigger_plivo_candidate_call(
    candidate_id: str,
    request: Request,
    user: UserInDB = Depends(get_current_active_user),
    org_id: str = Depends(get_context_organization_id)
):
    """Initiates an outbound Plivo call for a specific candidate with Raya & Sarvam voice."""
    db = get_db()
    candidate = await db.candidates.find_one({"id": candidate_id, "organization_id": org_id})
    if not candidate:
        candidate = await db.candidates.find_one({"id": candidate_id})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    phone_number = candidate.get("phone")
    if not phone_number:
        raise HTTPException(status_code=400, detail="Candidate missing phone number")

    plivo_auth_id = settings.PLIVO_AUTH_ID or os.environ.get("PLIVO_AUTH_ID")
    plivo_auth_token = settings.PLIVO_AUTH_TOKEN or os.environ.get("PLIVO_AUTH_TOKEN")
    plivo_from_number = settings.PLIVO_PHONE_NUMBER or os.environ.get("PLIVO_PHONE_NUMBER", "+918065535758")

    if not (plivo_auth_id and plivo_auth_token and plivo_from_number):
        raise HTTPException(status_code=500, detail="Plivo telephony is not configured in settings or environment")

    # Determine base URL for webhook routing
    proto = request.headers.get("x-forwarded-proto", "http")
    host = request.headers.get("host", "localhost:8001")
    base_url = f"{proto}://{host}"

    plivo_prov = PlivoProvider(plivo_auth_id, plivo_auth_token, default_from=plivo_from_number)
    
    call_id = f"plivo-{candidate_id}-{int(time.time())}"
    now = datetime.utcnow()

    # Pre-register call record
    await db.calls.insert_one({
        "call_id": call_id,
        "candidate_id": candidate_id,
        "organization_id": org_id,
        "candidate_name": candidate.get("name"),
        "customer_id": phone_number,
        "job_title": candidate.get("role", "Candidate"),
        "status": "calling",
        "provider": "plivo",
        "direction": "outbound",
        "call_started_at": now,
        "created_at": now
    })

    try:
        plivo_res = await plivo_prov.trigger_outbound_call(
            to_phone_number=phone_number,
            lead_id=call_id,
            company_id=org_id,
            from_phone_number=plivo_from_number,
            base_url=base_url
        )

        await db.candidates.update_one(
            {"id": candidate_id},
            {"$set": {
                "status": "calling",
                "provider": "plivo",
                "plivo_call_id": call_id,
                "plivo_request_uuid": plivo_res.get("plivo_request_uuid"),
                "call_started_at": now,
                "last_interaction": now
            }}
        )

        return {
            "status": "success",
            "provider": "plivo",
            "call_id": call_id,
            "candidate": candidate.get("name"),
            "plivo_request_uuid": plivo_res.get("plivo_request_uuid"),
            "message": f"Plivo call dispatched from {plivo_from_number} to {phone_number}"
        }
    except Exception as e:
        logger.error(f"Plivo outbound trigger failed: {e}")
        await db.calls.update_one({"call_id": call_id}, {"$set": {"status": "failed", "error": str(e)}})
        raise HTTPException(status_code=500, detail=f"Plivo call failed: {str(e)}")
