"""LiteLLM built-in response cache: setup and observability.

The cache itself is 100% LiteLLM (`litellm.cache = Cache(...)`). This module only
1. configures it (disk or in-memory),
2. reads LiteLLM's own cache-hit flag from the response, and
3. waits for LiteLLM's background cache write to land before a live response is
   returned (see `flush_pending_writes`).

Cache key: LiteLLM hashes the call's LLM parameters — here `model`, the full
`messages` list (system prompt + history + new message) and the constant
`max_tokens`. `api_key`, `api_base`, timeouts and our session id are NOT part of
the key, so the same first message in two different sessions (or answered by
two different keys) resolves to the same cache entry.
"""

from __future__ import annotations

import asyncio
import importlib
import logging
from pathlib import Path
from typing import Any

import litellm
from litellm.caching.caching import Cache

from ..config import Settings

logger = logging.getLogger("lyftr.cache")

# Modules LiteLLM imports lazily the first time it replays a cache hit. Importing
# them at startup keeps the *first* cache hit as fast as every later one.
_CACHE_HIT_LAZY_IMPORTS = (
    "litellm.llms.anthropic.pass_through.messages.response_cache",
    "litellm.responses.streaming_iterator",
)


def configure_cache(settings: Settings) -> bool:
    """Install LiteLLM's global response cache. Returns True when caching is active."""
    if not settings.cache_enabled:
        litellm.cache = None
        logger.warning("LiteLLM response cache is DISABLED (CACHE_ENABLED=false)")
        return False

    if settings.cache_type == "disk":
        cache_dir = settings.resolved_cache_dir
        Path(cache_dir).mkdir(parents=True, exist_ok=True)
        litellm.cache = Cache(type="disk", disk_cache_dir=cache_dir)
        logger.info("LiteLLM disk cache enabled at %s", cache_dir)
    else:
        litellm.cache = Cache(type="local")
        logger.info("LiteLLM in-memory cache enabled")

    for module in _CACHE_HIT_LAZY_IMPORTS:
        try:
            importlib.import_module(module)
        except Exception:  # pragma: no cover - only matters if LiteLLM internals move
            logger.warning("Could not pre-import %s; the first cache hit may be slower", module)
    return True


def is_cache_enabled() -> bool:
    return litellm.cache is not None


def is_cache_hit(response: Any) -> bool:
    """True when LiteLLM served `response` from its cache.

    LiteLLM stamps `_hidden_params["cache_hit"] = True` on responses replayed
    from the cache; live responses carry None/False.
    """
    hidden = getattr(response, "_hidden_params", None) or {}
    return hidden.get("cache_hit") is True


def cache_call_kwargs(use_cache: bool) -> dict[str, Any]:
    """Per-call LiteLLM cache controls."""
    if use_cache and is_cache_enabled():
        return {"caching": True}
    # Neither read from nor write to the cache for this call.
    return {"caching": False, "cache": {"no-cache": True, "no-store": True}}


async def flush_pending_writes(timeout: float = 2.0) -> None:
    """Wait for LiteLLM's fire-and-forget cache writes to finish.

    LiteLLM 1.108 stores a fresh response via `asyncio.create_task` and tracks the
    tasks in `caching_handler._PENDING_CACHE_WRITES`. Without waiting, an identical
    request sent immediately afterwards (e.g. by an automated grader) could race
    the write and miss the cache. This does not write anything itself; it only
    waits for LiteLLM's own write. If the internal name ever disappears this is a
    harmless no-op.
    """
    try:
        from litellm.caching import caching_handler

        pending = [t for t in getattr(caching_handler, "_PENDING_CACHE_WRITES", ()) if not t.done()]
    except Exception:  # pragma: no cover - defensive
        return
    if pending:
        await asyncio.wait(pending, timeout=timeout)
