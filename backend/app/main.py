from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import resume_routes, voice_routes, demo_voice_routes, simulation_routes, email_routes, job_board_routes, auth_routes, superadmin_routes, analytics_routes, ai_recruiter_routes, interview_routes, billing_routes, plivo_routes
from app.core.database import connect_to_mongo, close_mongo_connection
from app.core.config import settings
from app.core.billing_gate import BillingGateMiddleware
from app.services.interview_service import ensure_interview_indexes
from app.services.billing_service import ensure_billing_indexes

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Production-ready AI Hiring Automation Pipeline"
)

# Billing gate first, so CORSMiddleware (added last -> outermost) still adds
# CORS headers to the 402 responses it returns.
app.add_middleware(BillingGateMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
import shutil
import subprocess
import httpx

ngrok_process = None

def ensure_ngrok_tunnel():
    """Checks and starts ngrok tunnel if BASE_URL or PUBLIC_BASE_URL is set to an ngrok domain."""
    global ngrok_process
    base_url = (getattr(settings, "PUBLIC_BASE_URL", None) or getattr(settings, "BASE_URL", None) or os.environ.get("BASE_URL") or os.environ.get("PUBLIC_BASE_URL") or "").strip()
    if "ngrok" not in base_url.lower():
        return

    # Check if ngrok is already running on port 4040
    try:
        with httpx.Client(timeout=1.0) as client:
            req = client.get("http://127.0.0.1:4040/api/tunnels")
            if req.status_code == 200:
                data = req.json()
                tunnels = [t.get("public_url", "") for t in data.get("tunnels", [])]
                clean_base = base_url.rstrip("/")
                if any(clean_base in t for t in tunnels):
                    print(f"[AUTO-NGROK]: Public tunnel active at {base_url} -> port 8001")
                    return
    except Exception:
        pass

    # Find ngrok executable
    ngrok_bin = shutil.which("ngrok")
    if not ngrok_bin:
        win_path = os.path.expanduser(r"~\AppData\Local\Microsoft\WindowsApps\ngrok.exe")
        if os.path.exists(win_path):
            ngrok_bin = win_path

    if not ngrok_bin:
        print("[AUTO-NGROK]: ngrok executable not found in PATH. Start manually if testing live phone calls.")
        return

    domain = base_url.replace("https://", "").replace("http://", "").split("/")[0]
    cmd = [ngrok_bin, "http", "8001", "--url", domain]

    try:
        DETACHED_PROCESS = 0x00000008
        ngrok_process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=DETACHED_PROCESS if os.name == 'nt' else 0
        )
        print(f"[AUTO-NGROK]: Automatically started ngrok tunnel: {base_url} -> http://localhost:8001")
    except Exception as e:
        print(f"[AUTO-NGROK]: Note: Could not auto-launch ngrok ({e}).")

# Lifecycle events
@app.on_event("startup")
async def startup_db_client():
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}...")
    print(f"DEBUG: Connecting to database defined in .env.local...")
    await connect_to_mongo()
    await ensure_interview_indexes()
    await ensure_billing_indexes()
    ensure_ngrok_tunnel()
    print(f"API is ready on port 8001")


@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()
    global ngrok_process
    if ngrok_process:
        try:
            ngrok_process.terminate()
            print("[AUTO-NGROK]: ngrok tunnel stopped.")
        except Exception:
            pass

# Routes
app.include_router(auth_routes.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(superadmin_routes.router, prefix="/api/superadmin", tags=["Super Admin"])
app.include_router(resume_routes.router, tags=["Resume Analysis"])
# app.include_router(demo_voice_routes.router, tags=["Demo Voice Interaction"])
# app.include_router(simulation_routes.router, tags=["System Simulation"])
app.include_router(email_routes.router, tags=["Email Interaction"])
app.include_router(job_board_routes.router, tags=["Job Board Interaction"])
app.include_router(analytics_routes.router, prefix="/analytics", tags=["Analytics"])
app.include_router(ai_recruiter_routes.router, prefix="/api", tags=["AI Recruiter"])
app.include_router(interview_routes.recruiter_router, tags=["AI Interview"])
app.include_router(interview_routes.candidate_router, tags=["AI Interview (Candidate)"])
app.include_router(billing_routes.router, prefix="/api", tags=["Billing"])
app.include_router(plivo_routes.plivo_router, prefix="/plivo", tags=["Plivo Telephony Direct"])
app.include_router(plivo_routes.plivo_router, prefix="/api/v1/plivo", tags=["Plivo Telephony"])
app.include_router(plivo_routes.plivo_router, prefix="/api/plivo", tags=["Plivo Telephony Alias"])


@app.get("/")
def read_root():
    return {"message": "Welcome to Hireonomous AI Recruiter API"}

@app.get("/ping")
def ping():
    return {"ping": "pong"}

@app.get("/health")
async def health_check():
    return {
        "status": "ok"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)
