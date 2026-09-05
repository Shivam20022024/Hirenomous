import logging
import smtplib
from email.message import EmailMessage
from typing import Iterable, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    @staticmethod
    def is_configured() -> bool:
        return all([
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            settings.SMTP_USER,
            settings.SMTP_PASSWORD,
            settings.SMTP_FROM_EMAIL,
        ])

    @staticmethod
    def build_shortlist_email(candidate: dict, company_name: str) -> tuple[str, str]:
        candidate_name = candidate.get("name", "Candidate")

        # Prefer the actual job posting's title (resolved by the caller via job_id)
        # over the candidate's resume-parsed `role` guess, which is set once at
        # upload time and can be stale/generic or shared across a candidate's
        # multiple applications to different jobs.
        job_role = candidate.get("job_title_for_email") or candidate.get("role")
        if not job_role or job_role in ["Not Assessed", "Manual Entry"]:
            job_role_display = "an open position"
        else:
            job_role_display = f"the {job_role} position"
            
        meeting_link = "https://meet.google.com/hiring-novlantis"
        time_slots = "Monday 10:00 AM EST, Tuesday 2:00 PM EST, Wednesday 11:30 AM EST"
        
        # Get AI summary based on candidate skills
        skills = candidate.get("skills", [])
        ai_summary = "Your strong background aligns perfectly with what we are looking for."
        if skills:
            ai_summary = f"Your background with {', '.join(skills[:3])} aligns perfectly with what we are looking for."
            
        prompt = f"""
        You are an AI recruitment assistant.

        Your task is to generate a professional interview scheduling email for a candidate who has been shortlisted.

        Input details:
        - Candidate Name: {candidate_name}
        - Role: {job_role_display}
        - Company Name: {company_name}
        - Interview Mode: Online
        - Interview Link: {meeting_link}
        - Available Time Slots: {time_slots}
        - AI Summary (optional): {ai_summary}

        Instructions:
        1. Start with a polite greeting.
        2. Inform the candidate that they have been shortlisted.
        3. Mention the role they applied for.
        4. Ask them to select a suitable time slot from the provided options.
        5. Include interview details (mode, link, duration if available).
        6. If AI summary is provided, include a short 1–2 line positive note about their profile.
        7. Keep tone professional, concise, and friendly.
        8. End with a clear call to action (confirm availability).

        Output format:
        Return STRICTLY a JSON object. No extra text.
        {{
            "subject": "The generated email subject",
            "body": "The full generated email body"
        }}
        """

        try:
            import requests
            import json
            headers = {
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": settings.OPENROUTER_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a recruitment assistant. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"}
            }
            response = requests.post(
                settings.OPENROUTER_API_URL,
                headers=headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            result = json.loads(content)
            return result.get("subject", "Interview Invitation"), result.get("body", "")
        except Exception as e:
            # Fallback
            subject = f"Interview Invitation from {company_name}"
            body = (
                f"Hi {candidate_name},\n\n"
                f"Thank you for applying. You have been shortlisted for {job_role_display} at {company_name}.\n"
                f"Our team will contact you shortly with the next steps.\n\n"
                "Best regards,\n"
                f"{company_name} Hiring Team"
            )
            return subject, body

    @staticmethod
    def build_interview_invite_email(
        candidate: dict,
        job_title: str,
        interview_url: str,
        expected_minutes: str = "20-30",
        company_name: str = "Hireonomous",
    ) -> tuple[str, str]:
        """Dedicated AI Interview invitation email. Independent of the
        shortlist / selection email — creating an interview must never send that."""
        candidate_name = candidate.get("name", "Candidate")
        role_display = job_title or "the open position"
        subject = f"AI Interview Invitation – {role_display}"
        body = (
            f"Hi {candidate_name},\n\n"
            f"Thank you for your interest in the {role_display} position.\n\n"
            "You have been invited to complete an AI-powered interview. It will assess your "
            "technical knowledge, problem solving, role-specific skills and communication.\n\n"
            f"Interview duration:\nApproximately {expected_minutes} minutes.\n\n"
            f"Interview link:\n{interview_url}\n\n"
            "Before you begin:\n"
            "- Use a quiet environment with a stable internet connection.\n"
            "- Use a laptop or desktop with a working microphone (Chrome or Edge recommended).\n"
            "- Allow microphone access when prompted.\n"
            "- Complete the interview independently and in one sitting.\n\n"
            "This link is personal to you and will expire, so please complete the interview soon.\n\n"
            "Regards,\n"
            f"{company_name} Hiring Team"
        )
        return subject, body

    @staticmethod
    def send_selection_email(candidate: dict, company_name: str) -> dict:
        """Explicitly send the existing shortlist/selection email to a SINGLE
        candidate. Reuses `build_shortlist_email`. Only ever called from an
        explicit recruiter 'Select' action — never from any interview lifecycle."""
        email = (candidate.get("email") or "").strip()
        name = candidate.get("name") or "Candidate"
        if not email or "@" not in email:
            return {"sent": 0, "skipped": 1, "failed": 0, "errors": [f"{name}: no valid email"]}
        try:
            subject, body = EmailService.build_shortlist_email(candidate, company_name)
            EmailService.send_email(email, subject, body)
            return {"sent": 1, "skipped": 0, "failed": 0, "errors": []}
        except Exception as exc:
            return {"sent": 0, "skipped": 0, "failed": 1, "errors": [f"{name} <{email}>: {exc}"]}

    @staticmethod
    def send_email(to_email: str, subject: str, body: str) -> None:
        if not EmailService.is_configured():
            raise RuntimeError(
                "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL."
            )

        message = EmailMessage()
        message["From"] = settings.SMTP_FROM_EMAIL
        message["To"] = to_email
        message["Subject"] = subject
        message.set_content(body)

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)

    @staticmethod
    def send_bulk_shortlist_emails(candidates: Iterable[dict], company_name: str) -> dict:
        sent = 0
        skipped = 0
        failed = 0
        errors = []
        sent_ids = []

        for candidate in candidates:

            email = (candidate.get("email") or "").strip()
            name = candidate.get("name") or "Candidate"

            if not email or "@" not in email:
                skipped += 1
                continue

            try:
                subject, body = EmailService.build_shortlist_email(candidate, company_name)
                EmailService.send_email(email, subject, body)
                sent += 1
                if candidate.get("id"):
                    sent_ids.append(candidate["id"])

            except Exception as exc:
                failed += 1
                errors.append(f"{name} <{email}>: {str(exc)}")

        return {
            "sent": sent,
            "skipped": skipped,
            "failed": failed,
            "errors": errors[:10],
            "sent_ids": sent_ids
        }

    @staticmethod
    async def send_password_reset_email(recipient_email: str, reset_link: str) -> bool:
        if not settings.SMTP_HOST:
            logger.warning(f"SMTP not configured. Skipping password reset email for {recipient_email}. Link: {reset_link}")
            return True
            
        try:
            subject = "Password Reset Request"
            body = f"""
Hello,

We received a request to reset your password. Click the link below to set a new password:

{reset_link}

If you did not request this, please ignore this email.

Best regards,
The Hireonomous Team
            """
            
            EmailService.send_email(recipient_email, subject, body)
            logger.info(f"Successfully sent password reset email to {recipient_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send password reset email to {recipient_email}: {str(e)}")
            return False
