import logging
from typing import AsyncIterator, Optional
from sarvamai import AsyncSarvamAI

logger = logging.getLogger("hirenomous-sarvam-tts")

SARVAM_MODEL = "bulbul:v4-flash"

SARVAM_VOICE_MAP = {
    "en": {"speaker": "simran_en_conversation", "language_code": "en-IN"},
    "hi": {"speaker": "ishita_enhi_customer", "language_code": "hi-IN"},
}

def sarvam_voice_for(transcription_lang: Optional[str]) -> Optional[dict]:
    """Returns {"speaker", "language_code"} for a validated language code."""
    return SARVAM_VOICE_MAP.get((transcription_lang or "").strip().lower(), SARVAM_VOICE_MAP["en"])

class SarvamTTSSession:
    """One Sarvam text-to-speech-streaming WebSocket connection for the lifetime of a call."""

    def __init__(self, api_key: str, speaker: str, language_code: str):
        self._api_key = api_key
        self._speaker = speaker
        self._language_code = language_code
        self._client: Optional[AsyncSarvamAI] = None
        self._socket_cm = None
        self._socket = None

    async def __aenter__(self) -> "SarvamTTSSession":
        self._client = AsyncSarvamAI(api_subscription_key=self._api_key)
        self._socket_cm = self._client.text_to_speech_streaming.connect(
            model=SARVAM_MODEL,
            send_completion_event=True,
            api_subscription_key=self._api_key,
        )
        self._socket = await self._socket_cm.__aenter__()
        await self._socket.configure(
            target_language_code=self._language_code,
            speaker=self._speaker,
            pace=1.0,
            speech_sample_rate=8000,
            output_audio_codec="mulaw",
            enable_preprocessing=True,
            min_buffer_size=30,
            max_chunk_length=120,
        )
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._socket_cm is not None:
            try:
                await self._socket_cm.__aexit__(exc_type, exc, tb)
            except Exception:
                pass

    async def speak(self, text: str) -> AsyncIterator[str]:
        """Synthesize one chunk of AI speech, yielding base64 mulaw/8kHz audio chunks."""
        text = (text or "").strip()
        if not text or self._socket is None:
            return
        await self._socket.convert(text)
        await self._socket.flush()
        while True:
            msg = await self._socket.recv()
            mtype = getattr(msg, "type", None)
            if mtype == "audio":
                audio_b64 = getattr(msg.data, "audio", None)
                if audio_b64:
                    yield audio_b64
            elif mtype == "event":
                if getattr(msg.data, "event_type", None) == "final":
                    return
            elif mtype == "error":
                logger.error(f"[SARVAM TTS ERROR]: {getattr(msg.data, 'message', msg)}")
                return
            else:
                pass

