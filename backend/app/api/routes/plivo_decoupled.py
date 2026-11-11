import asyncio
import base64
import json
import logging
import os
import re
import time
from typing import Any, Optional

from fastapi import WebSocket, WebSocketDisconnect
import httpx
from app.core.config import settings
from app.services.bakbak_tts import BakbakTTSSession
from app.services.sarvam_tts import SarvamTTSSession
from app.services.sarvam_stt import SarvamSTTSession
from app.services.openai_chat import stream_openai_reply
from app.telephony.plivo_provider import PlivoProvider

logger = logging.getLogger("hirenomous-plivo-decoupled")

GOODBYE_KEYWORDS = [
    "अलविदा", "दिन शुभ हो", "बाय", "bye", "goodbye", "good bye",
    "have a great day", "have a wonderful day", "have a good day", "have a nice day",
    "take care", "talk to you soon", "बात करने के लिए धन्यवाद", "धन्यवाद", "thank you for your time"
]

_SENTENCE_END_RE = re.compile(r"^([^.!?।\n]+[.!?।])\s*")
_CLAUSE_END_RE = re.compile(r"^([^,;:\n]+[,;:])\s*")
_COMMON_ABBRS = {"dr.", "mr.", "mrs.", "ms.", "prof.", "i.e.", "e.g.", "etc.", "vs.", "approx."}

def safe_print(*args, **kwargs):
    text = " ".join(str(a) for a in args)
    print(text, flush=True)

def clean_tts_text(text: str, customer_name: str = "", is_subsequent: bool = False) -> str:
    cleaned = re.sub(r'[*_#`~]', '', text)
    cleaned = re.sub(r'\(.*?\)', '', cleaned)
    cleaned = re.sub(r'\[.*?\]', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

# In-memory prewarmed greeting cache: call_id -> asyncio.Task
DECOUPLED_GREETING_CACHE = {}

async def prewarm_bakbak_connection(client: httpx.AsyncClient):
    """Pre-warms the TCP and TLS socket to Bakbak TTS during greeting playback so the first customer turn pays 0ms TLS setup."""
    try:
        if client is not None:
            await client.head("https://hub.getraya.app", timeout=4.0)
            safe_print("[DECOUPLED PREWARM]: Bakbak TTS HTTP connection pre-warmed successfully (hot TLS socket ready).")
    except Exception as e:
        safe_print(f"[DECOUPLED PREWARM NOTICE]: Bakbak connection pre-warm non-critical: {e}")

async def prewarm_openai_connection(client: httpx.AsyncClient, api_key: str, model: str = "gpt-4o-mini"):
    """Pre-warms the TCP and TLS connection to api.openai.com in the background during greeting playback."""
    try:
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {"model": model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1}
        await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=5.0)
        safe_print("[DECOUPLED PREWARM]: OpenAI HTTP connection pre-warmed successfully (hot TLS socket ready).")
    except Exception as e:
        safe_print(f"[DECOUPLED PREWARM NOTICE]: OpenAI connection pre-warm non-critical: {e}")

def prewarm_decoupled_greeting(
    call_id: str,
    company_id: str = None,
    welcome_text: str = None,
    bakbak_voice_id: str = None,
    bakbak_language: str = None,
    bakbak_model: str = None,
):
    """Synthesizes the welcome greeting ahead of time (while the phone is ringing)
    so that when /stream connects, the initial voice audio is forwarded immediately (sub-10ms latency)."""
    if not call_id:
        return None
    if call_id in DECOUPLED_GREETING_CACHE:
        return DECOUPLED_GREETING_CACHE[call_id]

    async def _synth():
        try:
            w_text = welcome_text
            v_id = bakbak_voice_id or "3fe4afbc-3bde-4c97-ab8e-37e3fb8c7ba2"
            v_lang = bakbak_language or "en-in"
            v_mod = bakbak_model or "m1"

            if not w_text:
                return None

            t0 = time.time()
            api_key = settings.BAKBAK_API_KEY or os.environ.get("BAKBAK_API_KEY", "").strip()
            sarvam_key = settings.SARVAM_API_KEY or os.environ.get("SARVAM_API_KEY", "").strip()

            if api_key:
                session = BakbakTTSSession(api_key, v_id, v_lang, v_mod)
            elif sarvam_key:
                session = SarvamTTSSession(sarvam_key, "simran_en_conversation", "en-IN")
            else:
                return None

            await session.__aenter__()
            chunks = []
            total_sec = 0.0
            try:
                async for audio_b64 in session.speak(w_text):
                    if audio_b64:
                        chunks.append(audio_b64)
                        try:
                            raw_bytes = base64.b64decode(audio_b64)
                            total_sec += len(raw_bytes) / 8000.0
                        except Exception:
                            pass
            finally:
                await session.__aexit__(None, None, None)

            t1 = time.time()
            safe_print(
                f"[DECOUPLED PREWARM]: Pre-synthesized welcome greeting for call_id={call_id} "
                f"({total_sec:.2f}s audio, {len(chunks)} chunks) in {t1 - t0:.2f}s"
            )
            return {"chunks": chunks, "duration": total_sec, "text": w_text}
        except Exception as e:
            safe_print(f"[DECOUPLED PREWARM ERROR]: Failed for call_id={call_id}: {e}")
            return None

    task = asyncio.create_task(_synth())
    DECOUPLED_GREETING_CACHE[call_id] = task

    async def _auto_cleanup():
        await asyncio.sleep(60.0)
        DECOUPLED_GREETING_CACHE.pop(call_id, None)

    asyncio.create_task(_auto_cleanup())
    return task

async def _speak_and_forward(websocket: WebSocket, tts_session: Any, text: str, customer_name: str = "", is_subsequent: bool = False) -> float:
    text = clean_tts_text(text, customer_name, is_subsequent=is_subsequent)
    if not text:
        return 0.0
    total_audio_sec = 0.0
    try:
        async for audio_b64 in tts_session.speak(text):
            try:
                raw_bytes = base64.b64decode(audio_b64)
                total_audio_sec += len(raw_bytes) / 8000.0
            except Exception:
                pass
            play_msg = {
                "event": "playAudio",
                "media": {
                    "contentType": "audio/x-mulaw",
                    "sampleRate": 8000,
                    "payload": audio_b64
                }
            }
            await websocket.send_text(json.dumps(play_msg))
    except Exception as e:
        safe_print(f"[DECOUPLED TTS ERROR]: {e}")
    return total_audio_sec

async def run_decoupled_pipeline(websocket: WebSocket, call_id: str, company_id: str, db, ctx: dict) -> None:
    from app.api.routes.plivo_routes import finalize_plivo_call, HALLUCINATION_PHRASES, is_degenerate_transcript, PLIVO_CALL_CACHE

    system_prompt = ctx.get(
        "system_prompt",
        "You are an AI recruitment screening assistant. You must conduct the entire conversation strictly in professional English. Never speak in Hindi or another language."
    )
    welcome_text = ctx.get("welcome_text", "Hello, thank you for answering.")
    candidate_name = ctx.get("customer_name") or "there"
    
    openai_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
    sarvam_key = settings.SARVAM_API_KEY or os.environ.get("SARVAM_API_KEY")
    bakbak_key = settings.BAKBAK_API_KEY or os.environ.get("BAKBAK_API_KEY")

    if not (openai_key and (sarvam_key or bakbak_key)):
        safe_print(f"[DECOUPLED ERROR]: Missing required API keys for call_id={call_id}")
        await websocket.close()
        return

    transcript_parts: list = []
    messages = [{"role": "system", "content": system_prompt}]
    hangup_triggered = False

    # 1. Initialize Sarvam STT Session
    stt_session = SarvamSTTSession(sarvam_key, "en-IN")
    stt_init_task = asyncio.create_task(stt_session.__aenter__())

    # 2. Initialize TTS Session (prefer Raya / Bakbak TTS)
    if bakbak_key:
        v_id = ctx.get("bakbak_voice_id", "3fe4afbc-3bde-4c97-ab8e-37e3fb8c7ba2")
        v_lang = ctx.get("bakbak_language", "en-in")
        v_mod = ctx.get("bakbak_model", "m1")
        tts_session = BakbakTTSSession(bakbak_key, v_id, v_lang, v_mod)
        safe_print(f"[DECOUPLED]: Initialized Raya / Bakbak TTS (voice_id={v_id})")
    else:
        tts_session = SarvamTTSSession(sarvam_key, ctx.get("sarvam_speaker", "simran_en_conversation"), "en-IN")
        safe_print(f"[DECOUPLED]: Fallback to Sarvam TTS")

    await tts_session.__aenter__()

    openai_http_client = httpx.AsyncClient(
        timeout=30.0,
        limits=httpx.Limits(max_keepalive_connections=5, keepalive_expiry=60.0)
    )

    # Warm connections in background
    asyncio.create_task(prewarm_openai_connection(openai_http_client, openai_key))
    if hasattr(tts_session, "_client") and tts_session._client:
        asyncio.create_task(prewarm_bakbak_connection(tts_session._client))

    agent_speaking_until = 0.0
    welcome_duration = 0.0

    try:
        # Check if pre-warmed welcome audio is available
        prewarm_task = DECOUPLED_GREETING_CACHE.pop(call_id, None)
        prewarmed_result = None
        if prewarm_task:
            try:
                prewarmed_result = await asyncio.wait_for(asyncio.shield(prewarm_task), timeout=2.5)
            except Exception as e:
                safe_print(f"[DECOUPLED PREWARM NOTICE]: Prewarm wait ended: {e}")

        if prewarmed_result and prewarmed_result.get("chunks"):
            # FAST PATH: Play pre-synthesized audio chunks immediately (0ms delay!)
            t_play_start = time.time()
            welcome_duration = prewarmed_result["duration"]
            for audio_b64 in prewarmed_result["chunks"]:
                play_msg = {
                    "event": "playAudio",
                    "media": {
                        "contentType": "audio/x-mulaw",
                        "sampleRate": 8000,
                        "payload": audio_b64
                    }
                }
                await websocket.send_text(json.dumps(play_msg))
            safe_print(
                f"[DECOUPLED LATENCY]: Instant welcome audio sent {((time.time() - t_play_start)*1000):.1f}ms after stream connect! "
                f"(Audio duration: {welcome_duration:.2f}s)"
            )
        elif welcome_text:
            safe_print(f"[DECOUPLED]: No prewarm found for call_id={call_id}, synthesizing on-the-fly...")
            sentences = [s.strip() for s in re.split(r'(?<=[।?!.])\s+', welcome_text) if s.strip()]
            if len(sentences) > 1:
                dur1 = await _speak_and_forward(websocket, tts_session, sentences[0], candidate_name)
                welcome_duration += dur1
                for rem in sentences[1:]:
                    dur_rem = await _speak_and_forward(websocket, tts_session, rem, candidate_name)
                    welcome_duration += dur_rem
            else:
                welcome_duration = await _speak_and_forward(websocket, tts_session, welcome_text, candidate_name)

        if welcome_text:
            agent_speaking_until = time.time() + welcome_duration + 0.3
            transcript_parts.append(f"AI: {welcome_text}")
            await db.calls.update_one({"call_id": call_id}, {"$set": {"transcript": "\n".join(transcript_parts)}})
            messages.append({"role": "assistant", "content": welcome_text})

        # Ensure Sarvam STT is connected
        try:
            await asyncio.wait_for(stt_init_task, timeout=5.0)
            safe_print(f"[DECOUPLED]: Sarvam STT connected for call_id={call_id}")
        except Exception as stt_err:
            safe_print(f"[DECOUPLED ERROR]: Sarvam STT connect failed: {stt_err}")

        turn_lock = asyncio.Lock()
        turn_tasks: set = set()
        hangup_early_event = asyncio.Event()

        async def trigger_decoupled_hangup(delay_seconds: float) -> None:
            nonlocal hangup_triggered
            if hangup_triggered:
                return
            hangup_triggered = True
            safe_print(f"[DECOUPLED AUTO HANGUP]: Scheduled in {delay_seconds:.1f}s after AI closing...")
            try:
                try:
                    await asyncio.wait_for(hangup_early_event.wait(), timeout=delay_seconds)
                except asyncio.TimeoutError:
                    pass

                await asyncio.sleep(0.3)
                cdoc = await db.calls.find_one({"call_id": call_id}) if call_id else None
                call_uuid = (cdoc.get("plivo_call_uuid") or cdoc.get("plivo_request_uuid")) if cdoc else None
                if not call_uuid:
                    call_uuid = (PLIVO_CALL_CACHE.get(call_id) or {}).get("call_uuid")

                plivo_auth_id = settings.PLIVO_AUTH_ID or os.environ.get("PLIVO_AUTH_ID")
                plivo_auth_token = settings.PLIVO_AUTH_TOKEN or os.environ.get("PLIVO_AUTH_TOKEN")
                
                org_id = company_id or (cdoc.get("organization_id") if cdoc else None)
                if org_id and db is not None:
                    org = await db.organizations.find_one({"id": org_id})
                    tel = (org or {}).get("telephony", {})
                    if tel.get("mode") == "custom" and tel.get("account_sid") and tel.get("auth_token"):
                        plivo_auth_id = tel["account_sid"]
                        plivo_auth_token = tel["auth_token"]

                if call_uuid and plivo_auth_id and plivo_auth_token:
                    plivo_prov = PlivoProvider(plivo_auth_id, plivo_auth_token)
                    await plivo_prov.hangup_call(call_uuid)

                try:
                    await websocket.close()
                except Exception:
                    pass
            except Exception as e:
                safe_print(f"[DECOUPLED AUTO HANGUP ERROR]: {e}")

        async def _save_transcript_bg():
            try:
                await db.calls.update_one(
                    {"call_id": call_id},
                    {"$set": {"transcript": "\n".join(transcript_parts)}}
                )
            except Exception as e:
                safe_print(f"[DECOUPLED DB ERROR]: {e}")

        async def handle_final_transcript(customer_text: str) -> None:
            nonlocal agent_speaking_until
            try:
                customer_text = (customer_text or "").strip()
                if not customer_text or len(customer_text) <= 1:
                    return

                if hangup_triggered:
                    transcript_parts.append(f"Candidate: {customer_text}")
                    asyncio.create_task(_save_transcript_bg())
                    if time.time() >= agent_speaking_until:
                        hangup_early_event.set()
                    return

                if customer_text.lower() in HALLUCINATION_PHRASES or is_degenerate_transcript(customer_text):
                    return

                now = time.time()
                is_welcome_turn = len(transcript_parts) <= 1
                if is_welcome_turn and now < agent_speaking_until:
                    safe_print(f"[DECOUPLED]: Speech during initial greeting suppressed: '{customer_text}'")
                    return

                async with turn_lock:
                    turn_start = time.time()
                    safe_print(f"[CANDIDATE SPEECH]: {customer_text}")
                    transcript_parts.append(f"Candidate: {customer_text}")
                    asyncio.create_task(_save_transcript_bg())
                    messages.append({"role": "user", "content": customer_text})

                    full_reply = ""
                    first_sentence_flushed = False
                    remainder_start = 0
                    first_audio_task = None

                    async for delta in stream_openai_reply(messages, openai_key, "gpt-4o-mini", client=openai_http_client):
                        full_reply += delta
                        if not first_sentence_flushed:
                            m = _SENTENCE_END_RE.match(full_reply)
                            target_match = None
                            if m:
                                cand = m.group(1).strip()
                                if cand.lower() not in _COMMON_ABBRS and len(cand) >= 2:
                                    target_match = m
                            if not target_match:
                                mc = _CLAUSE_END_RE.match(full_reply)
                                if mc and len(mc.group(1).strip().split()) >= 3:
                                    target_match = mc

                            if target_match:
                                first_sentence_flushed = True
                                remainder_start = target_match.end()
                                first_sent_text = target_match.group(1).strip()
                                safe_print(f"[DECOUPLED LATENCY]: First clause ready in {time.time() - turn_start:.2f}s: '{first_sent_text}'")
                                first_audio_task = asyncio.create_task(
                                    _speak_and_forward(websocket, tts_session, first_sent_text, candidate_name, is_subsequent=True)
                                )

                    full_reply = full_reply.strip()
                    if not full_reply:
                        if first_audio_task:
                            await first_audio_task
                        return

                    clean_full_reply = clean_tts_text(full_reply, candidate_name, is_subsequent=True)
                    safe_print(f"[AI INTERVIEWER]: {clean_full_reply}")
                    messages.append({"role": "assistant", "content": clean_full_reply})
                    transcript_parts.append(f"AI: {clean_full_reply}")
                    asyncio.create_task(_save_transcript_bg())

                    if first_audio_task:
                        dur1 = await first_audio_task
                        agent_speaking_until = max(agent_speaking_until, time.time()) + dur1 + 0.1
                        remaining_text = full_reply[remainder_start:].strip()
                        if remaining_text:
                            dur2 = await _speak_and_forward(websocket, tts_session, remaining_text, candidate_name, is_subsequent=True)
                            agent_speaking_until = max(agent_speaking_until, time.time()) + dur2 + 0.1
                    else:
                        dur3 = await _speak_and_forward(websocket, tts_session, clean_full_reply, candidate_name, is_subsequent=True)
                        agent_speaking_until = max(agent_speaking_until, time.time()) + dur3 + 0.1

                    # Check for goodbye
                    reply_lower = clean_full_reply.lower()
                    if (len(transcript_parts) - 1) >= 3 and any(kw in reply_lower for kw in GOODBYE_KEYWORDS):
                        rem_audio_sec = max(0.0, agent_speaking_until - time.time())
                        delay = max(2.0, min(rem_audio_sec + 1.5, 20.0))
                        t = asyncio.create_task(trigger_decoupled_hangup(delay))
                        turn_tasks.add(t)
                        t.add_done_callback(turn_tasks.discard)

            except Exception as e:
                safe_print(f"[DECOUPLED ERROR]: handle_final_transcript failed: {e}")

        async def plivo_to_stt():
            while True:
                try:
                    raw_msg = await websocket.receive_text()
                except (WebSocketDisconnect, RuntimeError):
                    safe_print(f"[DECOUPLED]: Plivo WebSocket closed normally for call_id={call_id}")
                    break
                except Exception as ws_err:
                    safe_print(f"[DECOUPLED]: Plivo WebSocket terminated for call_id={call_id}: {ws_err}")
                    break

                try:
                    data = json.loads(raw_msg)
                except Exception as parse_err:
                    continue

                event_type = data.get("event")
                if event_type == "media":
                    payload = (data.get("media") or {}).get("payload") or data.get("payload")
                    if payload and isinstance(payload, str):
                        await stt_session.push_audio(payload)
                elif event_type == "start":
                    start_data = data.get("start", {})
                    call_uuid = start_data.get("callId") or start_data.get("callUuid") or data.get("callUuid")
                    if call_uuid:
                        PLIVO_CALL_CACHE.setdefault(call_id, {})["call_uuid"] = call_uuid
                        await db.calls.update_one({"call_id": call_id}, {"$set": {"plivo_call_uuid": call_uuid}})
                        safe_print(f"[DECOUPLED]: Plivo call_uuid recorded: {call_uuid}")
                elif event_type == "stop":
                    safe_print(f"[DECOUPLED]: Plivo stream stop received for call_id={call_id}")
                    break

        async def stt_to_llm():
            try:
                async for ev in stt_session.events():
                    if ev["type"] == "speech_started":
                        # Barge-in: if candidate speaks after initial welcome line, flush Plivo audio buffer immediately
                        if time.time() >= agent_speaking_until:
                            try:
                                await websocket.send_text(json.dumps({"event": "clearAudio"}))
                                safe_print("[BARGE-IN]: Candidate speaking, flushed Plivo carrier audio buffer.")
                            except Exception:
                                pass
                    elif ev["type"] == "final":
                        t = asyncio.create_task(handle_final_transcript(ev["text"]))
                        turn_tasks.add(t)
                        t.add_done_callback(turn_tasks.discard)
                    elif ev["type"] == "error":
                        safe_print(f"[DECOUPLED STT ERROR]: {ev.get('message')}")
            except Exception as stt_err:
                safe_print(f"[DECOUPLED STT LOOP ERROR]: {stt_err}")

        plivo_task = asyncio.create_task(plivo_to_stt())
        stt_task = asyncio.create_task(stt_to_llm())
        # The primary caller connection is plivo_task; only terminate when Plivo disconnects or hangup is triggered
        done, pending = await asyncio.wait({plivo_task}, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        stt_task.cancel()

        if turn_tasks:
            await asyncio.wait(turn_tasks, timeout=12.0)

    except WebSocketDisconnect:
        safe_print(f"[DECOUPLED]: Client disconnected for call_id={call_id}")
    except Exception as e:
        safe_print(f"[DECOUPLED ERROR]: {e}")
    finally:
        await tts_session.__aexit__(None, None, None)
        await stt_session.__aexit__(None, None, None)
        try:
            await openai_http_client.aclose()
        except Exception:
            pass
        try:
            await finalize_plivo_call(call_id, company_id=company_id, transcript_parts=transcript_parts)
        except Exception as e:
            safe_print(f"[DECOUPLED ERROR]: finalize_plivo_call failed: {e}")
        try:
            await websocket.close()
        except Exception:
            pass

