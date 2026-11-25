"""JSON error handling: every error is `{"detail": ...}`, never HTML or a stack trace."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..services.chat_service import EmptyModelReply
from ..services.failover_service import (
    AllProvidersUnavailable,
    ProviderRequestRejected,
    SimulationHeaderError,
)

logger = logging.getLogger("lyftr.errors")

ALL_PROVIDERS_UNAVAILABLE = "all providers unavailable"


async def _http_exception(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    # FastAPI's default shape, minus the echoed "input" (it can be a 4000-char
    # message or sensitive text) and the docs "url".
    errors = [{k: v for k, v in err.items() if k not in ("input", "url")} for err in exc.errors()]
    return JSONResponse({"detail": jsonable_encoder(errors)}, status_code=422)


async def _all_providers_unavailable(_: Request, __: AllProvidersUnavailable) -> JSONResponse:
    return JSONResponse({"detail": ALL_PROVIDERS_UNAVAILABLE}, status_code=503)


async def _provider_rejected(_: Request, __: ProviderRequestRejected) -> JSONResponse:
    return JSONResponse({"detail": "the model provider rejected this request"}, status_code=502)


async def _empty_reply(_: Request, __: EmptyModelReply) -> JSONResponse:
    return JSONResponse({"detail": "the model returned an empty reply"}, status_code=502)


async def _simulation_header(_: Request, exc: SimulationHeaderError) -> JSONResponse:
    return JSONResponse({"detail": str(exc)}, status_code=422)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, _http_exception)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _validation_error)  # type: ignore[arg-type]
    app.add_exception_handler(AllProvidersUnavailable, _all_providers_unavailable)  # type: ignore[arg-type]
    app.add_exception_handler(ProviderRequestRejected, _provider_rejected)  # type: ignore[arg-type]
    app.add_exception_handler(EmptyModelReply, _empty_reply)  # type: ignore[arg-type]
    app.add_exception_handler(SimulationHeaderError, _simulation_header)  # type: ignore[arg-type]

    @app.middleware("http")
    async def _catch_unexpected(request: Request, call_next):  # type: ignore[no-untyped-def]
        # Registered before CORSMiddleware is added, so it sits *inside* CORS and
        # even an unexpected 500 still carries CORS headers (the browser can read it).
        try:
            return await call_next(request)
        except Exception:
            logger.exception("Unhandled error on %s %s", request.method, request.url.path)
            return JSONResponse({"detail": "internal server error"}, status_code=500)
