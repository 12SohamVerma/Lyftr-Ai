from __future__ import annotations

from conftest import KEY_1, KEY_2, KEY_3

from app.config import parse_key_pool, sqlite_path_from_url


def test_health_ok_with_two_keys_db_and_cache(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    # Contract fields (exact), plus the allowed extra "model" field for the UI.
    assert {k: body[k] for k in ("status", "keys_configured", "cache_enabled")} == {
        "status": "ok",
        "keys_configured": 2,
        "cache_enabled": True,
    }
    assert body["model"] == "openai/gpt-4o-mini"
    assert body["default_system_prompt"] == "You are a test assistant."
    assert "detail" not in body


def test_health_counts_every_configured_key(make_client):
    res = make_client(llm_api_keys=f"{KEY_1}, {KEY_2} ,{KEY_3}").get("/health")
    assert res.status_code == 200
    assert res.json()["keys_configured"] == 3


def test_health_degraded_when_key_pool_incomplete(make_client):
    # A placeholder copied from .env.example must not count as a real key.
    res = make_client(llm_api_keys=f"{KEY_1},your_second_api_key").get("/health")
    assert res.status_code == 503
    body = res.json()
    assert body["status"] == "degraded"
    assert body["keys_configured"] == 1
    assert "detail" in body and "key pool" in body["detail"]


def test_health_reports_cache_disabled(make_client):
    res = make_client(cache_enabled=False).get("/health")
    assert res.status_code == 503
    assert res.json()["cache_enabled"] is False


def test_health_never_exposes_keys(client):
    text = client.get("/health").text
    assert KEY_1 not in text and KEY_2 not in text


def test_key_pool_parsing_ids_whitespace_placeholders_duplicates():
    pool = parse_key_pool(" a-key , ,b-key,your_api_key,a-key,<your-key>, c-key ")
    assert [k.key_id for k in pool] == ["key_1", "key_2", "key_3"]
    assert [k.secret for k in pool] == ["a-key", "b-key", "c-key"]
    assert "a-key" not in repr(pool)  # secrets are hidden from repr/logs
    assert parse_key_pool("") == ()
    assert parse_key_pool(None) == ()


def test_sqlite_url_parsing():
    assert sqlite_path_from_url("sqlite:////data/app.db") == "/data/app.db"
    assert sqlite_path_from_url("sqlite:///./data/app.db") == "./data/app.db"


def test_public_surface_is_only_the_contract(client):
    for path in ("/docs", "/redoc", "/openapi.json", "/nope"):
        res = client.get(path)
        assert res.status_code == 404
        assert "detail" in res.json()


def test_cors_allows_configured_origin_only(client):
    preflight = {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-simulate-failure",
    }
    ok = client.options("/chat", headers={"Origin": "http://localhost:3000", **preflight})
    assert ok.status_code == 200
    assert ok.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "x-simulate-failure" in ok.headers["access-control-allow-headers"].lower()

    bad = client.options("/chat", headers={"Origin": "https://evil.example", **preflight})
    assert "access-control-allow-origin" not in bad.headers
