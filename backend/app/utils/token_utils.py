"""Per-request token accounting.

Primary source: the provider-reported `usage` object LiteLLM returns
(`prompt_tokens` = system + history + new message of THIS request,
`completion_tokens` = this reply). On a cache hit LiteLLM replays the stored
response including its original `usage`, so cached replies report the token
counts of the request that produced them.

Fallback (only if a provider omits usage): LiteLLM's model-aware
`token_counter`. That is an estimate (tokenizers can differ slightly from the
provider's billing count) and is logged as such.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import litellm

logger = logging.getLogger("lyftr.tokens")


@dataclass(frozen=True)
class TokenUsage:
    input_tokens: int
    output_tokens: int
    estimated: bool = False


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and value >= 0:
        return int(value)
    return None


def extract_usage(response: Any, *, model: str, messages: list[dict[str, str]], reply: str) -> TokenUsage:
    usage = getattr(response, "usage", None)
    prompt = _as_int(getattr(usage, "prompt_tokens", None)) if usage is not None else None
    completion = _as_int(getattr(usage, "completion_tokens", None)) if usage is not None else None
    if prompt and completion is not None:
        return TokenUsage(input_tokens=prompt, output_tokens=completion)

    logger.warning("Provider response had no usage data; estimating tokens with litellm.token_counter")
    try:
        est_prompt = prompt or litellm.token_counter(model=model, messages=messages)
        est_completion = completion if completion is not None else litellm.token_counter(model=model, text=reply)
    except Exception:  # pragma: no cover - tokenizer unavailable
        logger.exception("Token estimation failed")
        est_prompt, est_completion = prompt or 0, completion or 0
    return TokenUsage(input_tokens=int(est_prompt), output_tokens=int(est_completion), estimated=True)


def extract_reply_text(response: Any) -> str:
    try:
        content = response.choices[0].message.content
    except (AttributeError, IndexError, TypeError):
        return ""
    return content.strip() if isinstance(content, str) else ""
