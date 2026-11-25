from __future__ import annotations

import litellm
from conftest import KEY_1, KEY_2, LIVE_DELAY_SECONDS, chat, rate_limit
from litellm.caching.caching import Cache


def test_litellm_builtin_cache_is_installed(client):
    assert isinstance(litellm.cache, Cache)


def test_same_first_message_in_new_session_is_a_cache_hit(client, provider):
    live = chat(client, "cache-a", "What is the capital of France?").json()
    cached = chat(client, "cache-b", "What is the capital of France?").json()

    assert live["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert cached["metadata"]["resolution_source"] == "LLM_CACHE"
    assert cached["session_id"] == "cache-b"
    assert cached["reply"] == live["reply"]
    assert cached["metadata"]["key_id"] is None
    assert cached["metadata"]["fallback_attempts"] == 0
    assert cached["metadata"]["input_tokens"] == live["metadata"]["input_tokens"]
    assert cached["metadata"]["output_tokens"] == live["metadata"]["output_tokens"]
    assert cached["metadata"]["model"] == live["metadata"]["model"]
    assert len(provider.provider_calls) == 1  # the second answer never reached the provider


def test_cache_hit_is_faster_than_live_call(client):
    live = chat(client, "fast-a", "Explain caching").json()["metadata"]
    cached = chat(client, "fast-b", "Explain caching").json()["metadata"]
    assert live["latency_ms"] >= LIVE_DELAY_SECONDS * 1000
    assert cached["resolution_source"] == "LLM_CACHE"
    assert cached["latency_ms"] < live["latency_ms"]


def test_different_message_never_comes_from_cache(client, provider):
    chat(client, "d-a", "What is the capital of France?")
    other = chat(client, "d-b", "What is the capital of Spain?").json()
    assert other["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert "Spain" in other["reply"]
    assert len(provider.provider_calls) == 2


def test_cache_key_includes_system_prompt(client):
    chat(client, "p-a", "Tell me a fact")
    other = chat(client, "p-b", "Tell me a fact", system_prompt="Answer in French.").json()
    assert other["metadata"]["resolution_source"] == "LIVE_INFERENCE"


def test_cache_key_includes_history(client, provider):
    chat(client, "h-a", "Topic: cats")
    second_turn = chat(client, "h-a", "Tell me more").json()
    fresh = chat(client, "h-b", "Tell me more").json()  # same text, but no history
    assert second_turn["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert fresh["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert fresh["reply"] != second_turn["reply"]


def test_identical_conversation_replays_from_cache_turn_by_turn(client):
    first_a = chat(client, "r-a", "Hello").json()
    second_a = chat(client, "r-a", "And then?").json()
    first_b = chat(client, "r-b", "Hello").json()
    second_b = chat(client, "r-b", "And then?").json()
    assert first_b["metadata"]["resolution_source"] == "LLM_CACHE"
    assert second_b["metadata"]["resolution_source"] == "LLM_CACHE"
    assert (first_b["reply"], second_b["reply"]) == (first_a["reply"], second_a["reply"])


def test_cache_is_shared_across_keys(client, provider):
    # key_1 is down; key_2 answers and LiteLLM stores the result. The API key is not
    # part of the cache key, so a later request (served via key_1's slot) hits the cache.
    provider.fail(KEY_1, rate_limit)
    live = chat(client, "k-a", "shared?").json()["metadata"]
    assert live["key_id"] == "key_2"
    provider.behaviour.clear()
    cached = chat(client, "k-b", "shared?").json()["metadata"]
    assert cached["resolution_source"] == "LLM_CACHE"
    assert provider.keys_called == [KEY_1, KEY_2]


def test_cached_reply_is_saved_to_history_with_cache_metadata(client):
    chat(client, "hist-a", "Cache me")
    chat(client, "hist-b", "Cache me")
    meta = client.get("/sessions/hist-b/messages").json()["messages"][1]["metadata"]
    assert meta["resolution_source"] == "LLM_CACHE"
    assert meta["key_id"] is None


def test_simulation_requests_bypass_cache_reads_and_writes(client, provider):
    first = chat(client, "sim-c1", "bypass me", headers={"X-Simulate-Failure": "key_1=429"}).json()
    assert first["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    # Not written: an identical normal request is still live...
    normal = chat(client, "sim-c2", "bypass me").json()
    assert normal["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    # ...and not read: a simulated request does not use the now-cached answer.
    again = chat(client, "sim-c3", "bypass me", headers={"X-Simulate-Failure": "key_1=500"}).json()
    assert again["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert again["metadata"]["key_id"] == "key_2"
    assert provider.keys_called == [KEY_2, KEY_1, KEY_2]


def test_cache_disabled_means_always_live(make_client):
    client = make_client(cache_enabled=False)
    assert litellm.cache is None
    chat(client, "nc-a", "same")
    assert chat(client, "nc-b", "same").json()["metadata"]["resolution_source"] == "LIVE_INFERENCE"


def test_disk_cache_survives_restart(make_client, tmp_path):
    first = make_client(cache_type="disk", cache_dir=str(tmp_path / "disk-cache"))
    live = chat(first, "disk-a", "persist the cache").json()
    first.__exit__(None, None, None)

    second = make_client(cache_type="disk", cache_dir=str(tmp_path / "disk-cache"))
    cached = chat(second, "disk-b", "persist the cache").json()
    assert cached["metadata"]["resolution_source"] == "LLM_CACHE"
    assert cached["reply"] == live["reply"]
    assert any(p.is_file() for p in (tmp_path / "disk-cache").iterdir())


def test_identical_profile_context_is_a_cache_hit_across_sessions(client, provider):
    profile = "You are a test assistant.\n\nSaved user profile (stated explicitly by the user).\n- Name: Soham"
    live = chat(client, "pc-a", "Say hi to me", system_prompt=profile).json()
    cached = chat(client, "pc-b", "Say hi to me", system_prompt=profile).json()
    assert live["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert cached["metadata"]["resolution_source"] == "LLM_CACHE"
    assert cached["reply"] == live["reply"]
    assert len(provider.provider_calls) == 1


def test_different_profile_context_never_comes_from_cache(client, provider):
    base = "You are a test assistant.\n\nSaved user profile (stated explicitly by the user).\n- Name: "
    chat(client, "pd-a", "Say hi to me", system_prompt=base + "Soham")
    other = chat(client, "pd-b", "Say hi to me", system_prompt=base + "Aniket").json()
    no_profile = chat(client, "pd-c", "Say hi to me").json()
    assert other["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert no_profile["metadata"]["resolution_source"] == "LIVE_INFERENCE"
    assert len(provider.provider_calls) == 3
