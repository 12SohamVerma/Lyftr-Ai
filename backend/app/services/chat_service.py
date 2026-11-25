"""Chat orchestration: history -> LiteLLM (cache + key failover) -> persistence.

Request flow for POST /chat
    1. parse X-Simulate-Failure (only when ENABLE_FAILURE_SIMULATION=true)
    2. load the session's system prompt + history from SQLite
    3. build the full message list: [system, *history, new user message]
    4. LiteLLM call through the ordered key pool (cache checked first by LiteLLM)
    5. build metadata (source, model, latency, tokens, key id, fallback count)
    6. persist user + assistant message in one transaction -- only on success
"""

from __future__ import annotations

import asyncio
import logging
import time
import weakref

from ..config import Settings
from ..database import Database, utc_now_iso
from ..schemas import ChatMetadata, ChatRequest, ChatResponse, HistoryMessage, HistoryResponse
from ..utils.token_utils import extract_reply_text, extract_usage
from . import cache_service
from .failover_service import parse_simulation_header, run_with_failover
from .litellm_service import LiteLLMService

logger = logging.getLogger("lyftr.chat")


class EmptyModelReply(Exception):
    """The provider answered successfully but with no text."""


class SessionNotFound(Exception):
    pass


class ChatService:
    def __init__(self, settings: Settings, db: Database, llm: LiteLLMService) -> None:
        self._settings = settings
        self._db = db
        self._llm = llm
        # One lock per active session id: turns of the same session are processed
        # one after another so each turn sees the previous turn's history.
        self._session_locks: weakref.WeakValueDictionary[str, asyncio.Lock] = weakref.WeakValueDictionary()

    def _lock_for(self, session_id: str) -> asyncio.Lock:
        lock = self._session_locks.get(session_id)
        if lock is None:
            lock = asyncio.Lock()
            self._session_locks[session_id] = lock
        return lock

    async def chat(self, request: ChatRequest, simulate_failure_header: str | None) -> ChatResponse:
        started = time.perf_counter()
        received_at = utc_now_iso()

        simulated: dict[str, int] = {}
        if self._settings.enable_failure_simulation:
            simulated = parse_simulation_header(simulate_failure_header, self._settings.key_pool)

        async with self._lock_for(request.session_id):
            session = await asyncio.to_thread(self._db.get_session, request.session_id)
            stored = await asyncio.to_thread(self._db.get_messages, request.session_id)

            system_prompt = (
                request.system_prompt
                or (session.system_prompt if session else None)
                or self._settings.default_system_prompt
            )
            messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
            messages += [{"role": m.role, "content": m.content} for m in stored]
            messages.append({"role": "user", "content": request.message})

            # Simulated requests bypass the cache (no read, no write) so the hook
            # always exercises the real provider path and the failover logic.
            use_cache = cache_service.is_cache_enabled() and not simulated

            result = await run_with_failover(
                self._settings.key_pool,
                lambda key: self._llm.complete(messages, api_key=key.secret, use_cache=use_cache),
                model=self._llm.model,
                simulated=simulated,
            )
            response = result.response
            cache_hit = use_cache and cache_service.is_cache_hit(response)

            reply = extract_reply_text(response)
            if not reply:
                raise EmptyModelReply()
            usage = extract_usage(response, model=self._llm.model, messages=messages, reply=reply)

            if use_cache and not cache_hit:
                await cache_service.flush_pending_writes()

            metadata = ChatMetadata(
                resolution_source="LLM_CACHE" if cache_hit else "LIVE_INFERENCE",
                model=self._llm.model,
                latency_ms=max(0, int(round((time.perf_counter() - started) * 1000))),
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                key_id=None if cache_hit else result.key_id,
                fallback_attempts=0 if cache_hit else result.fallback_attempts,
            )

            await asyncio.to_thread(
                self._db.save_exchange,
                session_id=request.session_id,
                system_prompt_override=request.system_prompt,
                user_content=request.message,
                user_created_at=received_at,
                assistant_content=reply,
                assistant_metadata=metadata.model_dump(),
            )

        logger.info(
            "chat ok source=%s key=%s fallbacks=%d latency_ms=%d tokens=%d/%d",
            metadata.resolution_source,
            metadata.key_id,
            metadata.fallback_attempts,
            metadata.latency_ms,
            metadata.input_tokens,
            metadata.output_tokens,
        )
        return ChatResponse(session_id=request.session_id, reply=reply, metadata=metadata)

    async def history(self, session_id: str) -> HistoryResponse:
        session = await asyncio.to_thread(self._db.get_session, session_id)
        if session is None:
            raise SessionNotFound()
        rows = await asyncio.to_thread(self._db.get_messages, session_id)
        return HistoryResponse(
            session_id=session_id,
            messages=[
                HistoryMessage(role=r.role, content=r.content, metadata=r.metadata if r.role == "assistant" else None)  # type: ignore[arg-type]
                for r in rows
            ],
        )
