import hashlib
import logging
import os
import uuid
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

class TTSService:
    @staticmethod
    async def generate_speech(text: str, voice: str = "alloy") -> str:
        """
        Converts text to speech using OpenAI TTS API and returns the path to the saved file.
        Caches synthesized speech on disk by text & voice hash for instant 0ms retrieval.
        """
        temp_dir = "temp_audio"
        os.makedirs(temp_dir, exist_ok=True)

        v = voice or "alloy"
        clean_text = (text or "").strip()
        h = hashlib.sha256(f"{v}:{clean_text}".encode("utf-8")).hexdigest()
        file_path = os.path.join(temp_dir, f"tts_{h}.mp3")

        # Return cached audio if present
        if os.path.exists(file_path) and os.path.getsize(file_path) > 100:
            return file_path

        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": "tts-1",
            "input": clean_text,
            "voice": v
        }

        async with httpx.AsyncClient(timeout=12.0) as client:
            try:
                response = await client.post(
                    f"{settings.OPENAI_API_BASE}/audio/speech",
                    headers=headers,
                    json=payload,
                    timeout=12.0
                )
                response.raise_for_status()

                # Write atomically via temp file
                tmp_path = f"{file_path}.tmp.{uuid.uuid4().hex[:8]}"
                with open(tmp_path, "wb") as f:
                    f.write(response.content)
                os.replace(tmp_path, file_path)

                return file_path
            except Exception as e:
                logger.error(f"TTS Generation failed: {str(e)}")
                raise Exception(f"Failed to generate speech: {str(e)}")
