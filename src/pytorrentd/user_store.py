"""SQLite-backed users, sessions, dashboard settings, and watch progress (optional multi-user)."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any

PBKDF2_ITER = 200_000
SESSION_DAYS = 30


def db_path() -> Path:
    base = Path(os.environ.get("PYTORRENT_DATA_DIR", os.path.expanduser("~/.pytorrent")))
    base.mkdir(parents=True, exist_ok=True)
    return base / "pytorrent_users.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path()), timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = _connect()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT UNIQUE NOT NULL COLLATE NOCASE,
              password_hash BLOB NOT NULL,
              salt BLOB NOT NULL,
              created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
              token_hash BLOB PRIMARY KEY,
              user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS user_settings (
              user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
              settings_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS watch_progress (
              user_id INTEGER NOT NULL,
              job_id TEXT NOT NULL,
              position_sec REAL NOT NULL DEFAULT 0,
              duration_sec REAL NOT NULL DEFAULT 0,
              title TEXT,
              updated_at REAL NOT NULL,
              PRIMARY KEY (user_id, job_id)
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_watch_user ON watch_progress(user_id, updated_at);
            """
        )
        conn.commit()
    finally:
        conn.close()


def _hash_password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITER)


def register_user(username: str, password: str) -> tuple[int | None, str]:
    u = username.strip()
    if len(u) < 2 or len(u) > 32:
        return None, "username length 2–32"
    if len(password) < 6:
        return None, "password at least 6 characters"
    salt = secrets.token_bytes(16)
    ph = _hash_password(password, salt)
    conn = _connect()
    try:
        try:
            conn.execute(
                "INSERT INTO users (username, password_hash, salt, created_at) VALUES (?,?,?,?)",
                (u, ph, salt, time.time()),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            return None, "username taken"
        row = conn.execute("SELECT id FROM users WHERE username = ?", (u,)).fetchone()
        return (int(row["id"]), "ok")
    finally:
        conn.close()


def verify_login(username: str, password: str) -> int | None:
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT id, password_hash, salt FROM users WHERE username = ? COLLATE NOCASE",
            (username.strip(),),
        ).fetchone()
        if not row:
            return None
        salt = row["salt"]
        if isinstance(salt, memoryview):
            salt = salt.tobytes()
        expected = row["password_hash"]
        if isinstance(expected, memoryview):
            expected = expected.tobytes()
        if not secrets.compare_digest(_hash_password(password, salt), expected):
            return None
        return int(row["id"])
    finally:
        conn.close()


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    th = hashlib.sha256(token.encode()).digest()
    exp = time.time() + SESSION_DAYS * 86400
    conn = _connect()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)",
            (th, user_id, exp),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def session_user_id(token: str | None) -> int | None:
    if not token:
        return None
    th = hashlib.sha256(token.encode()).digest()
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?", (th,)
        ).fetchone()
        if not row or row["expires_at"] < time.time():
            return None
        return int(row["user_id"])
    finally:
        conn.close()


def revoke_session(token: str | None) -> None:
    if not token:
        return
    th = hashlib.sha256(token.encode()).digest()
    conn = _connect()
    try:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (th,))
        conn.commit()
    finally:
        conn.close()


def get_user(user_id: int) -> dict[str, Any] | None:
    conn = _connect()
    try:
        row = conn.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            return None
        return {"id": int(row["id"]), "username": str(row["username"])}
    finally:
        conn.close()


def get_settings(user_id: int) -> dict[str, Any]:
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT settings_json FROM user_settings WHERE user_id = ?", (user_id,)
        ).fetchone()
        if not row:
            return default_settings()
        try:
            data = json.loads(row["settings_json"] or "{}")
        except json.JSONDecodeError:
            return default_settings()
        return {**default_settings(), **data}
    finally:
        conn.close()


def default_settings() -> dict[str, Any]:
    return {
        "favoriteGenres": ["Horror", "Comedy"],
        "hiddenRowKeys": [],
        "showRecommendations": True,
    }


def save_settings(user_id: int, data: dict[str, Any]) -> None:
    merged = {**default_settings(), **data}
    conn = _connect()
    try:
        conn.execute(
            """INSERT INTO user_settings (user_id, settings_json) VALUES (?,?)
               ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json""",
            (user_id, json.dumps(merged)),
        )
        conn.commit()
    finally:
        conn.close()


def save_watch_progress(
    user_id: int,
    job_id: str,
    position_sec: float,
    duration_sec: float,
    title: str | None,
) -> None:
    conn = _connect()
    try:
        conn.execute(
            """INSERT INTO watch_progress (user_id, job_id, position_sec, duration_sec, title, updated_at)
               VALUES (?,?,?,?,?,?)
               ON CONFLICT(user_id, job_id) DO UPDATE SET
                 position_sec = excluded.position_sec,
                 duration_sec = excluded.duration_sec,
                 title = excluded.title,
                 updated_at = excluded.updated_at""",
            (user_id, job_id, position_sec, duration_sec, title, time.time()),
        )
        conn.commit()
    finally:
        conn.close()


def list_watch_progress(user_id: int, limit: int = 20) -> list[dict[str, Any]]:
    conn = _connect()
    try:
        rows = conn.execute(
            """SELECT job_id, position_sec, duration_sec, title, updated_at
               FROM watch_progress WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?""",
            (user_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


async def async_init_db() -> None:
    await asyncio.to_thread(init_db)
