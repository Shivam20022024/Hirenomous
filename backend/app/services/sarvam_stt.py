import logging
from typing import AsyncIterator, Optional
from sarvamai import AsyncSarvamAI

logger = logging.getLogger("hirenomous-sarvam-stt")

SARVAM_STT_MODEL = "saaras:v3-realtime"

class SarvamSTTSession:
    """One Sarvam realtime-STT WebSocket connection for the lifetime of a call.
    Accepts raw base64 mulaw/8kHz audio frames directly from Plivo, with built-in VAD.
    """

    def __init__(self, api_key: str, language_code: str):
        self._api_key = api_key
        self._language_code = language_code
        self._client: Optional[AsyncSarvamAI] = None
        self._socket_cm = None
        self._socket = None

    async def __aenter__(self) -> "SarvamSTTSession":
        self._client = AsyncSarvamAI(api_subscription_key=self._api_key)
        self._socket_cm = self._client.speech_to_text_realtime_streaming.connect(
            language_code=self._language_code,
            model=SARVAM_STT_MODEL,
            stream_type="fast",
            encoding="mulaw",
            sample_rate="8000",
            endpointing="vad",
            silence_duration_ms="200",
            api_subscription_key=self._api_key,
        )
        self._socket = await self._socket_cm.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._socket_cm is not None:
            try:
                await self._socket_cm.__aexit__(exc_type, exc, tb)
            except Exception:
                pass

    async def push_audio(self, mulaw_b64: str) -> None:
        """Forward one base64 mulaw/8kHz frame to Sarvam."""
        if self._socket is None or not mulaw_b64:
            return
        try:
            from sarvamai.types.realtime_audio_input import RealtimeAudioInput
            await self._socket.send_realtime_audio_input(RealtimeAudioInput(audio=mulaw_b64))
        except Exception as e:
            logger.error(f"[SARVAM STT ERROR]: push_audio failed: {e}")

    async def events(self) -> AsyncIterator[dict]:
        """Yields normalized event dicts:
        {"type": "speech_started"},
        {"type": "speech_stopped"},
        {"type": "partial", "text": ...},
        {"type": "final", "text": ...},
        {"type": "error", "message": ...}.
        """
        if self._socket is None:
            return
        try:
            async for msg in self._socket:
                event = getattr(msg, "event", None)
                if event == "vad.speech_start":
                    yield {"type": "speech_started"}
                elif event == "vad.speech_end":
                    yield {"type": "speech_stopped"}
                elif event == "transcript.partial":
                    text = (getattr(msg, "text", "") or "").strip()
                    if text:
                        yield {"type": "partial", "text": text}
                elif event == "transcript.final":
                    text = (getattr(msg, "text", "") or "").strip()
                    if text:
                        yield {"type": "final", "text": text}
                elif event == "error":
                    message = getattr(msg, "message", str(msg))
                    logger.error(f"[SARVAM STT ERROR]: {message}")
                    yield {"type": "error", "message": message}
                    return
        except Exception as e:
            logger.error(f"[SARVAM STT ERROR]: events() loop failed: {e}")

