import json
import logging
from typing import AsyncIterator, Optional
import httpx

logger = logging.getLogger("hirenomous-openai-chat")

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"

async def stream_openai_reply(messages: list, api_key: str, model: str = "gpt-4o-mini", client: Optional[httpx.AsyncClient] = None) -> AsyncIterator[str]:
    """Streams one reply given a full message history."""
    if not messages or not api_key:
        return
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "max_tokens": 75,
        "temperature": 0.2,
    }
    try:
        if client is not None:
            async with client.stream("POST", OPENAI_CHAT_URL, headers=headers, json=payload) as resp:
                async for chunk_text in _iter_sse(resp):
                    yield chunk_text
        else:
            async with httpx.AsyncClient(timeout=30.0) as temp_client:
                async with temp_client.stream("POST", OPENAI_CHAT_URL, headers=headers, json=payload) as resp:
                    async for chunk_text in _iter_sse(resp):
                        yield chunk_text
    except Exception as e:
        logger.error(f"[OPENAI CHAT ERROR]: {e}")
        return

async def _iter_sse(resp: httpx.Response) -> AsyncIterator[str]:
    if resp.status_code != 200:
        body = await resp.aread()
        logger.error(f"[OPENAI CHAT ERROR]: {resp.status_code} - {body[:300]}")
        return
    async for line in resp.aiter_lines():
        if not line or not line.startswith("data:"):
            continue
        data_str = line[len("data:"):].strip()
        if not data_str or data_str == "[DONE]":
            continue
        try:
            chunk = json.loads(data_str)
        except Exception:
            continue
        choices = chunk.get("choices") or []
        if not choices:
            continue
        delta = choices[0].get("delta") or {}
        content = delta.get("content")
        if content:
            yield content

