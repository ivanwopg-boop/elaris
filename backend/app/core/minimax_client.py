"""Unified LLM client — supports MiniMax and DeepSeek API."""

import json
import re
import httpx
from typing import AsyncGenerator
from app.config import get_settings

settings = get_settings()


class MiniMaxClient:
    """Async client for LLM chat completion (MiniMax or DeepSeek)."""

    def __init__(self) -> None:
        self.provider = settings.LLM_PROVIDER
        if self.provider == "deepseek":
            self.base_url = settings.LLM_BASE_URL
            self.api_key = settings.LLM_API_KEY or "sk-9871fd3555b744f7ab88c664d9b9f4ef"
            self.model = settings.LLM_MODEL
            self._chat_endpoint = f"{self.base_url}/chat/completions"
        else:
            self.base_url = settings.MINIMAX_BASE_URL
            self.api_key = settings.MINIMAX_API_KEY
            self.model = settings.MINIMAX_MODEL
            self._chat_endpoint = f"{self.base_url}/text/chatcompletion_v2"

    async def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096,
        response_format: dict | None = None,
        timeout: float = 120.0,
        json_mode: bool = False,
    ) -> str:
        """Send a chat completion request and return the assistant message content.

        json_mode=True sets response_format={"type":"json_object"} which forces
        the LLM to output valid JSON (skips reasoning blocks). Only works for
        providers that support it (DeepSeek does, others may ignore).
        """
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
        elif json_mode:
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                resp = await client.post(
                    self._chat_endpoint,
                    headers=headers,
                    json=payload,
                )
            except httpx.HTTPStatusError as e:
                raise RuntimeError(f"LLM HTTP {e.response.status_code}: {e.response.text[:500]}")
            resp.raise_for_status()
            data = resp.json()
            if not data.get("choices"):
                raise RuntimeError(f"LLM API returned no choices: {data}")
            choice = data["choices"][0]
            msg = choice.get("message", {})
            # Some reasoning models (MiniMax-M2.7) put content in reasoning_content
            content = msg.get("content") or msg.get("reasoning_content") or ""
            return content

    async def chat_stream(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        """Send a chat completion request and yield assistant message content word-by-word."""
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
                self._chat_endpoint,
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
                        delta = obj.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content") or delta.get("reasoning_content") or ""
                        if content:
                            yield content
                    except Exception:
                        pass

    async def chat_json(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.2,
        max_tokens: int = 4096,
        timeout: float = 300.0,
    ) -> dict:
        """Send a chat request expecting JSON response."""
        # Add instruction to return JSON for providers that don't handle response_format well
        system_msg = messages[0] if messages and messages[0]["role"] == "system" else {"role": "system", "content": ""}
        system_msg["content"] += "\n\nOutput strictly in valid JSON with no other text."
        if messages and messages[0]["role"] == "system":
            messages[0] = system_msg
        else:
            messages.insert(0, system_msg)

        raw = await self.chat(
            messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
            timeout=timeout,
        )
        return _extract_json(raw)


def _extract_json(text: str) -> dict:
    """Extract a JSON dict from text that may contain reasoning noise."""
    text = text.strip()

    # 1. Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. Strip markdown code fences
    if text.startswith("```"):
        lines = text.split("\n")
        if len(lines) >= 3:
            text = "\n".join(lines[1:-1])
        else:
            text = "\n".join(lines[1:])
        text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # 3. Regex: find the first top-level {…} block
    brace_depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == '{':
            if brace_depth == 0:
                start = i
            brace_depth += 1
        elif ch == '}':
            brace_depth -= 1
            if brace_depth == 0 and start >= 0:
                candidate = text[start:i+1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    start = -1
                    continue

    # 4. Try array block
    bracket_depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == '[':
            if bracket_depth == 0:
                start = i
            bracket_depth += 1
        elif ch == ']':
            bracket_depth -= 1
            if bracket_depth == 0 and start >= 0:
                candidate = text[start:i+1]
                try:
                    result = json.loads(candidate)
                    if isinstance(result, dict):
                        return result
                    start = -1
                except json.JSONDecodeError:
                    start = -1

    # 5. Strip HTML/think tags and retry
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    # Direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Code block
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        if len(lines) >= 3:
            cleaned = "\n".join(lines[1:-1])
        else:
            cleaned = "\n".join(lines[1:])
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
    # Brace search in cleaned
    for i, ch in enumerate(cleaned):
        if ch == '{':
            depth = 1
            for j in range(i + 1, len(cleaned)):
                if cleaned[j] == '{':
                    depth += 1
                elif cleaned[j] == '}':
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(cleaned[i:j+1])
                        except json.JSONDecodeError:
                            break

    raise RuntimeError(f"Failed to extract JSON from LLM response. First 300 chars: {text[:300]}")


# Singleton
minimax_client = MiniMaxClient()
