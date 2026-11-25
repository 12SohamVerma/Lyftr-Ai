# Assignment Compliance Audit

Source of truth: `Lyftr_AI_Full_Stack_Assignment.pdf` (6 pages). Audited against the code in this repository on 2026-11-26.

**Status meanings**
- **PASS**: implemented and verified by a test or by running it.
- **PARTIAL**: works, with a stated limitation.
- **FAIL**: missing or not done.

Nothing is marked PASS only because it is documented.

**Evidence used**

| Check | Result |
|---|---|
| `make test` (pytest in a clean `python:3.12-slim` container) | **85 passed** |
| `cd frontend && npm test` (Vitest unit tests) | **38 passed** |
| `cd frontend && npm run test:e2e` against `make up` (Playwright, real Gemini calls) | **15 passed** |
| `cd frontend && npm run build` (type-check + production bundle) | **succeeded** |
| Manual curl checks against the Docker stack and the live Render backend | see section 4 |

---

## 1. System requirements (PDF §2)

| Requirement | Implementation | Verified by | Status |
|---|---|---|---|
| Clean UI, send messages, multi-turn view | `App.tsx`, `ChatInput.tsx`, `ChatWindow.tsx`, `MessageBubble.tsx` | e2e `contract.e2e.ts` (all) | PASS |
| Per-reply metadata: source, model, latency ms, input/output tokens (never a total) | `ResponseMetadata.tsx` renders the API's `metadata` | e2e test 1; pytest `test_tokens_are_per_request_not_a_running_total` | PASS |
| Optional system prompt field | `SystemPromptEditor.tsx` (`system-prompt-input`) | e2e; pytest `test_system_prompt_override_persists_and_is_never_returned` | PASS |
| Backend stores history per session (multi-turn) | `ChatService.chat`, `Database.get_messages` | pytest `test_second_turn_receives_full_earlier_context`; e2e "same-session multi-turn memory" | PASS |
| ≥2 API keys; fail over on 429 / quota / 5xx | `config.parse_key_pool`, `failover_service.run_with_failover`, `is_retryable` | pytest `test_key_1_failure_falls_over_to_key_2[429,quota,500,502,503]`, `test_quota_error_with_unusual_status_still_falls_over` | PASS |
| "Configure LiteLLM with at least 2 keys" | Keys are passed to `litellm.acompletion` per attempt by our ordered loop; no `litellm.Router` | code review | PARTIAL: behaviour fully meets the requirement, but key selection is our own loop around LiteLLM, not a LiteLLM Router configuration (deliberate, for per-request simulation and deterministic `key_id`) |
| User never sees a broken screen / unhandled exception | JSON error handlers + catch-all middleware; UI error block with Retry | pytest 422/502/503 tests; e2e "422 and 503 are shown as readable errors" | PASS |
| LiteLLM built-in cache (in-memory or disk); `LLM_CACHE` / `LIVE_INFERENCE` | `cache_service.configure_cache` (`litellm.cache = Cache(type="disk")`), `is_cache_hit` reads LiteLLM's `cache_hit` flag | pytest `test_litellm_builtin_cache_is_installed`, `test_same_first_message_in_new_session_is_a_cache_hit`; e2e cache tests | PASS |
| Input and output tokens with every response | `token_utils.extract_usage` (provider usage) | pytest `test_tokens_are_provider_reported_for_this_request` | PASS |
| SQLite only (no Redis/Postgres) | stdlib `sqlite3`; the disk cache uses the `diskcache` library on the same volume (no external service) | code review | PASS |
| DB under a Docker volume via `DATABASE_URL`, survives container restarts | `docker-compose.yml` volume `sqlite_data:/data`, `DATABASE_URL=sqlite:////data/app.db` | history survived `make down && make up` (manual); pytest `test_history_survives_an_app_restart` | PASS (local Docker) |
| Same, on the deployed backend | Render **free** plan: no persistent disk | — | PARTIAL: history and cache reset when the Render instance restarts, redeploys or wakes from sleep |
| Schema created automatically on startup | `Database.init_schema()` in `lifespan`, `CREATE TABLE IF NOT EXISTS` | every pytest starts from an empty DB | PASS |
| Required `messages` columns | `models.SCHEMA_STATEMENTS` (unchanged columns + index + extra `sessions` table) | pytest `test_timestamps_are_iso8601` | PASS |
| Frontend deployed and public | https://lyftr-ai-12sohamverma.onrender.com | HTTP 200, live UI e2e (2026-11-26) | PASS |
| Backend deployed and running | https://lyftr-ai-12sohamverma-api.onrender.com | live `/health` 200 | PASS |
| Both tiers connected (CORS) | `ALLOWED_ORIGINS` = frontend URL | live CORS preflight returned the frontend origin | PASS |

## 2. Backend API contract (PDF §3)

| Requirement | Verified by | Status |
|---|---|---|
| Exactly 3 endpoints (`/docs`, `/redoc`, `/openapi.json` disabled) | pytest `test_public_surface_is_only_the_contract` | PASS |
| `GET /health` → 200 `{status, keys_configured, cache_enabled}` (extras `model`, `default_system_prompt` allowed) | pytest `test_health_ok_with_two_keys_db_and_cache` | PASS |
| `POST /chat` request rules: `session_id` 1–128, `message` 1–4000 after trim, optional `system_prompt` | pytest 10× `test_invalid_requests_return_422_and_are_not_persisted`, `test_message_of_exactly_4000_chars_after_trim_is_accepted` | PASS |
| An unknown `session_id` starts a new session | pytest (every first message) | PASS |
| Response fields `session_id, reply, metadata{resolution_source, model, latency_ms, input_tokens, output_tokens, key_id, fallback_attempts}` | pytest `test_valid_request_returns_contract_shape` | PASS |
| `key_id` null and `fallback_attempts` 0 on `LLM_CACHE`; never the key itself | pytest cache tests, `test_health_never_exposes_keys`, `test_provider_error_text_and_keys_never_leak` | PASS |
| `GET /sessions/{id}/messages`: oldest first, no system prompt, metadata on assistant items | pytest `test_history_is_oldest_first_with_assistant_metadata`, `test_profile_context_in_system_prompt_reaches_model_and_is_not_returned` | PASS |
| 422 for missing/empty fields, > 4000 chars, malformed JSON | pytest + curl | PASS |
| 503 `{"detail": "all providers unavailable"}` | pytest `test_all_keys_failing_returns_503_and_persists_nothing`; curl `*=429` | PASS |
| 404 `{"detail": "session not found"}` | pytest `test_unknown_session_returns_404`; curl | PASS |
| Every error is JSON with `detail`; no stack trace or HTML | pytest error tests; catch-all middleware | PASS |
| Failed requests (422/503) are not added to history | pytest `test_failed_turn_does_not_pollute_existing_history` and the 422/503 tests | PASS |
| Cache key = model + full message list; the same first message in a new session hits; a different message never does | pytest `test_cache_key_includes_system_prompt`, `test_cache_key_includes_history`, `test_different_message_never_comes_from_cache`, `test_identical_profile_context_is_a_cache_hit_across_sessions`, `test_different_profile_context_never_comes_from_cache` | PASS |
| Cache hit: identical reply, stored usage, `key_id` null | pytest `test_same_first_message_in_new_session_is_a_cache_hit` | PASS |
| Client sends only the new message | `useChat.send` posts `{session_id, message, system_prompt?}`; e2e checks that the request has no earlier text | PASS |
| Tokens per request; equal-length first messages ≈ same input tokens | pytest `test_equal_length_first_messages_report_same_input_tokens` | PASS |
| Latency is an integer ms; a cache hit is faster than a live call | pytest `test_cache_hit_is_faster_than_live_call`; live 3590 ms → 4 ms | PASS |

**Extra behaviour, not in the PDF but consistent with it:** 502 when the provider rejects a request (400 / empty reply); 422 for an invalid `X-Simulate-Failure` header; 503 "degraded" from `/health` when fewer than 2 keys or the cache is disabled.

## 3. Failover test hook (PDF §4)

| Requirement | Verified by | Status |
|---|---|---|
| `X-Simulate-Failure` header, comma-separated `<key_id>=<status>`, `*` = every key | pytest `test_parse_simulation_header`, `test_explicit_entry_overrides_wildcard` | PASS |
| Statuses 429, 500, 502, 503 | pytest `test_simulated_key_1_failure_uses_key_2[429,500,502,503]` | PASS |
| Affects that one request only | pytest `test_simulated_failure_is_per_request_only` | PASS |
| Honoured only with `ENABLE_FAILURE_SIMULATION=true`; set on the deployed backend | pytest `test_simulation_ignored_when_disabled`; `render.yaml`; live curl | PASS |
| `key_1=429` → 200 `key_2`; `key_1=500` → 200 `key_2`; `*=429` → 503, nothing stored | pytest + live curl (2026-11-26) + e2e | PASS |
| A real answer, never an error wrapped in a 200 | pytest asserts the reply text comes from the (mock) provider; live replies are real Gemini text | PASS |

## 4. Frontend contract (PDF §5)

| testid / rule | Verified by | Status |
|---|---|---|
| `chat-input` (empty after sending) | e2e test 1 | PASS |
| `send-button` (Enter may also send) | e2e (Enter) + build | PASS |
| `assistant-message` per reply, containing the meta elements | e2e test 1 | PASS |
| `meta-source` exactly `LIVE_INFERENCE`/`LLM_CACHE` | e2e regex | PASS |
| `meta-model`, `meta-latency` ("N ms"), `meta-input-tokens`, `meta-output-tokens` (integers) | e2e | PASS |
| `system-prompt-input` | e2e | PASS |
| New session on each page load | e2e "a new session id on every page load" | PASS |
| 422/503 shown as a readable message, never a blank screen | e2e | PASS |
| Deployed frontend talks to the deployed backend; backend allows the origin | live checks | PASS |

## 5. Docker (PDF §6)

| Requirement | Evidence | Status |
|---|---|---|
| Multi-stage Dockerfiles for backend and frontend | `backend/Dockerfile` (builder → runtime), `frontend/Dockerfile` (node → nginx) | PASS |
| Small runtime images | frontend ≈ 82 MB; backend ≈ 603 MB (slim base, no build tools, but LiteLLM's dependency tree is large) | PARTIAL (backend size) |
| `docker-compose.yml` at the repo root running both services | `make up` → both containers healthy | PASS |
| Named volume mounted at `/data` for SQLite | `volumes: sqlite_data:` + `sqlite_data:/data` | PASS |
| Makefile with `up`, `down` | ran `make up` / `make down` (`mingw32-make` on Windows) | PASS |
| All configuration through environment variables | `app/config.py` `Settings`; `.env.example` | PASS |
| Backend on :8000, frontend on :3000 | compose ports; `curl localhost:8000/health`, `localhost:3000` | PASS |

## 6. Deliverables (PDF §7)

| Requirement | Status |
|---|---|
| Live frontend and backend URLs, public, no login | PASS |
| Public GitHub repository | PASS (https://github.com/12SohamVerma/Lyftr-Ai) |
| Repo structure `/backend`, `/frontend`, `docker-compose.yml`, `Makefile`, `.env.example`, `README.md` | PASS |
| Backend tests | PASS (85) |
| `LLM_API_KEYS` (≥2, ids key_1…), `DATABASE_URL`, `ALLOWED_ORIGINS`, `ENABLE_FAILURE_SIMULATION` | PASS |
| `.env.example` lists every variable with placeholders; real keys never in the repo | PASS (`.env` git-ignored; secret scan run before each push) |
| README with the 6 required headings | PASS |
| 2–3 minute demo video with voice | **FAIL — not yet recorded (your action)** |
| Submission form within 24 hours | **FAIL — not yet submitted (your action)** |

## 7. Evaluation rubric (PDF §8)

| Criterion | Status | Note |
|---|---|---|
| System resilience | PASS | 30 failover tests, simulation verified live |
| Caching accuracy | PASS | labels, identical replies, faster hits verified |
| Token usage tracking | PASS | per request, shown with each reply |
| Multi-turn state | PASS | memory, isolation, SQLite, history endpoint |
| Full-stack deployment + `make up` | PARTIAL | live and connected; Render free has no persistent disk and cold starts |
| Code quality, security, docs ("LiteLLM used for caching and fallback") | PARTIAL | caching is LiteLLM; fallback *calls* go through LiteLLM but the key policy is our own loop, not `litellm.Router` |

---

## Profile memory (added after the original submission) — compliance impact

| Check | Result |
|---|---|
| No new endpoint, no changed paths or request schemas | ✔ the only backend change is an extra `/health` field (`default_system_prompt`) |
| Session histories never merged | ✔ pytest `test_profile_memory_does_not_merge_session_histories`; e2e isolation test |
| Same-session memory unchanged | ✔ e2e "same-session multi-turn memory" |
| Custom system prompt preserved | ✔ Vitest "custom system prompt preservation"; e2e |
| Cache behaviour with identical profile context | ✔ pytest + e2e (hit with identical profile; miss with a different or no profile) |
| Graders' default flow unchanged | ✔ nothing is saved without confirmation; with no saved memory no `system_prompt` is sent, exactly as before |

## Deployed persistence — honest statement
On Render's **free** plan the container filesystem is ephemeral. The SQLite history (`/data/app.db`) and the LiteLLM disk cache (`/data/litellm-cache`) survive while the instance runs, but are **lost** when it restarts, is redeployed or wakes from sleep. Local Docker (named volume) keeps both. Options for durable production storage are in README §1 ("Durable storage in production"). None of them is deployed today.
