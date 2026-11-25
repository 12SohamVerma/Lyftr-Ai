"""Pydantic request/response schemas — the public API contract."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

ResolutionSource = Literal["LIVE_INFERENCE", "LLM_CACHE"]

# strip_whitespace runs before the length checks, so "   " fails min_length=1
# and the 4000-char limit applies to the trimmed text.
MessageText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    session_id: str = Field(min_length=1, max_length=128)
    message: MessageText
    system_prompt: str | None = Field(default=None, max_length=8000)

    @field_validator("session_id")
    @classmethod
    def _session_id_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("session_id must not be blank")
        return v

    @field_validator("system_prompt")
    @classmethod
    def _blank_system_prompt_is_none(cls, v: str | None) -> str | None:
        # An empty/whitespace prompt means "no override" rather than "empty system prompt".
        if v is None:
            return None
        v = v.strip()
        return v or None


class ChatMetadata(BaseModel):
    resolution_source: ResolutionSource
    model: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    key_id: str | None
    fallback_attempts: int


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    metadata: ChatMetadata


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    keys_configured: int
    cache_enabled: bool
    detail: str | None = None


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    metadata: dict[str, Any] | None = None


class HistoryResponse(BaseModel):
    session_id: str
    messages: list[HistoryMessage]
