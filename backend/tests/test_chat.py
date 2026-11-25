from __future__ import annotations

import litellm
import pytest
from conftest import KEY_1, KEY_2, MODEL, chat, count_prompt_tokens


def test_valid_request_returns_contract_shape(client, provider):
    res = chat(client, "s-7f3a", "What is the capital of France?")
    assert res.status_code == 200
    body = res.json()
    assert set(body) >= {"session_id", "reply", "metadata"}
    assert body["session_id"] == "s-7f3a"
    assert isinstance(body["reply"], str) and body["reply"]
    meta = body["metadata"]
    assert set(meta) >= {
        "resolution_source",
        "model",
        "latency_ms",
        "input_tokens",
        "output_tokens",
        "key_id",
        "fallback_attempts",
    }
    assert meta["resolution_source"] == "LIVE_INFERENCE"
    assert meta["model"] == MODEL
    assert isinstance(meta["latency_ms"], int) and meta["latency_ms"] >= 0
    assert isinstance(meta["input_tokens"], int) and meta["input_tokens"] > 0
    assert isinstance(meta["output_tokens"], int) and meta["output_tokens"] > 0
    assert meta["key_id"] == "key_1"
    assert meta["fallback_attempts"] == 0
    assert KEY_1 not in res.text and KEY_2 not in res.text


def test_tokens_are_provider_reported_for_this_request(client, provider):
    res = chat(client, "tok", "How many tokens is this?")
    sent = provider.provider_calls[-1]["messages"]
    meta = res.json()["metadata"]
    assert meta["input_tokens"] == count_prompt_tokens(sent)
    assert meta["output_tokens"] == len(res.json()["reply"].split())


def test_tokens_are_per_request_not_a_running_total(client, provider):
    first = chat(client, "run", "alpha beta gamma").json()
    second = chat(client, "run", "delta epsilon zeta").json()
    second_prompt = count_prompt_tokens(provider.provider_calls[-1]["messages"])
    # Turn 2 reports exactly the prompt it sent (system + history + new message) ...
    assert second["metadata"]["input_tokens"] == second_prompt
    assert second["metadata"]["input_tokens"] != first["metadata"]["input_tokens"] + second_prompt
    # ... and only this reply's completion tokens.
    assert second["metadata"]["output_tokens"] == len(second["reply"].split())
    assert second["metadata"]["output_tokens"] != first["metadata"]["output_tokens"] + len(second["reply"].split())


def test_equal_length_first_messages_report_same_input_tokens(client):
    a = chat(client, "len-a", "one two three four").json()["metadata"]
    b = chat(client, "len-b", "five six seven eight").json()["metadata"]
    assert a["input_tokens"] == b["input_tokens"]


def test_user_and_assistant_messages_are_saved(client):
    res = chat(client, "save", "Remember this")
    history = client.get("/sessions/save/messages").json()["messages"]
    assert [m["role"] for m in history] == ["user", "assistant"]
    assert history[0]["content"] == "Remember this"
    assert history[1]["content"] == res.json()["reply"]
    assert history[1]["metadata"]["resolution_source"] == "LIVE_INFERENCE"


def test_message_is_trimmed_before_use_and_storage(client, provider):
    chat(client, "trim", "   padded question   \n")
    assert provider.provider_calls[-1]["messages"][-1]["content"] == "padded question"
    assert client.get("/sessions/trim/messages").json()["messages"][0]["content"] == "padded question"


def test_message_of_exactly_4000_chars_after_trim_is_accepted(client):
    assert chat(client, "max", "  " + "x" * 4000 + "  ").status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        {"session_id": "v", "message": ""},
        {"session_id": "v", "message": "    \n\t "},
        {"session_id": "v", "message": "x" * 4001},
        {"session_id": "v"},
        {"message": "hello"},
        {"session_id": "", "message": "hello"},
        {"session_id": "   ", "message": "hello"},
        {"session_id": "s" * 129, "message": "hello"},
        {"session_id": "v", "message": 42},
        {"session_id": "v", "message": None},
    ],
)
def test_invalid_requests_return_422_and_are_not_persisted(client, provider, payload):
    res = client.post("/chat", json=payload)
    assert res.status_code == 422
    assert "detail" in res.json()
    assert provider.all_calls == []
    assert client.get("/sessions/v/messages").status_code == 404


def test_malformed_json_returns_json_422(client, provider):
    res = client.post("/chat", content=b'{"session_id": "m", "message": ', headers={"Content-Type": "application/json"})
    assert res.status_code == 422
    assert res.headers["content-type"].startswith("application/json")
    assert "detail" in res.json()
    assert provider.all_calls == []


def test_validation_errors_do_not_echo_the_input(client):
    secret_text = "x" * 4001
    res = client.post("/chat", json={"session_id": "e", "message": secret_text})
    assert secret_text not in res.text


def test_empty_model_reply_is_an_error_not_a_blank_answer(client, provider):
    provider.reply_override = "   "
    res = chat(client, "empty", "say nothing")
    assert res.status_code == 502
    assert "detail" in res.json()
    assert client.get("/sessions/empty/messages").status_code == 404


def test_non_retryable_provider_error_is_json_and_not_persisted(client, provider):
    provider.fail(
        KEY_1,
        lambda: litellm.BadRequestError(message="context too long", llm_provider="openai", model=MODEL),
    )
    res = chat(client, "bad", "hello")
    assert res.status_code == 502
    assert res.json() == {"detail": "the model provider rejected this request"}
    assert provider.keys_called == [KEY_1]  # a request-level 400 is not retried on other keys
    assert client.get("/sessions/bad/messages").status_code == 404
    assert "Traceback" not in res.text
