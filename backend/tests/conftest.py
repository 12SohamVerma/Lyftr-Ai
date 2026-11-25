"""Shared fixtures.

No test talks to a real LLM provider. The provider boundary is mocked with
LiteLLM's own `mock_response` mechanism: `FakeProvider` wraps
`litellm.acompletion` and injects a per-key mock (a response dict or a LiteLLM
exception). Everything above that boundary — LiteLLM's cache lookup/write,
LiteLLM's exception types, our failover loop, SQLite — runs for real.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Callable, Iterator

os.environ["LITELLM_MODE"] = "PRODUCTION"  # never let LiteLLM load a developer .env during tests
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import litellm  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

KEY_1 = "test-secret-one"
KEY_2 = "test-secret-two"
KEY_3 = "test-secret-three"
MODEL = "openai/gpt-4o-mini"
DEFAULT_PROMPT = "You are a test assistant."
LIVE_DELAY_SECONDS = 0.15  # simulated provider latency; cache hits skip it


def count_prompt_tokens(messages: list[dict[str, str]]) -> int:
    """Deterministic stand-in for a provider tokenizer."""
    return sum(len(m["content"].split()) + 4 for m in messages)


def make_reply(messages: list[dict[str, str]]) -> str:
    users = [m["content"] for m in messages if m["role"] == "user"]
    return f"Answer to: {users[-1]} (turn {len(users)})"


class FakeProvider:
    """Per-key provider behaviour + a log of the calls that actually reached the provider."""

    def __init__(self) -> None:
        self.behaviour: dict[str, Callable[[], Exception] | None] = {}
        self.provider_calls: list[dict[str, Any]] = []  # cache misses only
        self.all_calls: list[dict[str, Any]] = []  # every litellm.acompletion invocation
        self.reply_override: str | None = None
        self._original = litellm.acompletion

    def fail(self, secret: str, exc_factory: Callable[[], Exception]) -> None:
        self.behaviour[secret] = exc_factory

    @property
    def keys_called(self) -> list[str]:
        return [c["api_key"] for c in self.provider_calls]

    async def __call__(self, **kwargs: Any) -> Any:
        api_key = kwargs["api_key"]
        messages = kwargs["messages"]
        self.all_calls.append(kwargs)
        factory = self.behaviour.get(api_key)
        if factory is not None:
            kwargs["mock_response"] = factory()
        else:
            reply = self.reply_override if self.reply_override is not None else make_reply(messages)
            prompt_tokens = count_prompt_tokens(messages)
            completion_tokens = len(reply.split())
            kwargs["mock_response"] = {
                "model": kwargs["model"],
                "choices": [{"index": 0, "message": {"role": "assistant", "content": reply}, "finish_reason": "stop"}],
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": prompt_tokens + completion_tokens,
                },
            }
            kwargs["mock_delay"] = LIVE_DELAY_SECONDS
        try:
            response = await self._original(**kwargs)
        except Exception:
            self.provider_calls.append({"api_key": api_key, "messages": messages, "failed": True})
            raise
        if not (getattr(response, "_hidden_params", {}) or {}).get("cache_hit"):
            self.provider_calls.append({"api_key": api_key, "messages": messages, "failed": False})
        return response


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> FakeProvider:
    fake = FakeProvider()
    monkeypatch.setattr(litellm, "acompletion", fake)
    return fake


def build_settings(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "llm_api_keys": f"{KEY_1},{KEY_2}",
        "llm_model": MODEL,
        "llm_api_base": "",
        "llm_timeout_seconds": 5,
        "llm_max_tokens": 256,
        "database_url": f"sqlite:///{(tmp_path / 'app.db').as_posix()}",
        "allowed_origins": "http://localhost:3000",
        "enable_failure_simulation": True,
        "default_system_prompt": DEFAULT_PROMPT,
        "cache_enabled": True,
        "cache_type": "local",
        "cache_dir": str(tmp_path / "cache"),
        "log_level": "WARNING",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


@pytest.fixture
def make_client(tmp_path: Path, provider: FakeProvider) -> Iterator[Callable[..., TestClient]]:
    """Factory: make_client(**settings_overrides) -> started TestClient (lifespan run)."""
    clients: list[TestClient] = []

    def _make(**overrides: Any) -> TestClient:
        client = TestClient(create_app(build_settings(tmp_path, **overrides)))
        client.__enter__()
        clients.append(client)
        return client

    yield _make
    for c in clients:
        c.__exit__(None, None, None)
    litellm.cache = None


@pytest.fixture
def client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()


def chat(client: TestClient, session_id: str, message: str, headers: dict[str, str] | None = None, **extra: Any):
    return client.post("/chat", json={"session_id": session_id, "message": message, **extra}, headers=headers or {})


def rate_limit() -> Exception:
    return litellm.RateLimitError(message="Rate limit reached for requests", llm_provider="openai", model=MODEL)


def quota_exhausted() -> Exception:
    return litellm.RateLimitError(
        message="You exceeded your current quota, please check your plan and billing details. insufficient_quota",
        llm_provider="openai",
        model=MODEL,
    )


def server_error(status: int = 500) -> Callable[[], Exception]:
    types = {
        500: litellm.InternalServerError,
        502: litellm.BadGatewayError,
        503: litellm.ServiceUnavailableError,
    }
    return lambda: types[status](message=f"upstream {status}", llm_provider="openai", model=MODEL)
