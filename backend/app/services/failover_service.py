"""Ordered key-pool failover and the X-Simulate-Failure test hook.

How a request is resolved
    key_1 -> success                      => key_id=key_1, fallback_attempts=0
    key_1 -> 429/quota/5xx, key_2 -> ok   => key_id=key_2, fallback_attempts=1
    every key fails                       => AllProvidersUnavailable (HTTP 503)

Keys are always tried in configured order, inside the current request only.
There is no shared "cooldown" state: a key that failed (really or via the
simulation header) is tried again first on the next request. This keeps
`key_id`/`fallback_attempts` deterministic and makes simulated failures strictly
per-request, as the assignment requires.

Simulated failures raise the *same* LiteLLM exception classes a real provider
error produces (RateLimitError for 429, InternalServerError for 500, ...), so
they travel through exactly the same classification and failover code.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

import litellm

from ..config import ApiKey

logger = logging.getLogger("lyftr.failover")

SUPPORTED_SIMULATED_STATUSES: frozenset[int] = frozenset({429, 500, 502, 503})

# Retryable = the *key* (or its provider) is the problem, so another key may work.
_RETRYABLE_EXCEPTION_TYPES: tuple[type[BaseException], ...] = (
    litellm.RateLimitError,  # 429, including quota exhaustion
    litellm.InternalServerError,  # 500
    litellm.BadGatewayError,  # 502
    litellm.ServiceUnavailableError,  # 503
    litellm.Timeout,  # provider did not answer in time
    litellm.APIConnectionError,  # network / DNS / TLS failure
    litellm.AuthenticationError,  # 401: revoked or invalid key
    litellm.PermissionDeniedError,  # 403: key lacks access / billing disabled
)
_RETRYABLE_STATUS_CODES: frozenset[int] = frozenset({401, 403, 408, 409, 425, 429})
# Providers report quota/billing problems with varying status codes (Gemini sometimes
# uses 400/403, OpenAI uses 429 "insufficient_quota"), so the message is checked too.
_RETRYABLE_MESSAGE_MARKERS: tuple[str, ...] = (
    "quota",
    "resource_exhausted",
    "resource exhausted",
    "rate limit",
    "ratelimit",
    "insufficient_quota",
    "billing",
    "credit balance",
    "api key not valid",
    "api_key_invalid",
    "invalid api key",
    "overloaded",
)


class AllProvidersUnavailable(Exception):
    """Every configured key failed with a retryable error."""


class ProviderRequestRejected(Exception):
    """The provider rejected the request itself (e.g. 400); another key would not help."""


class SimulationHeaderError(ValueError):
    """The X-Simulate-Failure header could not be parsed."""


@dataclass(frozen=True)
class FailoverResult:
    response: Any
    key_id: str
    fallback_attempts: int


def status_code_of(exc: BaseException) -> int | None:
    code = getattr(exc, "status_code", None)
    return code if isinstance(code, int) else None


def is_retryable(exc: BaseException) -> bool:
    """Should the next key be tried after `exc`?"""
    if isinstance(exc, _RETRYABLE_EXCEPTION_TYPES):
        return True
    code = status_code_of(exc)
    if code is not None and (code in _RETRYABLE_STATUS_CODES or code >= 500):
        return True
    message = str(exc).lower()
    return any(marker in message for marker in _RETRYABLE_MESSAGE_MARKERS)


def parse_simulation_header(raw: str | None, key_pool: tuple[ApiKey, ...]) -> dict[str, int]:
    """Parse `key_1=429,key_2=500` / `*=429` into {key_id: status}.

    `*` applies to every configured key; an explicit entry overrides `*` for its
    key regardless of order. Unknown key ids and unsupported statuses raise
    SimulationHeaderError (returned to the client as a 422).
    """
    if raw is None or not raw.strip():
        return {}
    known_ids = [k.key_id for k in key_pool]
    wildcard: int | None = None
    explicit: dict[str, int] = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        target, sep, status_text = entry.partition("=")
        target, status_text = target.strip(), status_text.strip()
        if not sep or not target or not status_text:
            raise SimulationHeaderError(f"invalid X-Simulate-Failure entry '{entry}', expected <key_id>=<status>")
        try:
            status = int(status_text)
        except ValueError:
            raise SimulationHeaderError(f"invalid status '{status_text}' in X-Simulate-Failure") from None
        if status not in SUPPORTED_SIMULATED_STATUSES:
            allowed = ", ".join(str(s) for s in sorted(SUPPORTED_SIMULATED_STATUSES))
            raise SimulationHeaderError(f"unsupported simulated status {status}; supported: {allowed}")
        if target == "*":
            wildcard = status
        elif target in known_ids:
            explicit[target] = status
        else:
            raise SimulationHeaderError(f"unknown key id '{target}' in X-Simulate-Failure; configured: {', '.join(known_ids) or 'none'}")
    plan = {key_id: wildcard for key_id in known_ids} if wildcard is not None else {}
    plan.update(explicit)
    return plan


def simulated_provider_error(key_id: str, status: int, model: str) -> Exception:
    """Build the LiteLLM exception a real provider failure with `status` would produce."""
    message = f"Simulated HTTP {status} for {key_id} (X-Simulate-Failure)"
    provider = model.split("/", 1)[0] if "/" in model else "unknown"
    exc_type = {
        429: litellm.RateLimitError,
        500: litellm.InternalServerError,
        502: litellm.BadGatewayError,
        503: litellm.ServiceUnavailableError,
    }[status]
    return exc_type(message=message, llm_provider=provider, model=model)


async def run_with_failover(
    key_pool: tuple[ApiKey, ...],
    call: Callable[[ApiKey], Awaitable[Any]],
    *,
    model: str,
    simulated: dict[str, int] | None = None,
) -> FailoverResult:
    """Try `call(key)` for each key in order until one succeeds."""
    simulated = simulated or {}
    failures = 0
    for key in key_pool:
        try:
            if key.key_id in simulated:
                raise simulated_provider_error(key.key_id, simulated[key.key_id], model)
            response = await call(key)
        except Exception as exc:
            if not is_retryable(exc):
                # Log type/status only: provider messages can echo request details.
                logger.warning("%s: non-retryable provider error %s (status=%s)", key.key_id, type(exc).__name__, status_code_of(exc))
                raise ProviderRequestRejected() from exc
            failures += 1
            logger.warning(
                "%s failed with %s (status=%s)%s; trying next key",
                key.key_id,
                type(exc).__name__,
                status_code_of(exc),
                " [simulated]" if key.key_id in simulated else "",
            )
            continue
        if failures:
            logger.info("%s answered after %d failed key(s)", key.key_id, failures)
        return FailoverResult(response=response, key_id=key.key_id, fallback_attempts=failures)

    logger.error("All %d configured keys failed", len(key_pool))
    raise AllProvidersUnavailable()
