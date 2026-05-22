"""MiniMax API client wrapper."""

import json
import httpx
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
            return data["choices"][0]["message"]["content"]

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
            raw = "\n".join(lines[1:-1])
        return json.loads(raw)


# Singleton
minimax_client = MiniMaxClient()
