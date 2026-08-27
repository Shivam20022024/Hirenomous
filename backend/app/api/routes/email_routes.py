from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from typing import Optional

from app.core.database import get_db
from app.services.email_service import EmailService

from app.api.deps import get_context_organization_id
from fastapi import Depends

router = APIRouter(prefix="/email")

@router.post("/send-shortlisted")
async def send_shortlisted_emails(job_id: Optional[str] = None, org_id: str = Depends(get_context_organization_id)):
    if not EmailService.is_configured():
        raise HTTPException(
            status_code=500,
            detail=(
                "SMTP is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, "
                "SMTP_PASSWORD, and SMTP_FROM_EMAIL in backend/.env.local."
            ),
        )

    db = get_db()

    # Fetch actual company name
    org = await db.organizations.find_one({"id": org_id})
    company_name = org.get("name") if org else "Our Company"

    # "Email Interested" should only reach candidates who actually expressed interest
    # (post-screening status), scoped to the job currently selected in the UI —
    # not every resume-score-qualifying candidate across the whole organization.
    query = {"status": "interested", "organization_id": org_id}
    if job_id:
        query["job_id"] = job_id

    cursor = db.candidates.find(query, {"_id": 0}).sort("created_at", -1)
    candidates = await cursor.to_list(length=500)

    if not candidates:
        return {
            "status": "success",
            "message": "No interested candidates found for this selection.",
            "sent": 0,
            "skipped": 0,
            "failed": 0,
            "errors": [],
        }

    # Resolve each candidate's actual job title from jobs_board (via job_id) so the
    # email names the job they're really being progressed for, instead of the
    # candidate's resume-parsed `role` guess, which is stale/generic and can be
    # identical across a candidate's applications to different jobs.
    job_ids = list({c.get("job_id") for c in candidates if c.get("job_id")})
    if job_ids:
        jobs_cursor = db.jobs_board.find({"id": {"$in": job_ids}}, {"_id": 0, "id": 1, "title": 1})
        jobs_map = {j["id"]: j.get("title") async for j in jobs_cursor}
        for c in candidates:
            resolved_title = jobs_map.get(c.get("job_id"))
            if resolved_title:
                c["job_title_for_email"] = resolved_title

    # send_bulk_shortlist_emails does blocking network I/O (smtplib, requests) per
    # candidate. Run it in a worker thread so a slow/hung SMTP connection can't
    # freeze the single asyncio event loop for every other request on the server.
    result = await run_in_threadpool(EmailService.send_bulk_shortlist_emails, candidates, company_name)

    # Update email_sent flag in DB for successful candidates
    if result.get("sent_ids"):
        await db.candidates.update_many(
            {"id": {"$in": result["sent_ids"]}},
            {"$set": {"email_sent": True}}
        )

    return {
        "status": "success",
        "message": (
            f"Email processing finished. Sent: {result['sent']}, "
            f"Skipped: {result['skipped']}, Failed: {result['failed']}."
        ),
        **result,
    }
