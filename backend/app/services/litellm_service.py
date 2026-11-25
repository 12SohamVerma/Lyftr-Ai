"""The single place where the application talks to an LLM provider — via LiteLLM.

`complete()` makes exactly one LiteLLM call with one specific key. LiteLLM's own
retries are disabled (num_retries/max_retries = 0) because retrying *across keys*
is the failover service's job; retrying the same rate-limited key would only
waste time and quota.
"""

from __future__ import annotations

import logging
from typing import Any

import litellm

from ..config import Settings
from . import cache_service

logger = logging.getLogger("lyftr.litellm")

# Global LiteLLM behaviour: no banner/help text on errors, drop params a given
# provider does not support instead of failing, and never log message content.
litellm.suppress_debug_info = True
litellm.drop_params = True
litellm.turn_off_message_logging = True


class LiteLLMService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def model(self) -> str:
        return self._settings.llm_model

    async def complete(self, messages: list[dict[str, str]], *, api_key: str, use_cache: bool) -> Any:
        """One chat completion through LiteLLM with the given key.

        Raises LiteLLM's typed exceptions (RateLimitError, InternalServerError,
        ServiceUnavailableError, AuthenticationError, Timeout, ...), which carry a
        `status_code` that the failover service classifies.
        """
        kwargs: dict[str, Any] = {
            "model": self._settings.llm_model,
            "messages": messages,
            "api_key": api_key,
            "timeout": self._settings.llm_timeout_seconds,
            "num_retries": 0,
            "max_retries": 0,
            **cache_service.cache_call_kwargs(use_cache),
        }
        if self._settings.llm_max_tokens > 0:
            kwargs["max_tokens"] = self._settings.llm_max_tokens
        if self._settings.llm_api_base.strip():
            kwargs["api_base"] = self._settings.llm_api_base.strip()
        return await litellm.acompletion(**kwargs)
