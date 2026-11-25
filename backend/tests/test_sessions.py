from __future__ import annotations

from conftest import DEFAULT_PROMPT, chat


def test_second_turn_receives_full_earlier_context(client, provider):
    first = chat(client, "mt", "My name is Soham.").json()
    chat(client, "mt", "What is my name?")
    sent = provider.provider_calls[-1]["messages"]
    assert sent == [
        {"role": "system", "content": DEFAULT_PROMPT},
        {"role": "user", "content": "My name is Soham."},
        {"role": "assistant", "content": first["reply"]},
        {"role": "user", "content": "What is my name?"},
    ]


def test_sessions_are_isolated(client, provider):
    chat(client, "iso-a", "Secret word is banana.")
    chat(client, "iso-b", "What is the secret word?")
    sent_b = provider.provider_calls[-1]["messages"]
    assert all("banana" not in m["content"] for m in sent_b)
    assert len(client.get("/sessions/iso-a/messages").json()["messages"]) == 2
    assert len(client.get("/sessions/iso-b/messages").json()["messages"]) == 2


def test_history_is_oldest_first_with_assistant_metadata(client):
    for text in ("first", "second", "third"):
        chat(client, "order", text)
    body = client.get("/sessions/order/messages").json()
    assert body["session_id"] == "order"
    msgs = body["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant"] * 3
    assert [m["content"] for m in msgs if m["role"] == "user"] == ["first", "second", "third"]
    for m in msgs:
        if m["role"] == "user":
            assert "metadata" not in m
        else:
            meta = m["metadata"]
            assert meta["resolution_source"] in ("LIVE_INFERENCE", "LLM_CACHE")
            assert isinstance(meta["input_tokens"], int) and isinstance(meta["output_tokens"], int)


def test_unknown_session_returns_404(client):
    res = client.get("/sessions/does-not-exist/messages")
    assert res.status_code == 404
    assert res.json() == {"detail": "session not found"}


def test_system_prompt_override_persists_and_is_never_returned(client, provider):
    chat(client, "sp", "Hello", system_prompt="Answer like a pirate.")
    assert provider.provider_calls[-1]["messages"][0] == {"role": "system", "content": "Answer like a pirate."}

    # Later turns without system_prompt keep the session's override.
    chat(client, "sp", "Again")
    assert provider.provider_calls[-1]["messages"][0] == {"role": "system", "content": "Answer like a pirate."}

    # A new override replaces it for the rest of the session.
    chat(client, "sp", "Now formal", system_prompt="Be formal.")
    chat(client, "sp", "Still formal?")
    assert provider.provider_calls[-1]["messages"][0] == {"role": "system", "content": "Be formal."}

    history = client.get("/sessions/sp/messages")
    assert {m["role"] for m in history.json()["messages"]} == {"user", "assistant"}
    assert "pirate" not in history.text and "Be formal" not in history.text


def test_default_system_prompt_when_none_given(client, provider):
    chat(client, "dflt", "Hi", system_prompt="   ")  # blank means "no override"
    assert provider.provider_calls[-1]["messages"][0] == {"role": "system", "content": DEFAULT_PROMPT}


def test_history_survives_an_app_restart(make_client):
    first = make_client()
    reply = chat(first, "persist", "Keep me").json()["reply"]
    first.__exit__(None, None, None)

    second = make_client()  # new app instance, same SQLite file
    msgs = second.get("/sessions/persist/messages").json()["messages"]
    assert [m["content"] for m in msgs] == ["Keep me", reply]


def test_timestamps_are_iso8601(client, tmp_path):
    import sqlite3
    from datetime import datetime

    chat(client, "ts", "time?")
    with sqlite3.connect(tmp_path / "app.db") as conn:
        stamps = [r[0] for r in conn.execute("SELECT created_at FROM messages WHERE session_id='ts'")]
        assert conn.execute("SELECT metadata FROM messages WHERE role='user'").fetchone()[0] is None
    assert len(stamps) == 2
    for s in stamps:
        assert datetime.fromisoformat(s).tzinfo is not None
