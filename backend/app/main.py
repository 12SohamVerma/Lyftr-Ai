"""FastAPI application: exactly three public endpoints.

    GET  /health
    POST /chat
    GET  /sessions/{session_id}/messages

Swagger / ReDoc / OpenAPI routes are disabled so the public surface is only the
contract above.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import MIN_REQUIRED_KEYS, Settings
from .database import Database
from .schemas import ChatRequest, ChatResponse, HealthResponse
from .services import cache_service
from .services.chat_service import ChatService, SessionNotFound
from .services.litellm_service import LiteLLMService
from .utils.error_handlers import register_error_handlers

logger = logging.getLogger("lyftr")


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # LiteLLM's own logger is chatty and may include request details at DEBUG.
    logging.getLogger("LiteLLM").setLevel(logging.WARNING)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    _configure_logging(settings.log_level)

    db = Database(settings.database_path)
    llm = LiteLLMService(settings)
    chat_service = ChatService(settings, db, llm)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        db.init_schema()
        cache_service.configure_cache(settings)
        pool = settings.key_pool
        logger.info(
            "Model=%s keys=%s simulation=%s origins=%s",
            settings.llm_model,
            [k.key_id for k in pool],
            settings.enable_failure_simulation,
            settings.origins,
        )
        if len(pool) < MIN_REQUIRED_KEYS:
            logger.error(
                "Only %d usable LLM key(s) configured in LLM_API_KEYS; at least %d are required. /health will report degraded.",
                len(pool),
                MIN_REQUIRED_KEYS,
            )
        yield

    app = FastAPI(
        title="Lyftr AI",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = settings
    app.state.chat_service = chat_service

    register_error_handlers(app)  # adds the catch-all middleware first (=> innermost)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-Simulate-Failure"],
        max_age=600,
    )

    last_health_detail: dict[str, str | None] = {"value": None}

    @app.get("/health", response_model=HealthResponse, response_model_exclude_none=True)
    async def health() -> Any:
        db_ok = await asyncio.to_thread(db.ping)
        keys = len(settings.key_pool)
        cache_on = cache_service.is_cache_enabled()
        problems = []
        if not db_ok:
            problems.append("database unreachable")
        if keys < MIN_REQUIRED_KEYS:
            problems.append(f"key pool needs at least {MIN_REQUIRED_KEYS} keys (have {keys})")
        if not cache_on:
            problems.append("LiteLLM cache disabled")
        body = HealthResponse(
            status="ok" if not problems else "degraded",
            keys_configured=keys,
            cache_enabled=cache_on,
            model=settings.llm_model,
            detail="; ".join(problems) or None,
        )
        # Log only when the health state changes, so platform health checks
        # polling every few seconds don't flood the logs.
        if body.detail != last_health_detail["value"]:
            last_health_detail["value"] = body.detail
            if problems:
                logger.error("Health check DEGRADED: %s", body.detail)
            else:
                logger.info("Health check OK: %d keys, cache enabled", keys)
        if problems:
            return JSONResponse(body.model_dump(), status_code=503)
        return body.model_dump(exclude_none=True)

    @app.post("/chat", response_model=ChatResponse)
    async def chat(
        payload: ChatRequest,
        x_simulate_failure: str | None = Header(default=None, alias="X-Simulate-Failure"),
    ) -> ChatResponse:
        return await chat_service.chat(payload, x_simulate_failure)

    @app.get("/sessions/{session_id}/messages")
    async def session_messages(session_id: str) -> JSONResponse:
        try:
            history = await chat_service.history(session_id)
        except SessionNotFound:
            return JSONResponse({"detail": "session not found"}, status_code=404)
        messages = []
        for m in history.messages:
            item: dict[str, Any] = {"role": m.role, "content": m.content}
            if m.role == "assistant":
                item["metadata"] = m.metadata or {}
            messages.append(item)
        return JSONResponse({"session_id": history.session_id, "messages": messages})

    return app


app = create_app()
