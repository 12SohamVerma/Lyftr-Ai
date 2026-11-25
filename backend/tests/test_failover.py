from __future__ import annotations

import litellm
import pytest
from conftest import KEY_1, KEY_2, KEY_3, MODEL, chat, quota_exhausted, rate_limit, server_error

from app.config import parse_key_pool
from app.services.failover_service import (
    SimulationHeaderError,
    is_retryable,
    parse_simulation_header,
)

ALL_DOWN = {"detail": "all providers unavailable"}


# --- real provider errors (mocked at the LiteLLM boundary) ---------------------------


def test_first_key_succeeds(client, provider):
    meta = chat(client, "f0", "hi").json()["metadata"]
    assert (meta["key_id"], meta["fallback_attempts"]) == ("key_1", 0)
    assert provider.keys_called == [KEY_1]


@pytest.mark.parametrize(
    "error",
    [rate_limit, quota_exhausted, server_error(500), server_error(502), server_error(503)],
    ids=["429", "quota", "500", "502", "503"],
)
def test_key_1_failure_falls_over_to_key_2(client, provider, error):
    provider.fail(KEY_1, error)
    res = chat(client, "f1", "hi")
    assert res.status_code == 200
    meta = res.json()["metadata"]
    assert meta["resolution_source"] == "LIVE_INFERENCE"
    assert (meta["key_id"], meta["fallback_attempts"]) == ("key_2", 1)
    assert provider.keys_called == [KEY_1, KEY_2]
    assert res.json()["reply"].startswith("Answer to: hi")  # a real (mocked-provider) answer, not an error text


def test_quota_error_with_unusual_status_still_falls_over(client, provider):
    # e.g. Google sometimes reports exhausted quota as 403 / RESOURCE_EXHAUSTED
    provider.fail(
        KEY_1,
        lambda: litellm.APIError(status_code=400, message="RESOURCE_EXHAUSTED: Quota exceeded for metric", llm_provider="gemini", model=MODEL),
    )
    meta = chat(client, "fq", "hi").json()["metadata"]
    assert (meta["key_id"], meta["fallback_attempts"]) == ("key_2", 1)


def test_revoked_key_falls_over(client, provider):
    provider.fail(KEY_1, lambda: litellm.AuthenticationError(message="invalid api key", llm_provider="openai", model=MODEL))
    meta = chat(client, "fa", "hi").json()["metadata"]
    assert meta["key_id"] == "key_2"


def test_fallback_attempts_counts_every_failed_key(make_client, provider):
    client = make_client(llm_api_keys=f"{KEY_1},{KEY_2},{KEY_3}")
    provider.fail(KEY_1, rate_limit)
    provider.fail(KEY_2, server_error(503))
    meta = chat(client, "f3", "hi").json()["metadata"]
    assert (meta["key_id"], meta["fallback_attempts"]) == ("key_3", 2)


def test_all_keys_failing_returns_503_and_persists_nothing(client, provider):
    provider.fail(KEY_1, rate_limit)
    provider.fail(KEY_2, server_error(500))
    res = chat(client, "down", "hi")
    assert res.status_code == 503
    assert res.json() == ALL_DOWN
    assert provider.keys_called == [KEY_1, KEY_2]
    assert client.get("/sessions/down/messages").status_code == 404


def test_failed_turn_does_not_pollute_existing_history(client, provider):
    chat(client, "keep", "first")
    provider.fail(KEY_1, rate_limit)
    provider.fail(KEY_2, rate_limit)
    assert chat(client, "keep", "second").status_code == 503
    msgs = client.get("/sessions/keep/messages").json()["messages"]
    assert [m["content"] for m in msgs if m["role"] == "user"] == ["first"]


def test_provider_error_text_and_keys_never_leak(client, provider):
    provider.fail(KEY_1, lambda: litellm.RateLimitError(message=f"bad key {KEY_1}", llm_provider="openai", model=MODEL))
    provider.fail(KEY_2, lambda: litellm.RateLimitError(message=f"bad key {KEY_2}", llm_provider="openai", model=MODEL))
    res = chat(client, "leak", "hi")
    assert KEY_1 not in res.text and KEY_2 not in res.text and "Traceback" not in res.text


# --- X-Simulate-Failure hook --------------------------------------------------------


@pytest.mark.parametrize("status", [429, 500, 502, 503])
def test_simulated_key_1_failure_uses_key_2(client, provider, status):
    res = chat(client, f"sim-{status}", "hi", headers={"X-Simulate-Failure": f"key_1={status}"})
    assert res.status_code == 200
    meta = res.json()["metadata"]
    assert (meta["key_id"], meta["fallback_attempts"]) == ("key_2", 1)
    assert meta["resolution_source"] == "LIVE_INFERENCE"
    assert provider.keys_called == [KEY_2]  # key_1 never reached the provider


@pytest.mark.parametrize("header", ["*=429", "key_1=429,key_2=500", " key_2=503 , key_1=502 "])
def test_simulated_all_keys_failure_returns_503(client, provider, header):
    res = chat(client, "sim-all", "hi", headers={"X-Simulate-Failure": header})
    assert res.status_code == 503
    assert res.json() == ALL_DOWN
    assert provider.all_calls == []
    assert client.get("/sessions/sim-all/messages").status_code == 404


def test_explicit_entry_overrides_wildcard(make_client, provider):
    client = make_client(llm_api_keys=f"{KEY_1},{KEY_2},{KEY_3}")
    # "*" covers every configured key, including key_3
    assert chat(client, "w", "hi", headers={"X-Simulate-Failure": "*=429"}).status_code == 503
    # explicit entries only for key_1/key_2 -> key_3 answers
    meta = chat(client, "w2", "hi", headers={"X-Simulate-Failure": "key_1=429,key_2=500"}).json()["metadata"]
    assert (meta["key_id"], meta["fallback_attempts"]) == ("key_3", 2)


@pytest.mark.parametrize("header", ["key_1=404", "key_1=abc", "key_9=429", "garbage", "key_1="])
def test_invalid_simulation_header_is_rejected_with_422(client, provider, header):
    res = chat(client, "sim-bad", "hi", headers={"X-Simulate-Failure": header})
    assert res.status_code == 422
    assert "detail" in res.json()
    assert provider.all_calls == []
    assert client.get("/sessions/sim-bad/messages").status_code == 404


def test_simulation_ignored_when_disabled(make_client, provider):
    client = make_client(enable_failure_simulation=False)
    res = chat(client, "off", "hi", headers={"X-Simulate-Failure": "*=429"})
    assert res.status_code == 200
    assert res.json()["metadata"]["key_id"] == "key_1"


def test_simulated_failure_is_per_request_only(client, provider):
    chat(client, "once", "first", headers={"X-Simulate-Failure": "key_1=429"})
    meta = chat(client, "once", "second").json()["metadata"]
    assert (meta["key_id"], meta["fallback_attempts"]) == ("key_1", 0)


def test_simulated_success_is_persisted_with_its_metadata(client):
    chat(client, "simsave", "hi", headers={"X-Simulate-Failure": "key_1=500"})
    msgs = client.get("/sessions/simsave/messages").json()["messages"]
    assert msgs[1]["metadata"]["key_id"] == "key_2"
    assert msgs[1]["metadata"]["fallback_attempts"] == 1


# --- unit: classification & parsing -------------------------------------------------


def test_is_retryable_classification():
    assert is_retryable(rate_limit())
    assert is_retryable(quota_exhausted())
    assert is_retryable(server_error(500)())
    assert is_retryable(litellm.Timeout(message="t", llm_provider="openai", model=MODEL))
    assert not is_retryable(litellm.BadRequestError(message="context too long", llm_provider="openai", model=MODEL))
    assert not is_retryable(litellm.ContentPolicyViolationError(message="blocked", llm_provider="openai", model=MODEL))


def test_parse_simulation_header():
    pool = parse_key_pool("a,b")
    assert parse_simulation_header(None, pool) == {}
    assert parse_simulation_header("key_1=429", pool) == {"key_1": 429}
    assert parse_simulation_header("*=503", pool) == {"key_1": 503, "key_2": 503}
    assert parse_simulation_header("key_2=500,*=429", pool) == {"key_1": 429, "key_2": 500}
    with pytest.raises(SimulationHeaderError):
        parse_simulation_header("key_1=418", pool)
    with pytest.raises(SimulationHeaderError):
        parse_simulation_header("key_3=429", pool)
