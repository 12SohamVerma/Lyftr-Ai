"""SQLite schema and row types.

`messages` is the table required by the assignment (unchanged columns). `sessions`
is an additional table that stores the per-session system prompt so it can be
re-applied on every turn without ever being returned by the history endpoint.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

SCHEMA_STATEMENTS: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS messages (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  TEXT NOT NULL,
        role        TEXT NOT NULL,          -- 'user' or 'assistant'
        content     TEXT NOT NULL,
        metadata    TEXT,                   -- JSON string, assistant messages only
        created_at  TEXT NOT NULL           -- server time, ISO-8601 (UTC)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_messages_session_id_id ON messages (session_id, id)",
    """
    CREATE TABLE IF NOT EXISTS sessions (
        session_id     TEXT PRIMARY KEY,
        system_prompt  TEXT,                -- NULL means "use DEFAULT_SYSTEM_PROMPT"
        created_at     TEXT NOT NULL
    )
    """,
)


@dataclass(frozen=True)
class SessionRow:
    session_id: str
    system_prompt: str | None
    created_at: str


@dataclass(frozen=True)
class MessageRow:
    id: int
    session_id: str
    role: str
    content: str
    metadata: dict[str, Any] | None
    created_at: str
