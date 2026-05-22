"""MiniMax API client wrapper."""

import json
import httpx
from typing import AsyncGenerator
from app.config import get_settings

settings = get_settings()


class MiniMaxClient:
    """Async client for MiniMax chat completion API."""

    def __init__(self) -> None:
        self.base_url = settings.MINIMAX_BASE_URL
        self.api_key = settings.MINIMAX_API_KEY
        self.model = settings.MINIMAX_MODEL

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096,
        response_format: dict | None = None,
    ) -> str:
        """Send a chat completion request and return the assistant message content."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            payload["response_format"] = response_format

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{self.base_url}/text/chatcompletion_v2",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("choices"):
                raise RuntimeError(f"MiniMax API returned no choices: {data}")
            return data["choices"][0]["message"]["content"]

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        """
        Send a chat completion request and yield assistant message content
        word-by-word (streaming). Yields empty string on no-content choices.
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/text/chatcompletion_v2",
                headers=headers,
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if raw == "[DONE]":
                        break
                    try:
                        obj = json.loads(raw)
                        content = obj.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if content:
                            yield content
                    except Exception:
                        pass

    async def chat_json(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> dict:
        """Send a chat request expecting JSON response."""
        # Add instruction to return JSON
        system_msg = messages[0] if messages and messages[0]["role"] == "system" else {"role": "system", "content": ""}
        system_msg["content"] += "\n\nOutput strictly in JSON format with no other text."
        if messages and messages[0]["role"] == "system":
            messages[0] = system_msg
        else:
            messages.insert(0, system_msg)

        raw = await self.chat(messages, temperature=temperature, max_tokens=max_tokens)
        # Try to extract JSON from potential markdown code blocks
        raw = raw.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            # Only strip if there are at least 3 lines (open, content, close)
            if len(lines) >= 3:
                raw = "\n".join(lines[1:-1])
            else:
                raw = "\n".join(lines[1:])
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # Last attempt: strip any remaining markdown tokens
            import re
            cleaned = re.sub(r'^```[a-zA-Z]*\s*', '', raw).strip()
            try:
                return json.loads(cleaned)
            except Exception:
                raise RuntimeError(f"Failed to parse MiniMax response as JSON: {raw[:200]}")


# Singleton
minimax_client = MiniMaxClient()
