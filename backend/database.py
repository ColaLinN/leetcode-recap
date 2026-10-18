"""Small, transactional personal progress store."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


class Store:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS progress (
                    problem_id TEXT PRIMARY KEY,
                    draft TEXT,
                    review INTEGER NOT NULL DEFAULT 0,
                    accepted INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS submissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    problem_id TEXT NOT NULL,
                    code TEXT NOT NULL,
                    result TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS submissions_problem
                    ON submissions(problem_id, id DESC);
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(str(self.path), timeout=15)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        finally:
            db.close()

    @staticmethod
    def now():
        return datetime.now(timezone.utc).isoformat()

    def state(self, problem_id: str) -> Dict[str, Any]:
        with self.connect() as db:
            row = db.execute("SELECT * FROM progress WHERE problem_id=?", (problem_id,)).fetchone()
        return {"draft": row["draft"], "review": bool(row["review"]), "accepted": bool(row["accepted"])} if row else {
            "draft": None, "review": False, "accepted": False,
        }

    def save_draft(self, problem_id: str, code: str):
        with self.connect() as db:
            db.execute("""INSERT INTO progress(problem_id,draft,updated_at) VALUES(?,?,?)
                ON CONFLICT(problem_id) DO UPDATE SET draft=excluded.draft, updated_at=excluded.updated_at""",
                (problem_id, code, self.now()))
            # An old editor can flush after navigation; only explicit visits
            # should replace an already recorded last-opened problem.
            db.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('last_problem_id',?)", (problem_id,))

    @staticmethod
    def _set_resume(db, problem_id):
        db.execute("INSERT INTO settings(key,value) VALUES('last_problem_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (problem_id,))

    def visit(self, problem_id: str):
        with self.connect() as db:
            self._set_resume(db, problem_id)

    def set_review(self, problem_id: str, review: bool):
        with self.connect() as db:
            db.execute("""INSERT INTO progress(problem_id,review,updated_at) VALUES(?,?,?)
                ON CONFLICT(problem_id) DO UPDATE SET review=excluded.review""", (problem_id, review, self.now()))

    def save_submission(self, problem_id: str, code: str, result: Dict[str, Any]) -> int:
        now = self.now()
        with self.connect() as db:
            cursor = db.execute("INSERT INTO submissions(problem_id,code,result,created_at) VALUES(?,?,?,?)",
                                (problem_id, code, json.dumps(result, ensure_ascii=False), now))
            db.execute("""INSERT INTO progress(problem_id,draft,accepted,updated_at) VALUES(?,?,?,?)
                ON CONFLICT(problem_id) DO UPDATE SET draft=COALESCE(progress.draft,excluded.draft),
                accepted=MAX(progress.accepted,excluded.accepted),
                updated_at=CASE WHEN progress.draft IS NULL THEN excluded.updated_at ELSE progress.updated_at END""",
                (problem_id, code, result["status"] == "Accepted", now))
            return cursor.lastrowid

    def submissions(self, problem_id: str):
        with self.connect() as db:
            rows = db.execute("SELECT * FROM submissions WHERE problem_id=? ORDER BY id DESC LIMIT 100",
                              (problem_id,)).fetchall()
        return [dict(json.loads(row["result"]), id=row["id"], code=row["code"], createdAt=row["created_at"]) for row in rows]

    def progress(self):
        with self.connect() as db:
            rows = db.execute("""SELECT p.problem_id,p.review,p.accepted,
                (SELECT COUNT(*) FROM submissions s WHERE s.problem_id=p.problem_id) AS attempts
                FROM progress p""").fetchall()
        return {row["problem_id"]: {"review": bool(row["review"]), "accepted": bool(row["accepted"]),
                                   "attempts": row["attempts"]} for row in rows}

    def resume(self):
        with self.connect() as db:
            value = db.execute("SELECT value FROM settings WHERE key='last_problem_id'").fetchone()
            if value:
                return value["value"]
            row = db.execute("SELECT problem_id FROM progress WHERE draft IS NOT NULL ORDER BY updated_at DESC LIMIT 1").fetchone()
        return row["problem_id"] if row else None
