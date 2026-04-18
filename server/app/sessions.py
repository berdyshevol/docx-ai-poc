from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Any

SESSIONS_DIR = Path(__file__).resolve().parent.parent / ".sessions"
SESSIONS_DIR.mkdir(exist_ok=True)


@dataclass
class Session:
    id: str
    path: Path
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    # Running Claude conversation history for this session.
    # Each entry is an Anthropic message dict: {role, content}.
    # Grows across /chat requests; reset only on new session.
    messages: list[dict[str, Any]] = field(default_factory=list)


_sessions: dict[str, Session] = {}
_registry_lock = Lock()


def create(initial_bytes: bytes) -> Session:
    sid = uuid.uuid4().hex[:12]
    sdir = SESSIONS_DIR / sid
    sdir.mkdir(parents=True, exist_ok=True)
    path = sdir / "doc.docx"
    path.write_bytes(initial_bytes)
    sess = Session(id=sid, path=path)
    with _registry_lock:
        _sessions[sid] = sess
    return sess


def get(session_id: str) -> Session | None:
    with _registry_lock:
        return _sessions.get(session_id)
