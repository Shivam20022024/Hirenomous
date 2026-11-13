import base64
import logging
from typing import AsyncIterator, Optional
import httpx

logger = logging.getLogger("hirenomous-bakbak-tts")

BAKBAK_TTS_URL = "https://hub.getraya.app/v1/text-to-speech"

# Pairings for Raya / Bakbak TTS
BAKBAK_VOICE_MAP = {
    "hi": {"voice_id": "3fe4afbc-3bde-4c97-ab8e-37e3fb8c7ba2", "language": "hi", "model": "m1"},
    "en": {"voice_id": "3fe4afbc-3bde-4c97-ab8e-37e3fb8c7ba2", "language": "en-in", "model": "m1"},
}

def bakbak_voice_for(transcription_lang: Optional[str]) -> dict:
    """Returns {"voice_id", "language", "model"} for Raya / Bakbak TTS."""
    lang = (transcription_lang or "").strip().lower()
    if lang.startswith("hi"):
        return BAKBAK_VOICE_MAP["hi"]
    return BAKBAK_VOICE_MAP["en"]

class BakbakTTSSession:
    """One HTTP call per speak(text), yielding base64 mulaw/8kHz payload."""

    def __init__(self, api_key: str, voice_id: str, language: str, model: str = "m1"):
        self._api_key = api_key
        self._voice_id = voice_id
        self._language = language
        self._model = model
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "BakbakTTSSession":
        self._client = httpx.AsyncClient(
            timeout=20.0,
            limits=httpx.Limits(max_keepalive_connections=10, keepalive_expiry=120.0)
        )
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._client is not None:
            try:
                await self._client.aclose()
            except Exception:
                pass

    async def speak(self, text: str) -> AsyncIterator[str]:
        """Synthesize one chunk of AI speech and yield it as a single
        base64 mulaw/8kHz chunk."""
        text = (text or "").strip()
        if not text or self._client is None:
            return
        try:
            resp = await self._client.post(
                BAKBAK_TTS_URL,
                headers={"X-API-Key": self._api_key, "Content-Type": "application/json"},
                json={
                    "text": text,
                    "voice_id": self._voice_id,
                    "language": self._language,
                    "model": self._model,
                    "codec": "mulaw",
                    "sample_rate": 8000,
                    "speed": 1.05,
                },
            )
            if resp.status_code != 200:
                logger.error(f"[BAKBAK TTS ERROR]: {resp.status_code} - {resp.text[:300]}")
                return
            yield base64.b64encode(resp.content).decode("ascii")
        except Exception as e:
            logger.error(f"[BAKBAK TTS ERROR]: {e}")
            return

