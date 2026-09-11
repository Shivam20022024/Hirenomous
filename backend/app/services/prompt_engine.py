import json
import logging
from typing import List, Dict, Any
import httpx
from app.core.config import settings
from app.models.job_ai_config import JobAIConfig

logger = logging.getLogger(__name__)

GLOBAL_RECRUITER_RULES = """
- Ask ONE question at a time. Do not ask multiple questions in one sentence.
- Acknowledge the candidate's response before moving on, but keep it brief.
- Avoid repeatedly saying "Great", "Perfect", or "Thanks for sharing".
- Do not repeat a question if the candidate already answered it naturally.
- If the answer is unclear, ask once for clarification.
- If the candidate still doesn't understand, explain the question simply.
- Accept natural language answers. Don't require exact keywords.
- Don't sound robotic. Keep responses short and conversational.
- Speak like a human recruiter.
- Do not invent candidate information.
- Do not make hiring promises.
- Respect candidate responses and handle interruptions naturally.
- Follow the EXACT order of the screening questions provided, unless the conversation context makes a natural response require temporary deviation.
"""

INVALID_ANSWER_RULES = """
- If the candidate's answer is unclear, phrase the question differently.
- Maximum clarification attempts: 2.
- If the candidate still provides an unclear answer after 2 attempts, say "No problem, we can move on to the next question." and proceed.
- NEVER loop indefinitely on the same question.
"""

CALLBACK_RULES = """
- If the candidate says they are busy, in a meeting, or asks you to call back later, DO NOT mark them as not interested.
- Reply naturally, e.g., "No problem. Would you like me to call you back at a more convenient time?"
- Ask for the specific DATE and TIME. The AI must not assume a date/time.
- If they say "Tomorrow", explicitly ask "What time tomorrow works best for you?"
- After collecting both the date and time, thank them and end the call.
- Extract the callback date as 'callback_date' and the callback time as 'callback_time' so the system can record it.
"""

INTEREST_RULES = """
- Use semantic intent to detect interest. Do not use simple keyword matching like if "no" is in the answer.
- Explicit rejection (e.g., "I'm not interested", "I don't want to continue", "I'm not looking for this kind of opportunity") -> Result in marking them as Not Interested.
- Temporary unavailability (e.g., "I'm busy", "Call me later") -> Treat as Callback Required, NOT Not Interested.
- Uncertainty (e.g., "I'm not sure", "Can you tell me more?") -> Continue the conversation and provide details.
"""

PROMPT_TEMPLATE_V1 = """You are Hireonomous AI Recruiter.
You are calling a candidate regarding the {job_title} opportunity at {company_name}.
Your goal is to conduct a short, professional screening conversation.

JOB INFORMATION
Job Title: {job_title}
Job Description: {job_description}
Required Skills: {required_skills}
Experience: {experience_range}
Location: {location}
Employment Type: {employment_type}

SCREENING QUESTIONS (Must be asked in this order)
{screening_questions}

GLOBAL CONVERSATION RULES
{global_recruiter_rules}

INVALID ANSWER RULES
{invalid_answer_rules}

CALLBACK RULES
{callback_rules}

INTEREST RULES
{interest_rules}
"""

class PromptEngine:
    @staticmethod
    async def generate_screening_questions(job_title: str, job_description: str, skills: List[str], experience: str) -> List[Dict[str, Any]]:
        """LLM-generated phone-screening questions tailored to this specific job.
        Each question must be answerable verbally in one short sentence. Falls back
        to a safe generic pair if the LLM call fails."""
        fallback = [
            {"question": f"Are you interested in the {job_title} opportunity?", "category": "Interest", "required": True, "order": 1},
            {"question": "Are you available to start immediately, or is there a notice period?", "category": "Availability", "required": True, "order": 2},
        ]

        system = (
            "You write short screening questions for an AI phone-call recruiter. Each question must be "
            "answerable verbally in one short sentence. NEVER ask for 'years of experience' on a role that "
            "is explicitly for freshers/interns/students — ask about graduation year, relevant coursework, "
            "or projects instead. Tailor every question to the specific job given."
        )
        user = f"""
Job title: {job_title}
Job description: {(job_description or '')[:1500]}
Required skills: {', '.join(skills) if skills else 'not specified'}
Experience expected: {experience or 'not specified'}

Write exactly 3 screening questions for a phone call, in this order:
1. A yes/no interest question about this specific role (category "Interest").
2. A question that fits the ACTUAL experience level expected above — for a fresher/intern/student role ask
   about graduation year, relevant coursework, or project experience; for an experienced-hire role ask about
   years of relevant experience or notice period (category "Experience" or "Availability").
3. One question that checks for a specific skill or qualification actually listed above (category "Skill").

Return STRICT JSON: {{"questions": [{{"question": "...", "category": "..."}}]}}
"""
        try:
            headers = {"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}", "Content-Type": "application/json"}
            payload = {
                "model": settings.OPENROUTER_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.3,
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(settings.OPENROUTER_API_URL, headers=headers, json=payload)
                resp.raise_for_status()
                data = json.loads(resp.json()["choices"][0]["message"]["content"])

            questions = []
            for i, q in enumerate(data.get("questions") or [], start=1):
                text = str(q.get("question", "")).strip()
                if text:
                    questions.append({
                        "question": text,
                        "category": str(q.get("category") or "General"),
                        "required": True,
                        "order": i,
                    })
                if len(questions) == 3:
                    break

            if len(questions) >= 2:
                return questions
            logger.warning("generate_screening_questions LLM returned too few usable questions; using fallback.")
        except Exception as exc:
            logger.warning(f"generate_screening_questions LLM failed, using fallback: {exc}")

        return fallback

    @staticmethod
    def generate_prompt(job: dict, config: dict, candidate_name: str = "the candidate", company_name: str = settings.APP_NAME) -> str:
        """Generates the final system prompt by combining templates and context."""
        
        q_list = config.get("screening_questions", [])
        q_str = "\n".join([f"{q.get('order', idx+1)}. {q.get('question')}" for idx, q in enumerate(q_list)])
        
        prompt = PROMPT_TEMPLATE_V1.format(
            job_title=job.get("title", ""),
            company_name=company_name,
            job_description=job.get("description", ""),
            required_skills=", ".join(job.get("skills", [])),
            experience_range=job.get("experience", ""),
            location=job.get("location", ""),
            employment_type=job.get("jobType", ""),
            screening_questions=q_str,
            global_recruiter_rules=GLOBAL_RECRUITER_RULES,
            invalid_answer_rules=INVALID_ANSWER_RULES,
            callback_rules=CALLBACK_RULES,
            interest_rules=INTEREST_RULES
        )
        
        # Add tone/voice constraints if needed
        tone = config.get("tone", "Professional & Conversational")
        prompt += f"\n\nMaintain a {tone} tone throughout the conversation."
        
        return prompt
