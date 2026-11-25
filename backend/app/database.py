"""SQLite persistence for chat sessions (stdlib sqlite3, no ORM).

Design notes
* One short-lived connection per operation: sqlite3 connections are not meant to
  be shared across threads, and FastAPI runs these blocking calls in a thread pool.
* WAL journal mode + busy_timeout let readers proceed while a writer commits.
* Writes are additionally serialised with a process-wide lock, and a whole chat
  exchange (session row + user message + assistant message) is written in ONE
  transaction, so a failed request can never leave half an exchange behind.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .models import SCHEMA_STATEMENTS, MessageRow, SessionRow

logger = logging.getLogger("lyftr.database")


def utc_now_iso() -> str:
    """Server time in ISO-8601 with an explicit UTC offset, e.g. 2026-11-25T10:15:30.123+00:00."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class Database:
    def __init__(self, path: str) -> None:
        self.path = path
        self._write_lock = threading.Lock()

    # -- connection management -------------------------------------------------
    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=10, isolation_level=None)  # autocommit; explicit BEGIN below
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA busy_timeout = 10000")
            yield conn
        finally:
            conn.close()

    def init_schema(self) -> None:
        """Create the database file, its directory and the schema if they do not exist."""
        Path(self.path).resolve().parent.mkdir(parents=True, exist_ok=True)
        with self._write_lock, self._connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            for statement in SCHEMA_STATEMENTS:
                conn.execute(statement)
        logger.info("SQLite database ready at %s", self.path)

    def ping(self) -> bool:
        try:
            with self._connect() as conn:
                conn.execute("SELECT 1 FROM messages LIMIT 1").fetchall()
            return True
        except sqlite3.Error:
            logger.exception("SQLite health check failed")
            return False

    # -- reads ------------------------------------------------------------------
    def get_session(self, session_id: str) -> SessionRow | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT session_id, system_prompt, created_at FROM sessions WHERE session_id = ?",
                (session_id,),
            ).fetchone()
        if row is None:
            return None
        return SessionRow(row["session_id"], row["system_prompt"], row["created_at"])

    def get_messages(self, session_id: str) -> list[MessageRow]:
        """All stored messages of one session, oldest first (AUTOINCREMENT id gives insertion order)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, session_id, role, content, metadata, created_at "
                "FROM messages WHERE session_id = ? ORDER BY id ASC",
                (session_id,),
            ).fetchall()
        return [
            MessageRow(
                id=r["id"],
                session_id=r["session_id"],
                role=r["role"],
                content=r["content"],
                metadata=_load_json(r["metadata"]),
                created_at=r["created_at"],
            )
            for r in rows
        ]

    # -- writes -----------------------------------------------------------------
    def save_exchange(
        self,
        *,
        session_id: str,
        system_prompt_override: str | None,
        user_content: str,
        user_created_at: str,
        assistant_content: str,
        assistant_metadata: dict[str, Any],
    ) -> None:
        """Persist one successful turn atomically.

        Creates the session on its first successful turn (so failed first requests
        never create an empty session) and stores a new system-prompt override.
        """
        assistant_created_at = utc_now_iso()
        with self._write_lock, self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.execute(
                    "INSERT OR IGNORE INTO sessions (session_id, system_prompt, created_at) VALUES (?, ?, ?)",
                    (session_id, system_prompt_override, user_created_at),
                )
                if system_prompt_override is not None:
                    conn.execute(
                        "UPDATE sessions SET system_prompt = ? WHERE session_id = ?",
                        (system_prompt_override, session_id),
                    )
                conn.execute(
                    "INSERT INTO messages (session_id, role, content, metadata, created_at) VALUES (?, 'user', ?, NULL, ?)",
                    (session_id, user_content, user_created_at),
                )
                conn.execute(
                    "INSERT INTO messages (session_id, role, content, metadata, created_at) VALUES (?, 'assistant', ?, ?, ?)",
                    (session_id, assistant_content, json.dumps(assistant_metadata), assistant_created_at),
                )
                conn.execute("COMMIT")
            except BaseException:
                conn.execute("ROLLBACK")
                raise


def _load_json(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None
