"""Environment-based configuration.

Every setting comes from an environment variable (or a local `.env` file during
development). The LLM key pool is parsed here into stable, ordered key ids
(`key_1`, `key_2`, ...) so that no other module ever needs to look at raw secrets.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Values that obviously came from .env.example rather than a real provider console.
_PLACEHOLDER_PATTERN = re.compile(
    r"^(your[_-].*|.*placeholder.*|changeme|change[_-]me|replace[_-]?me.*|xxx+|sk-x+|<.*>|\.\.\.)$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ApiKey:
    """One entry of the key pool. `secret` is excluded from repr so it never leaks into logs."""

    key_id: str
    secret: str = field(repr=False)


def is_placeholder_key(value: str) -> bool:
    return bool(_PLACEHOLDER_PATTERN.match(value.strip()))


def parse_key_pool(raw: str | None) -> tuple[ApiKey, ...]:
    """Split a comma-separated key list into ordered `ApiKey`s.

    Whitespace is trimmed, empty entries and obvious placeholders are dropped, and
    duplicates are removed (a duplicate key cannot provide failover). Ids are
    assigned in the order the keys appear: key_1, key_2, ...
    """
    if not raw:
        return ()
    seen: set[str] = set()
    secrets: list[str] = []
    for part in raw.split(","):
        value = part.strip()
        if not value or is_placeholder_key(value) or value in seen:
            continue
        seen.add(value)
        secrets.append(value)
    return tuple(ApiKey(key_id=f"key_{i}", secret=s) for i, s in enumerate(secrets, start=1))


def sqlite_path_from_url(database_url: str) -> str:
    """Translate a SQLAlchemy-style SQLite URL into a filesystem path.

    sqlite:////data/app.db      -> /data/app.db      (absolute, 4 slashes)
    sqlite:///./data/app.db     -> ./data/app.db     (relative, 3 slashes)
    sqlite:///C:/data/app.db    -> C:/data/app.db    (Windows absolute)
    """
    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        raise ValueError("DATABASE_URL must start with 'sqlite:///' (SQLite is the only supported database)")
    path = database_url[len(prefix):]
    if not path:
        raise ValueError("DATABASE_URL does not contain a database path")
    if path == ":memory:":
        raise ValueError("DATABASE_URL must point to a file so history survives restarts")
    return path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    llm_api_keys: str = Field(default="", repr=False)
    llm_model: str = "gemini/gemini-3.5-flash-lite"
    llm_api_base: str = ""
    llm_timeout_seconds: float = 30.0
    llm_max_tokens: int = 1024

    database_url: str = "sqlite:///./data/app.db"
    allowed_origins: str = "http://localhost:3000"
    enable_failure_simulation: bool = False
    default_system_prompt: str = "You are Lyftr AI, a concise and helpful assistant."

    cache_enabled: bool = True
    cache_type: Literal["disk", "local"] = "disk"
    # Empty -> "<directory of the SQLite file>/litellm-cache", i.e. on the same volume.
    cache_dir: str = ""

    log_level: str = "INFO"

    @field_validator("llm_model")
    @classmethod
    def _model_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("LLM_MODEL must not be empty")
        return v

    @field_validator("cache_type", mode="before")
    @classmethod
    def _normalise_cache_type(cls, v: object) -> object:
        return v.strip().lower() if isinstance(v, str) else v

    @cached_property
    def key_pool(self) -> tuple[ApiKey, ...]:
        return parse_key_pool(self.llm_api_keys)

    @cached_property
    def database_path(self) -> str:
        return sqlite_path_from_url(self.database_url)

    @cached_property
    def origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.allowed_origins.split(",") if o.strip()]

    @cached_property
    def resolved_cache_dir(self) -> str:
        if self.cache_dir.strip():
            return self.cache_dir.strip()
        return str(Path(self.database_path).resolve().parent / "litellm-cache")


MIN_REQUIRED_KEYS = 2
