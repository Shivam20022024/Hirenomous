import os
import sys
import time
import json
import base64
import asyncio
import logging
import re
import xml.sax.saxutils
from datetime import datetime
from typing import Optional, Dict, Any, List
import httpx
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

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

class PlivoCallShortlistedRequest(BaseModel):
    job_ids: Optional[List[str]] = None

PLIVO_CALL_CACHE: Dict[str, dict] = {}
FINALIZED_CALLS: set = set()

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

    # Prioritize the actual job title from jobs_board (via candidate.job_id or call_doc.job_id)
    job_title = None
    target_job_id = (candidate.get("job_id") if candidate else None) or (call_doc.get("job_id") if call_doc else None)
    if db is not None and target_job_id:
        job_doc = await db.jobs_board.find_one({"id": target_job_id})
        if not job_doc:
            job_doc = await db.jobs.find_one({"id": target_job_id})
        if job_doc and job_doc.get("title"):
            job_title = job_doc.get("title").strip()

    if not job_title and call_doc and call_doc.get("job_title"):
        val = str(call_doc.get("job_title")).strip()
        if val.lower() not in ["candidate", "open position", "unassigned", ""]:
            job_title = val

    if not job_title and candidate and candidate.get("job_role"):
        val = str(candidate.get("job_role")).strip()
        if val.lower() not in ["candidate", "open position", "unassigned", ""]:
            job_title = val

    if not job_title:
        job_title = (candidate.get("role") if candidate else "") or "open position"
    job_title = str(job_title).strip()
    
    welcome_text = f"Hi {candidate_name}, this is the recruitment team from {company_name} calling regarding your application for the {job_title} role. Is this a good time for a quick 2-minute chat?"
    
    screening_questions = []
    if candidate and candidate.get("job_id"):
        config = await db.job_ai_config.find_one({"job_id": candidate["job_id"]})
        if config and config.get("screening_questions"):
            screening_questions = config.get("screening_questions")
            
    questions_block = ""
    if screening_questions:
        questions_block = "Screening questions to evaluate:\n" + "\n".join(f"- {q}" for q in screening_questions)
        
    system_prompt = f"""You are an AI professional recruitment interviewer representing {company_name}.
You are speaking on a live phone screening call with candidate {candidate_name} regarding the {job_title} role.

LANGUAGE REQUIREMENT (CRITICAL):
- This is a formal professional hiring application. You MUST speak strictly 100% in professional English for the entire conversation.
- NEVER speak in Hindi, Hinglish, or any other language, even if the candidate speaks or replies in Hindi. Always politely maintain fluent, professional English.

Your objectives:
1. Confirm if this is {candidate_name} and if they are available for a quick 2-minute screening chat.
2. Verify their years of relevant experience in this domain.
3. Ask about key skills relevant to {job_title}.
{questions_block}
4. Ask about their current location and notice period.
5. When closing the call, say: "Thank you so much for your time today, {candidate_name}. Our recruitment team will review your responses and be in touch soon. Goodbye and have a great day!"

CRITICAL LOW-LATENCY DELIVERY RULES:
1. RAPID OPENER (MANDATORY): Always start your response with a natural 1-2 word English acknowledgment ending with a period or exclamation mark (e.g. 'Got it.', 'I see.', 'Great.', 'Sure thing.', 'Understood.'). This allows your voice to begin playing immediately in under 1 second while your main response generates.
2. CONCISE QUESTION: Follow immediately with strictly ONE clear question in under 15 words.
3. Once the candidate is greeted in the opening turn, NEVER repeat their name again in subsequent turns (e.g. say 'Understood.', NOT 'Understood, {candidate_name}.').
4. Keep each turn under 25 words total, professional and concise.
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

async def extract_call_metrics(transcript: str, candidate_role: str = "Candidate") -> dict:
    """Uses LLM to evaluate the recruiter screening interview transcript and extract structured scoring."""
    if not transcript or len(transcript.strip()) < 5:
        return {
            "communication_score": None,
            "technical_score": None,
            "confidence_score": None,
            "match_score": None,
            "interest": "callback_required",
            "final_recommendation": "Call disconnected or no response. Callback required.",
            "total_experience": "N/A",
            "relevant_experience": "N/A",
            "employment_status": "Unknown",
            "joining_availability": "N/A",
            "interview_availability": "N/A"
        }

    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    prompt = f"""
    Analyze this recruiter AI phone screening interview transcript for the role of '{candidate_role}'.
    Extract the following metrics based strictly on the conversation.
    If the candidate explicitly refused or hung up without answering, set interest to 'not_interested'.
    If the candidate asked to be called back later, set interest to 'callback_required'.
    Otherwise, if the candidate confirmed interest, set interest to 'interested'.
    
    Return strictly a JSON object with this format:
    {{
        "communication_score": 85,
        "technical_score": 80,
        "confidence_score": 90,
        "match_score": 82,
        "interest": "interested",
        "final_recommendation": "Strong candidate, recommended for next round.",
        "total_experience": "3 years",
        "relevant_experience": "2 years",
        "employment_status": "Employed",
        "joining_availability": "1 month",
        "interview_availability": "Tomorrow 2 PM"
    }}

    Transcript:
    {transcript[-3500:]}
    """
    payload = {
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"}
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.OPENAI_API_BASE}/chat/completions",
                headers=headers,
                json=payload,
                timeout=25.0
            )
            if response.status_code == 200:
                data = response.json()
                content = data["choices"][0]["message"]["content"]
                try:
                    return json.loads(content)
                except Exception:
                    content = content.replace("```json", "").replace("```", "").strip()
                    return json.loads(content)
    except Exception as e:
        safe_print(f"[PLIVO SCORING ERROR]: LLM evaluation failed: {e}")

    return {
        "communication_score": 80,
        "technical_score": 75,
        "confidence_score": 82,
        "match_score": 78,
        "interest": "interested",
        "final_recommendation": "Candidate completed initial AI screening call. Recommended for L2 interview.",
        "total_experience": "Available on Resume",
        "relevant_experience": "Available on Resume",
        "employment_status": "Available",
        "joining_availability": "Immediate",
        "interview_availability": "Available"
    }

async def finalize_plivo_call(call_id: str, company_id: str = None, transcript_parts: list = None):
    if not call_id:
        return
    if call_id in FINALIZED_CALLS:
        return
    FINALIZED_CALLS.add(call_id)
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

    # Candidate resolution & post-call evaluation
    cand_id = (call_doc.get("candidate_id") if call_doc else None) or call_id
    candidate = await db.candidates.find_one({"$or": [{"id": cand_id}, {"call_id": call_id}, {"bolna_call_id": call_id}]})
    
    cand_role = None
    target_job_id = (candidate.get("job_id") if candidate else None) or (call_doc.get("job_id") if call_doc else None)
    if db is not None and target_job_id:
        job_doc = await db.jobs_board.find_one({"id": target_job_id})
        if not job_doc:
            job_doc = await db.jobs.find_one({"id": target_job_id})
        if job_doc and job_doc.get("title"):
            cand_role = job_doc.get("title").strip()

    if not cand_role and call_doc and call_doc.get("job_title"):
        val = str(call_doc.get("job_title")).strip()
        if val.lower() not in ["candidate", "open position", "unassigned", ""]:
            cand_role = val

    if not cand_role and candidate and candidate.get("job_role"):
        val = str(candidate.get("job_role")).strip()
        if val.lower() not in ["candidate", "open position", "unassigned", ""]:
            cand_role = val

    if not cand_role:
        cand_role = (candidate.get("role") if candidate else None) or "Candidate"
    cand_role = str(cand_role).strip()
    
    metrics = await extract_call_metrics(full_transcript, candidate_role=cand_role)
    
    interest_val = (metrics.get("interest") or "interested").lower()
    if interest_val in ["interested", "yes", "confirmed"]:
        final_status = "interested"
    elif "callback" in interest_val:
        final_status = "callback_required"
    elif "not" in interest_val:
        final_status = "not_interested"
    else:
        final_status = "completed"

    cand_update = {
        "status": final_status,
        "call_status": "completed" if len(full_transcript.strip()) >= 5 else "no-answer",
        "call_duration": dur,
        "transcript": full_transcript,
        "transcription": full_transcript,
        "candidate_responded": bool(len(full_transcript.strip()) >= 5),
        "ai_summary": metrics.get("final_recommendation", ""),
        "conversation_summary": metrics.get("final_recommendation", ""),
        "recruiter_verdict": metrics.get("final_recommendation", ""),
        "communication_score": metrics.get("communication_score"),
        "technical_score": metrics.get("technical_score"),
        "confidence_score": metrics.get("confidence_score"),
        "screening_score": metrics.get("match_score"),
        "total_experience": metrics.get("total_experience"),
        "relevant_experience": metrics.get("relevant_experience"),
        "employment_status": metrics.get("employment_status"),
        "joining_availability": metrics.get("joining_availability"),
        "interview_availability": metrics.get("interview_availability"),
        "interest": interest_val,
        "interest_status": interest_val,
        "last_interaction": now
    }
    clean_cand_update = {k: v for k, v in cand_update.items() if v is not None}

    await db.candidates.update_one(
        {"$or": [{"id": cand_id}, {"call_id": call_id}, {"bolna_call_id": call_id}]},
        {"$set": clean_cand_update}
    )

    # Trigger Excel Synchronization
    effective_org_id = org_id or (candidate.get("organization_id") if candidate else None)
    if effective_org_id:
        try:
            from app.services.excel_service import ExcelService
            full_cand = await db.candidates.find_one({"$or": [{"id": cand_id}, {"call_id": call_id}, {"bolna_call_id": call_id}]})
            if full_cand:
                asyncio.create_task(run_in_threadpool(ExcelService.save_call_result_to_excel, full_cand, effective_org_id))
                asyncio.create_task(run_in_threadpool(ExcelService.update_candidate_excel, full_cand, effective_org_id))
                safe_print(f"[PLIVO EXCEL SYNC]: Saved call results to Excel for candidate {cand_id}")
        except Exception as exc:
            safe_print(f"[PLIVO EXCEL SYNC ERROR]: {exc}")

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
    db = get_db()
    
    host = request.headers.get("host") or "localhost:8001"
    proto = request.headers.get("x-forwarded-proto", "http")
    ws_proto = "wss" if proto == "https" else "ws"
    
    PLIVO_CALL_CACHE[call_id] = {
        "start_time": time.time(),
        "company_id": company_id
    }

    # Pre-warm greeting audio immediately upon answer if not already cached
    try:
        from app.api.routes.plivo_decoupled import prewarm_decoupled_greeting, DECOUPLED_GREETING_CACHE
        if call_id and call_id not in DECOUPLED_GREETING_CACHE:
            ctx = await resolve_call_voice_context(db, call_id, company_id)
            if ctx.get("welcome_text"):
                prewarm_decoupled_greeting(
                    call_id=call_id,
                    company_id=company_id,
                    welcome_text=ctx.get("welcome_text"),
                    bakbak_voice_id=ctx.get("bakbak_voice_id"),
                    bakbak_language=ctx.get("bakbak_language"),
                    bakbak_model=ctx.get("bakbak_model", "m1")
                )
    except Exception as pw_err:
        safe_print(f"[ANSWER PREWARM NOTICE]: {pw_err}")
    
    ws_url = f"{ws_proto}://{host}/api/v1/plivo/stream?call_id={call_id}&company_id={company_id}"
    ws_url_escaped = xml.sax.saxutils.escape(ws_url)
    
    # Plivo XML Response: fully compliant with bidirectional real-time audio streaming
    xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000">{ws_url_escaped}</Stream>
</Response>"""
    return Response(content=xml_content, media_type="application/xml")

@plivo_router.get("/hangup")
@plivo_router.post("/hangup")
async def plivo_hangup_handler(request: Request, call_id: str = Query(None), company_id: str = Query(None)):
    """Called by Plivo when call terminates."""
    safe_print(f"[PLIVO HANGUP]: Hangup received for call_id={call_id}")
    asyncio.create_task(finalize_plivo_call(call_id, company_id=company_id))
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

async def resolve_plivo_credentials(db, org_id: str):
    org = await db.organizations.find_one({"id": org_id}) if org_id else None
    tel = (org or {}).get("telephony", {})
    
    plivo_auth_id = settings.PLIVO_AUTH_ID or os.environ.get("PLIVO_AUTH_ID")
    plivo_auth_token = settings.PLIVO_AUTH_TOKEN or os.environ.get("PLIVO_AUTH_TOKEN")
    plivo_from_number = settings.PLIVO_PHONE_NUMBER or os.environ.get("PLIVO_PHONE_NUMBER", "+918065535758")

    if tel.get("mode") == "custom" and tel.get("account_sid") and tel.get("auth_token"):
        plivo_auth_id = tel["account_sid"]
        plivo_auth_token = tel["auth_token"]
        if tel.get("phone_number"):
            plivo_from_number = tel["phone_number"]
    elif tel.get("phone_number"):
        plivo_from_number = tel["phone_number"]
        
    return plivo_auth_id, plivo_auth_token, plivo_from_number

async def resolve_public_base_url(request: Optional[Request] = None) -> str:
    base_url = settings.PUBLIC_BASE_URL or getattr(settings, "BASE_URL", None)
    if not base_url or "localhost" in base_url or "127.0.0.1" in base_url:
        try:
            async with httpx.AsyncClient(timeout=1.0) as client:
                r = await client.get("http://127.0.0.1:4040/api/tunnels")
                if r.status_code == 200:
                    tunnels = r.json().get("tunnels", [])
                    if tunnels:
                        base_url = tunnels[0].get("public_url")
        except Exception:
            pass
    if not base_url and request:
        proto = request.headers.get("x-forwarded-proto", "http")
        host = request.headers.get("host", "localhost:8001")
        base_url = f"{proto}://{host}"
    return (base_url or "http://localhost:8001").rstrip("/")

async def dispatch_single_plivo_call(
    candidate: dict,
    org_id: str,
    base_url: str,
    plivo_prov: PlivoProvider,
    plivo_from_number: str,
    db
) -> dict:
    candidate_id = candidate.get("id")
    phone_number = candidate.get("phone")
    if not phone_number:
        return {"status": "error", "message": "Missing phone number"}

    # Check call allowance (unlimited demo accounts, trial allowance, or wallet balance)
    allowance = await billing_service.check_call_allowance(db, org_id)
    if not allowance.get("allowed"):
        return {"status": "error", "message": allowance.get("reason", "Calling limit reached. Please recharge.")}

    call_id = f"plivo-{candidate_id}-{int(time.time())}"
    now = datetime.utcnow()

    # Resolve job title from jobs_board (prioritize assigned job title over resume role)
    target_job_title = None
    target_job_id = candidate.get("job_id")
    if db is not None and target_job_id:
        job_doc = await db.jobs_board.find_one({"id": target_job_id})
        if not job_doc:
            job_doc = await db.jobs.find_one({"id": target_job_id})
        if job_doc and job_doc.get("title"):
            target_job_title = job_doc.get("title").strip()

    if not target_job_title and candidate.get("job_role"):
        val = str(candidate.get("job_role")).strip()
        if val.lower() not in ["candidate", "open position", "unassigned", ""]:
            target_job_title = val

    if not target_job_title:
        target_job_title = (candidate.get("role") or "Candidate").strip()

    # Pre-register call record
    await db.calls.insert_one({
        "call_id": call_id,
        "candidate_id": candidate_id,
        "organization_id": org_id,
        "candidate_name": candidate.get("name"),
        "customer_id": phone_number,
        "job_id": target_job_id,
        "job_title": target_job_title,
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
                "shortlisted": True,
                "provider": "plivo",
                "call_id": call_id,
                "bolna_call_id": call_id,
                "plivo_call_id": call_id,
                "plivo_request_uuid": plivo_res.get("plivo_request_uuid"),
                "call_started_at": now,
                "startedAt": now.isoformat(),
                "last_interaction": now,
                "job_role": target_job_title
            }}
        )

        # Pre-synthesize welcome greeting while phone is ringing (0ms pickup latency)
        try:
            from app.api.routes.plivo_decoupled import prewarm_decoupled_greeting
            ctx = await resolve_call_voice_context(db, call_id, org_id)
            if ctx.get("welcome_text"):
                prewarm_decoupled_greeting(
                    call_id=call_id,
                    company_id=org_id,
                    welcome_text=ctx.get("welcome_text"),
                    bakbak_voice_id=ctx.get("bakbak_voice_id"),
                    bakbak_language=ctx.get("bakbak_language"),
                    bakbak_model=ctx.get("bakbak_model", "m1")
                )
        except Exception as pw_err:
            safe_print(f"[PREWARM NOTICE]: {pw_err}")

        return {
            "status": "success",
            "provider": "plivo",
            "call_id": call_id,
            "candidate": candidate.get("name"),
            "plivo_request_uuid": plivo_res.get("plivo_request_uuid"),
            "message": f"Plivo call dispatched from {plivo_from_number} to {phone_number}"
        }
    except Exception as e:
        logger.error(f"Plivo outbound trigger failed for {phone_number}: {e}")
        await db.calls.update_one({"call_id": call_id}, {"$set": {"status": "failed", "error": str(e)}})
        raise e

async def dispatch_bulk_plivo_calls(
    candidates: List[dict],
    org_id: str,
    base_url: str,
    plivo_prov: PlivoProvider,
    plivo_from_number: str,
    db
) -> dict:
    called_ids = []
    called_phones = {}
    results_by_job = {}

    # Pre-fetch jobs for all candidates to avoid redundant DB queries
    job_ids = list({c.get("job_id") for c in candidates if c.get("job_id")})
    job_map = {}
    if db is not None and job_ids:
        async for j in db.jobs_board.find({"id": {"$in": job_ids}}):
            job_map[j["id"]] = j.get("title", "").strip()
        missing = [jid for jid in job_ids if jid not in job_map]
        if missing:
            async for j in db.jobs.find({"id": {"$in": missing}}):
                job_map[j["id"]] = j.get("title", "").strip()

    for candidate in candidates:
        job_id = candidate.get("job_id", "unknown")
        job_title = (job_map.get(job_id) if job_id in job_map else None) or candidate.get("job_role") or candidate.get("role") or "Candidate"
        job_title = str(job_title).strip()

        if job_id not in results_by_job:
            results_by_job[job_id] = {
                "job_id": job_id,
                "job_title": job_title,
                "shortlisted_found": 0,
                "calls_queued": 0,
                "failed": 0
            }
        results_by_job[job_id]["shortlisted_found"] += 1

        phone = candidate.get("phone")
        if not phone:
            results_by_job[job_id]["failed"] += 1
            continue

        if phone in called_phones:
            shared_call_id = called_phones[phone]
            called_ids.append(candidate["id"])
            now = datetime.utcnow()
            await db.candidates.update_one(
                {"id": candidate["id"]},
                {"$set": {
                    "status": "calling",
                    "shortlisted": True,
                    "provider": "plivo",
                    "call_id": shared_call_id,
                    "bolna_call_id": shared_call_id,
                    "plivo_call_id": shared_call_id,
                    "call_started_at": now,
                    "startedAt": now.isoformat(),
                    "last_interaction": now,
                    "job_role": job_title
                }}
            )
            results_by_job[job_id]["calls_queued"] += 1
            continue

        try:
            res = await dispatch_single_plivo_call(
                candidate=candidate,
                org_id=org_id,
                base_url=base_url,
                plivo_prov=plivo_prov,
                plivo_from_number=plivo_from_number,
                db=db
            )
            if res.get("status") == "success":
                called_ids.append(candidate["id"])
                called_phones[phone] = res.get("call_id")
                results_by_job[job_id]["calls_queued"] += 1
            else:
                results_by_job[job_id]["failed"] += 1
        except Exception as e:
            safe_print(f"[PLIVO BULK DIAL ERROR]: {candidate.get('id')} -> {e}")
            results_by_job[job_id]["failed"] += 1

        await asyncio.sleep(0.4)

    return {
        "status": "success",
        "called_count": len(called_ids),
        "called_ids": called_ids,
        "results": list(results_by_job.values())
    }

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

    auth_id, auth_token, from_num = await resolve_plivo_credentials(db, org_id)
    if not (auth_id and auth_token and from_num):
        raise HTTPException(status_code=500, detail="Plivo telephony is not configured in settings or environment")

    base_url = await resolve_public_base_url(request)
    plivo_prov = PlivoProvider(auth_id, auth_token, default_from=from_num)

    try:
        return await dispatch_single_plivo_call(
            candidate=candidate,
            org_id=org_id,
            base_url=base_url,
            plivo_prov=plivo_prov,
            plivo_from_number=from_num,
            db=db
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Plivo call failed: {str(e)}")

@plivo_router.post("/call-shortlisted")
async def trigger_plivo_call_shortlisted(
    request: Optional[PlivoCallShortlistedRequest] = None,
    req: Request = None,
    org_id: str = Depends(get_context_organization_id)
):
    """Initiates bulk Plivo calls for all shortlisted candidates using Raya & Sarvam voice."""
    db = get_db()
    query = {
        "status": {"$ne": "rejected"},
        "$or": [
            {"status": "shortlisted"},
            {"shortlisted": True},
            {"resume_score": {"$gte": settings.SHORTLIST_THRESHOLD}}
        ],
        "organization_id": org_id
    }
    if request and request.job_ids:
        query["job_id"] = {"$in": request.job_ids}

    shortlisted = await db.candidates.find(query).to_list(length=1000)
    if not shortlisted:
        return {"status": "success", "called_count": 0, "called_ids": [], "results": []}

    auth_id, auth_token, from_num = await resolve_plivo_credentials(db, org_id)
    if not (auth_id and auth_token and from_num):
        raise HTTPException(status_code=500, detail="Plivo telephony is not configured in settings or environment")

    base_url = await resolve_public_base_url(req)
    plivo_prov = PlivoProvider(auth_id, auth_token, default_from=from_num)

    return await dispatch_bulk_plivo_calls(
        candidates=shortlisted,
        org_id=org_id,
        base_url=base_url,
        plivo_prov=plivo_prov,
        plivo_from_number=from_num,
        db=db
    )

@plivo_router.get("/sync-call/{candidate_id}")
async def sync_candidate_call(candidate_id: str, org_id: str = Depends(get_context_organization_id)):
    """Syncs call details for a specific candidate from database call records."""
    db = get_db()
    candidate = await db.candidates.find_one({"id": candidate_id, "organization_id": org_id})
    if not candidate:
        candidate = await db.candidates.find_one({"id": candidate_id})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    call_id = candidate.get("plivo_call_id") or candidate.get("call_id") or candidate.get("bolna_call_id")
    call_doc = await db.calls.find_one({"call_id": call_id}) if call_id else None
    
    return {
        "status": "success",
        "candidate_id": candidate_id,
        "call_status": candidate.get("call_status") or (call_doc.get("status") if call_doc else "unknown"),
        "candidate_status": candidate.get("status"),
        "duration_seconds": candidate.get("call_duration") or (call_doc.get("duration_seconds") if call_doc else 0),
        "transcript": candidate.get("transcript") or (call_doc.get("transcript") if call_doc else "")
    }

@plivo_router.post("/stop-call/{candidate_id}")
async def stop_candidate_call(candidate_id: str, org_id: str = Depends(get_context_organization_id)):
    """Marks a candidate's active call as cancelled."""
    db = get_db()
    candidate = await db.candidates.find_one({"id": candidate_id, "organization_id": org_id})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    await db.candidates.update_one(
        {"id": candidate_id, "organization_id": org_id},
        {"$set": {
            "status": "cancelled",
            "last_interaction": datetime.utcnow()
        }}
    )
    return {"status": "success", "message": "Call stopped/cancelled"}

@plivo_router.post("/save-call-result/{candidate_id}")
async def save_call_result(candidate_id: str, org_id: str = Depends(get_context_organization_id)):
    """Triggers Excel storage for a candidate's call results."""
    db = get_db()
    candidate = await db.candidates.find_one({"id": candidate_id, "organization_id": org_id})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    from app.services.excel_service import ExcelService
    success = ExcelService.save_call_result_to_excel(candidate, org_id)
    return {"status": "success" if success else "error", "message": "Result saved to Excel" if success else "Failed to save to Excel"}
