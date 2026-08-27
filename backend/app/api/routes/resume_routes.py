from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.models.candidate import Candidate, ResumeAnalysisResponse
from app.core.config import settings
from app.core.database import get_db
from app.services.excel_service import ExcelService
from app.services.resume_service import ResumeService
from app.utils.parser import extract_text
import os
import shutil
import uuid
import json
import logging
import time
import tempfile
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from app.api.deps import get_context_organization_id
from fastapi import Depends
from fastapi.responses import FileResponse
from fastapi.concurrency import run_in_threadpool

class ManualCandidate(BaseModel):
    name: str
    email: str
    phone: str
    skills: List[str]
    role: Optional[str] = "Manual Entry"
    job_id: Optional[str] = None

router = APIRouter()
logger = logging.getLogger(__name__)

# Demo data logic removed per requirement

def format_candidate_response(c: dict):
    return {
        "candidate_id": c.get("id"),
        "name": c.get("name"),
        "email": c.get("email"),
        "phone": c.get("phone"),
        "score": c.get("resume_score"),
        "skills": c.get("skills"),
        "missing_skills": c.get("missing_skills"),
        "summary": c.get("summary"),
        "status": c.get("status"),
        "shortlisted": c.get("shortlisted", False),
        "email_sent": c.get("email_sent", False),
        "interest": c.get("interest"),
        "role": c.get("role"),
        "job_id": c.get("job_id"),
        "call_status": c.get("call_status"),
        "call_duration": c.get("call_duration"),
        "call_start_time": c.get("call_start_time").isoformat() if c.get("call_start_time") and hasattr(c.get("call_start_time"), "isoformat") else str(c.get("call_start_time")) if c.get("call_start_time") else None,
        "call_end_time": c.get("call_end_time").isoformat() if c.get("call_end_time") and hasattr(c.get("call_end_time"), "isoformat") else str(c.get("call_end_time")) if c.get("call_end_time") else None,
        "transcript": c.get("transcript"),
        "candidate_responded": c.get("candidate_responded", False),
        "interest_status": c.get("interest_status"),
        "interview_status": c.get("interview_status"),
        "interview_scheduled": c.get("interview_scheduled", False),
        "interview_time": c.get("interview_time"),
        "ai_summary": c.get("ai_summary") or c.get("reason"),
        "recruiter_verdict": c.get("recruiter_verdict"),
        "conversation_summary": c.get("conversation_summary"),
        "created_at": c.get("created_at").isoformat() if c.get("created_at") and hasattr(c.get("created_at"), "isoformat") else str(c.get("created_at")) if c.get("created_at") else None,
        "last_interaction": c.get("last_interaction").isoformat() if c.get("last_interaction") and hasattr(c.get("last_interaction"), "isoformat") else None,
        "screening_completed_at": c.get("screening_completed_at").isoformat() if c.get("screening_completed_at") and hasattr(c.get("screening_completed_at"), "isoformat") else None,
        "screening_score": c.get("screening_score"),
        "screening_skills": c.get("screening_skills"),
        "experience_years": c.get("experience_years"),
        "current_ctc": c.get("current_ctc"),
        "expected_ctc": c.get("expected_ctc"),
        "location": c.get("location"),
        "availability": c.get("availability"),
        "communication_score": c.get("communication_score"),
        "technical_score": c.get("technical_score"),
        "confidence_score": c.get("confidence_score"),
        "final_recommendation": c.get("final_recommendation"),
        "recording_url": c.get("recording_url"),
        "interview_date": c.get("interview_date")
    }






@router.post("/upload-resume", response_model=ResumeAnalysisResponse)
async def upload_resume(
    file: UploadFile = File(...),
    job_description: str = Form("We are looking for a software engineer with Python and AI experience."),
    jd_file: UploadFile | None = File(None),
    skip_ai: bool = Form(False),
    job_id: Optional[str] = Form(None),
    org_id: str = Depends(get_context_organization_id)
):
    start_time = time.time()
    request_id = str(uuid.uuid4())[:8]
    logger.info(f"[{request_id}] Starting resume upload process for file: {file.filename}, skip_ai: {skip_ai}")
    
    # 1. Save temp file
    temp_dir = "temp_resumes"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{file.filename}")
    jd_file_path = None
    
    try:
        await file.seek(0)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        logger.info(f"[{request_id}] Resume received: {file.filename}")

        effective_job_description = job_description
        if jd_file and jd_file.filename:
            jd_file_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{jd_file.filename}")
            await jd_file.seek(0)
            with open(jd_file_path, "wb") as buffer:
                shutil.copyfileobj(jd_file.file, buffer)
            logger.info(f"[{request_id}] JD file received: {jd_file.filename}")

            try:
                if os.path.getsize(jd_file_path) == 0:
                    raise ValueError("Uploaded JD file is empty.")
                extracted_jd = await run_in_threadpool(extract_text, jd_file_path)
                if not extracted_jd or len(extracted_jd.strip()) < 50:
                    raise ValueError("Extracted job description text is too short.")
                effective_job_description = extracted_jd.strip()
                logger.info(f"[{request_id}] Using uploaded JD file for scoring.")
            except Exception as e:
                if job_description and job_description.strip():
                    logger.warning(f"[{request_id}] JD extraction failed, falling back to typed JD text: {str(e)}")
                else:
                    logger.error(f"[{request_id}] JD extraction failed: {str(e)}")
                    raise HTTPException(status_code=400, detail=f"Failed to extract text from JD file: {str(e)}")
        
        # 2. Extract text
        logger.info(f"[{request_id}] Extracting text from {file.filename}...")
        try:
            text = await run_in_threadpool(extract_text, file_path)
            if not text or len(text.strip()) < 50:
                logger.warning(f"[{request_id}] Extracted text is too short or empty ({len(text) if text else 0} chars)")
                raise ValueError("Extracted text is too short to be a valid resume.")
        except Exception as e:
            logger.error(f"[{request_id}] Text extraction failed: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Failed to extract text from resume: {str(e)}")
            
        # 3. Process with AI or Skip AI
        try:
            if skip_ai:
                logger.info(f"[{request_id}] Skipping AI analysis, using fast local extraction...")
                from app.services.resume_service import fallback_parse_resume_text
                parsed_data = fallback_parse_resume_text(text)
                candidate_name = parsed_data.get('name') or 'Candidate'
                if candidate_name == "Unknown": candidate_name = "Candidate"
                result = {
                    **parsed_data,
                    "name": candidate_name,
                    "score": 100.0,
                    "missing_skills": [],
                    "reason": "AI scoring bypassed.",
                    "summary": parsed_data.get("experience_summary", "AI scoring bypassed."),
                    "role": "Not Assessed",
                    "total_experience": parsed_data.get("total_experience", "Not Assessed")
                }
            else:
                result = await ResumeService.process_resume(text, effective_job_description)
                candidate_name = result.get('name', 'Candidate')
        except Exception as e:
            logger.error(f"[{request_id}] Critical processing failure: {str(e)}")
            result = {
                "name": "Candidate",
                "email": "N/A",
                "phone": "N/A",
                "skills": [],
                "missing_skills": [],
                "score": 50.0,
                "reason": "Internal processing error.",
                "summary": "N/A",
                "role": "Not Assessed"
            }
            candidate_name = "Candidate"
        score = result.get("score", 50.0)
        phone = result.get("phone", "")
        
        if not phone or str(phone).strip().lower() in ["", "n/a", "none", "null"]:
            logger.warning(f"[{request_id}] No phone number found for {file.filename}. Adding as rejected.")
            status = "rejected"
            result["reason"] = "Rejected: Could not detect a valid phone number."
            score = 0.0 # Force a low score
        else:
            # If we hit a fallback (50.0) due to processing failure, mark as pending for human review
            if score == 50.0 and ("failure" in result.get("reason", "").lower() or "error" in result.get("reason", "").lower()):
                status = "pending"
            else:
                status = "shortlisted" if score >= settings.SHORTLIST_THRESHOLD else "rejected"

        candidate_data = {
            "id": str(uuid.uuid4()),
            "name": candidate_name,
            "email": result.get("email"),
            "phone": result.get("phone"),
            "skills": result.get("skills", []),
            "missing_skills": result.get("missing_skills", []),
            "resume_score": score,
            "reason": result.get("reason", ""),
            "summary": result.get("summary", ""),
            "job_description": effective_job_description,
            "status": status,
            "shortlisted": status == "shortlisted",
            "role": result.get("role"),
            "total_experience": result.get("total_experience", "Not Available"),
            "ai_summary": result.get("reason"),
            "organization_id": org_id,
            "job_id": job_id,
            "created_at": datetime.utcnow()
        }



        # 4. Save to DB
        try:
            db = get_db()

            logger.info(f"[{request_id}] DB update started for {candidate_name}...")
            await db.candidates.insert_one(candidate_data)
            logger.info(f"[{request_id}] DB updated successfully.")
            
            # 5. Save to Excel
            logger.info(f"[{request_id}] Excel update started...")
            ExcelService.update_candidate_excel(candidate_data, org_id)
            logger.info(f"[{request_id}] Excel updated successfully.")
        except Exception as e:
            logger.error(f"[{request_id}] Database/Excel stage failed: {str(e)}")
            logger.warning(f"[{request_id}] Returning parsed candidate data without persistence.")

        duration = time.time() - start_time
        logger.info(f"[{request_id}] Total processing time: {duration:.2f}s")

        return ResumeAnalysisResponse(
            candidate_id=candidate_data["id"],
            name=candidate_data["name"],
            email=candidate_data["email"],
            phone=candidate_data["phone"],
            score=candidate_data["resume_score"],
            skills=candidate_data["skills"],
            missing_skills=candidate_data["missing_skills"],
            summary=candidate_data["summary"],
            status=candidate_data["status"],
            role=candidate_data.get("role")
        )

            
    finally:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"[{request_id}] Cleaned up temp file {file_path}")
            except Exception as e:
                logger.warning(f"[{request_id}] Failed to delete temp file {file_path}: {str(e)}")
        if jd_file_path and os.path.exists(jd_file_path):
            try:
                os.remove(jd_file_path)
                logger.info(f"[{request_id}] Cleaned up temp JD file {jd_file_path}")
            except Exception as e:
                logger.warning(f"[{request_id}] Failed to delete temp JD file {jd_file_path}: {str(e)}")


@router.post("/add-manual", response_model=ResumeAnalysisResponse)
async def add_manual_candidate(candidate: ManualCandidate, org_id: str = Depends(get_context_organization_id)):
    request_id = str(uuid.uuid4())[:8]
    logger.info(f"[{request_id}] Starting manual candidate entry for: {candidate.name}")

    candidate_data = {
        "id": str(uuid.uuid4()),
        "name": candidate.name,
        "email": candidate.email,
        "phone": candidate.phone,
        "skills": candidate.skills,
        "missing_skills": [],
        "resume_score": 100.0, # Give a perfect score so it's shortlisted
        "reason": "Manually added candidate.",
        "summary": "Manually added candidate without AI parsing.",
        "job_description": "",
        "status": "shortlisted",
        "shortlisted": True,
        "role": candidate.role,
        "ai_summary": "Manually added candidate without AI parsing.",
        "organization_id": org_id,
        "job_id": candidate.job_id,
        "created_at": datetime.utcnow()
    }

    try:
        db = get_db()
        logger.info(f"[{request_id}] DB update started for {candidate.name}...")
        await db.candidates.insert_one(candidate_data)
        logger.info(f"[{request_id}] DB updated successfully.")
        
        logger.info(f"[{request_id}] Excel update started...")
        ExcelService.update_candidate_excel(candidate_data, org_id)
        logger.info(f"[{request_id}] Excel updated successfully.")
    except Exception as e:
        logger.error(f"[{request_id}] Database/Excel stage failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save manual candidate: {str(e)}")

    return ResumeAnalysisResponse(
        candidate_id=candidate_data["id"],
        name=candidate_data["name"],
        email=candidate_data["email"],
        phone=candidate_data["phone"],
        score=candidate_data["resume_score"],
        skills=candidate_data["skills"],
        missing_skills=candidate_data["missing_skills"],
        summary=candidate_data["summary"],
        status=candidate_data["status"],
        role=candidate_data.get("role")
    )

@router.delete("/candidates/{candidate_id}")
async def delete_candidate(candidate_id: str, org_id: str = Depends(get_context_organization_id)):
    db = get_db()
    result = await db.candidates.delete_one({"id": candidate_id, "organization_id": org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return {"status": "success", "message": "Candidate deleted successfully"}

from pydantic import BaseModel

class BulkDeleteRequest(BaseModel):
    candidate_ids: list[str]

@router.delete("/candidates/bulk")
async def bulk_delete_candidates(payload: BulkDeleteRequest, org_id: str = Depends(get_context_organization_id)):
    db = get_db()
    if not payload.candidate_ids:
        return {"status": "success", "deleted_count": 0}
    
    result = await db.candidates.delete_many({
        "id": {"$in": payload.candidate_ids}, 
        "organization_id": org_id
    })
    return {"status": "success", "deleted_count": result.deleted_count, "message": f"Deleted {result.deleted_count} candidates"}

class StatusUpdate(BaseModel):
    status: str

@router.put("/candidates/{candidate_id}/status")
async def update_candidate_status(candidate_id: str, payload: StatusUpdate, org_id: str = Depends(get_context_organization_id)):
    db = get_db()
    result = await db.candidates.update_one(
        {"id": candidate_id, "organization_id": org_id},
        {"$set": {"status": payload.status}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return {"status": "success", "message": f"Candidate status updated to {payload.status}"}


@router.get("/shortlisted")
async def get_shortlisted_candidates(job_id: str = None, org_id: str = Depends(get_context_organization_id)):
    logger.info("Fetching shortlisted candidates...")
    db = get_db()
    query = {"resume_score": {"$gte": settings.SHORTLIST_THRESHOLD}, "organization_id": org_id}
    if job_id:
        query["job_id"] = job_id
    cursor = db.candidates.find(query).sort("created_at", -1)
    candidates = await cursor.to_list(length=100)
    
    results = [format_candidate_response(c) for c in candidates]
    return results


@router.get("/candidates")
async def get_all_candidates(date: str = None, job_id: str = None, org_id: str = Depends(get_context_organization_id)):
    logger.info(f"Fetching all candidates... date={date}")
    db = get_db()
    
    query = {"organization_id": org_id}
    if job_id:
        query["job_id"] = job_id
    if date:
        try:
            from datetime import datetime, timedelta
            start_date = datetime.strptime(date, "%Y-%m-%d")
            end_date = start_date + timedelta(days=1)
            query["created_at"] = {"$gte": start_date, "$lt": end_date}
        except ValueError:
            logger.warning(f"Invalid date format received: {date}")

    cursor = db.candidates.find(query).sort("created_at", -1)
    candidates = await cursor.to_list(length=1000)

    results = [format_candidate_response(c) for c in candidates]
    return results


@router.post("/reset-session")
async def reset_candidate_session(org_id: str = Depends(get_context_organization_id)):
    logger.info("Resetting hiring session data...")
    db = get_db()

    try:
        delete_result = await db.candidates.delete_many({"organization_id": org_id})
        excel_reset = ExcelService.reset_candidate_excel(org_id)
        
        if not excel_reset:
            logger.error("Failed to fully clear the session: Excel reset failed.")
            # We raise an exception so the frontend catches the failure
            raise HTTPException(status_code=500, detail="Could not fully clear the Excel database. Ensure candidates.xlsx is not open.")

        logger.info(f"Session reset complete. Deleted: {delete_result.deleted_count}, Excel Reset: {excel_reset}")
        return {
            "success": True,
            "message": "Session reset successfully",
            "deleted_candidates": delete_result.deleted_count,
            "excel_reset": excel_reset
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        logger.error(f"Critical session reset failure: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Session reset failed: {str(e)}")

# Demo seed endpoint removed


@router.get("/final")
async def get_final_candidates(job_id: str = None, org_id: str = Depends(get_context_organization_id)):
    logger.info("Fetching final candidates with interest...")
    db = get_db()
    query = {"interest": "interested", "organization_id": org_id}
    if job_id:
        query["job_id"] = job_id
    cursor = db.candidates.find(query).sort("created_at", -1)
    candidates = await cursor.to_list(length=100)
    
    results = [format_candidate_response(c) for c in candidates]
    return results

@router.get("/export/candidates")
async def export_candidates(date: str = None, job_id: str = None, org_id: str = Depends(get_context_organization_id)):
    db = get_db()
    query = {"organization_id": org_id}
    if job_id:
        query["job_id"] = job_id
    if date:
        try:
            from datetime import timedelta
            start_date = datetime.strptime(date, "%Y-%m-%d")
            end_date = start_date + timedelta(days=1)
            query["created_at"] = {"$gte": start_date, "$lt": end_date}
        except ValueError:
            pass

    cursor = db.candidates.find(query).sort("created_at", -1)
    candidates = await cursor.to_list(length=1000)

    import tempfile
    from openpyxl import Workbook
    from app.services.excel_service import ExcelService

    wb = Workbook()
    ws = wb.active
    ws.title = "Candidates"
    ws.append(ExcelService.HEADERS)

    for c in candidates:
        row = [
            str(c.get("id", "N/A")),
            c.get("name", "N/A"),
            c.get("email", "N/A"),
            f"{c.get('resume_score', 0)}%",
            c.get("status", "pending"),
            c.get("interest", "pending"),
            c.get("created_at", datetime.now()).strftime("%Y-%m-%d %H:%M:%S") if isinstance(c.get("created_at"), datetime) else "N/A"
        ]
        ws.append(row)

    fd, temp_path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    wb.save(temp_path)
    
    filename = f"candidates_{org_id}_{date}.xlsx" if date else f"candidates_{org_id}.xlsx"
    with open(temp_path, "rb") as f:
        content = f.read()
    from fastapi import Response
    return Response(
        content=content, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/export/calls")
async def export_call_results(date: str = None, job_id: str = None, org_id: str = Depends(get_context_organization_id)):
    db = get_db()
    query = {"organization_id": org_id, "call_status": "completed"}
    if job_id:
        query["job_id"] = job_id
    if date:
        try:
            from datetime import timedelta
            start_date = datetime.strptime(date, "%Y-%m-%d")
            end_date = start_date + timedelta(days=1)
            query["created_at"] = {"$gte": start_date, "$lt": end_date}
        except ValueError:
            pass

    cursor = db.candidates.find(query).sort("created_at", -1)
    candidates = await cursor.to_list(length=1000)

    import tempfile
    from openpyxl import Workbook
    from app.services.excel_service import ExcelService

    wb = Workbook()
    ws = wb.active
    ws.title = "Call Results"
    ws.append(ExcelService.CALL_RESULTS_HEADERS)

    for c in candidates:
        row = [
            str(c.get("id", c.get("_id", "N/A"))),
            c.get("name", "N/A"),
            c.get("email", "N/A"),
            c.get("phone", "N/A"),
            c.get("role") or c.get("job_role") or "N/A",
            c.get("total_experience") or c.get("experience_years") or "N/A",
            c.get("relevant_experience") or "N/A",
            c.get("employment_status") or "N/A",
            c.get("joining_availability") or c.get("availability") or "N/A",
            c.get("interview_availability") or c.get("interview_time") or "N/A",
            c.get("interest_status") or c.get("interested") or c.get("interest") or "N/A",
            c.get("transcript", "N/A"),
            c.get("recording_url", "N/A"),
            c.get("created_at", datetime.now()).strftime("%Y-%m-%d %H:%M:%S") if isinstance(c.get("created_at"), datetime) else "N/A"
        ]
        ws.append(row)

    fd, temp_path = tempfile.mkstemp(suffix=".xlsx")
    os.close(fd)
    wb.save(temp_path)
    
    filename = f"calls_{org_id}_{date}.xlsx" if date else f"calls_{org_id}.xlsx"
    with open(temp_path, "rb") as f:
        content = f.read()
    from fastapi import Response
    return Response(
        content=content, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
