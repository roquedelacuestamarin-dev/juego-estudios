"""Estado privado por sesión. Los originales se eliminan al terminar la extracción."""
import json
import os
import secrets
import sqlite3
import time
from pathlib import Path

from app.models import Preferences


class Store:
    def __init__(self, directory: Path, retention_hours: int):
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.path = directory / "sessions.sqlite3"
        self.ttl = retention_hours * 3600
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires REAL, state TEXT)")
        os.chmod(self.path, 0o600)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.execute("PRAGMA secure_delete=ON")
        return db

    def create(self):
        sid = secrets.token_urlsafe(32)
        state = {"files": [], "messages": [], "preferences": Preferences().model_dump(),
                 "generations": 0, "chat_count": 0, "ai_tokens": 0, "upload_bytes": 0,
                 "package": None, "fingerprint": None, "generation_status": "idle"}
        with self.connect() as db:
            db.execute("INSERT INTO sessions VALUES (?, ?, ?)",
                       (sid, time.time() + self.ttl, json.dumps(state)))
        return sid

    def get(self, sid):
        with self.connect() as db:
            row = db.execute("SELECT state, expires FROM sessions WHERE id=?", (sid,)).fetchone()
        if not row or row[1] <= time.time():
            return None
        state = json.loads(row[0])
        state["expires_at"] = row[1]
        return state

    def save(self, sid, state):
        with self.connect() as db:
            db.execute("UPDATE sessions SET state=? WHERE id=?", (json.dumps(state), sid))

    def delete(self, sid):
        with self.connect() as db:
            db.execute("DELETE FROM sessions WHERE id=?", (sid,))

    def cleanup(self):
        with self.connect() as db:
            db.execute("PRAGMA secure_delete=ON")
            db.execute("DELETE FROM sessions WHERE expires<=?", (time.time(),))

    def recover(self):
        with self.connect() as db:
            rows = db.execute("SELECT id, state FROM sessions").fetchall()
        for sid, raw in rows:
            state = json.loads(raw)
            for f in state["files"]:
                if f["status"] in {"queued", "processing"}:
                    f.update(status="error", error="Se interrumpió el procesamiento. Elimina el archivo y vuelve a adjuntarlo.")
            if state["generation_status"] == "processing":
                state["generation_status"] = "error"
            self.save(sid, state)
