"""Transactional local practice groups, drafts and timestamped history."""

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict
from zoneinfo import ZoneInfo

DEFAULT_GROUP = "original"
PRACTICE_ZONE = ZoneInfo("Asia/Singapore")


class Store:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            legacy = "progress" in tables and "group_id" not in {row[1] for row in db.execute("PRAGMA table_info(progress)")}
            if legacy:
                # SQLite backup includes committed WAL contents; never copy a live .db file alone.
                backup = self.path.with_name(self.path.stem + "-before-practice-groups-" + uuid.uuid4().hex[:8] + ".sqlite3")
                with sqlite3.connect(str(backup)) as destination:
                    db.backup(destination)
            db.execute("BEGIN IMMEDIATE")
            db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            db.execute("""CREATE TABLE IF NOT EXISTS practice_groups (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL,
                last_practiced_at TEXT, last_problem_id TEXT, archived_at TEXT,
                source_group_id TEXT, legacy_imported INTEGER NOT NULL DEFAULT 0,
                catalog_initialized INTEGER NOT NULL DEFAULT 0)""")
            if "chapter_ids" not in {row[1] for row in db.execute("PRAGMA table_info(practice_groups)")}:
                db.execute("ALTER TABLE practice_groups ADD COLUMN chapter_ids TEXT")
            if "copied_progress" not in {row[1] for row in db.execute("PRAGMA table_info(practice_groups)")}:
                db.execute("ALTER TABLE practice_groups ADD COLUMN copied_progress INTEGER NOT NULL DEFAULT 0")
            if "updated_at" not in {row[1] for row in db.execute("PRAGMA table_info(practice_groups)")}:
                db.execute("ALTER TABLE practice_groups ADD COLUMN updated_at TEXT")
            db.execute("INSERT OR IGNORE INTO practice_groups(id,name,created_at,legacy_imported) VALUES(?,?,?,?)",
                       (DEFAULT_GROUP, "原有练习" if legacy else "第 1 轮复习", self.now(), int(legacy)))
            db.execute("UPDATE practice_groups SET updated_at=created_at WHERE updated_at IS NULL")
            db.execute("""CREATE TABLE IF NOT EXISTS practice_group_problems (
                group_id TEXT NOT NULL REFERENCES practice_groups(id), problem_id TEXT NOT NULL,
                position INTEGER NOT NULL, PRIMARY KEY(group_id,problem_id))""")
            if legacy:
                db.execute("ALTER TABLE progress RENAME TO progress_v1")
            db.execute("""CREATE TABLE IF NOT EXISTS progress (
                group_id TEXT NOT NULL REFERENCES practice_groups(id), problem_id TEXT NOT NULL,
                draft TEXT, review INTEGER NOT NULL DEFAULT 0, accepted INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL, PRIMARY KEY(group_id,problem_id))""")
            if legacy:
                db.execute("INSERT INTO progress SELECT ?,problem_id,draft,review,accepted,updated_at FROM progress_v1", (DEFAULT_GROUP,))
                db.execute("DROP TABLE progress_v1")
                db.execute("UPDATE practice_groups SET last_problem_id=(SELECT value FROM settings WHERE key='last_problem_id') WHERE id=?", (DEFAULT_GROUP,))
            if "completion_override" not in {row[1] for row in db.execute("PRAGMA table_info(progress)")}:
                db.execute("ALTER TABLE progress ADD COLUMN completion_override INTEGER")
            db.execute("""CREATE TABLE IF NOT EXISTS progress_adjustments (
                id INTEGER PRIMARY KEY AUTOINCREMENT, group_id TEXT NOT NULL, problem_id TEXT NOT NULL,
                old_override INTEGER, new_override INTEGER, created_at TEXT NOT NULL)""")
            db.execute("""CREATE TABLE IF NOT EXISTS submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id TEXT NOT NULL,
                code TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL)""")
            columns = {row[1] for row in db.execute("PRAGMA table_info(submissions)")}
            for name, definition in {
                "group_id": "TEXT NOT NULL DEFAULT 'original'", "session_id": "TEXT", "kind": "TEXT NOT NULL DEFAULT 'submit'",
                "finished_at": "TEXT", "request_id": "TEXT", "status": "TEXT NOT NULL DEFAULT 'Unknown'",
                "request_context": "TEXT",
            }.items():
                if name not in columns:
                    db.execute(f"ALTER TABLE submissions ADD COLUMN {name} {definition}")
            if "status" not in columns:
                for row in db.execute("SELECT id,result,created_at FROM submissions").fetchall():
                    db.execute("UPDATE submissions SET status=?,finished_at=? WHERE id=?",
                               (json.loads(row["result"]).get("status", "Unknown"), row["created_at"], row["id"]))
            imported = db.execute("SELECT legacy_imported,last_practiced_at FROM practice_groups WHERE id=?", (DEFAULT_GROUP,)).fetchone()
            if imported["legacy_imported"] and imported["last_practiced_at"] is None:
                last_known = db.execute("""SELECT MAX(time) FROM (
                    SELECT updated_at AS time FROM progress WHERE group_id=?
                    UNION ALL SELECT created_at AS time FROM submissions WHERE group_id=?)""", (DEFAULT_GROUP, DEFAULT_GROUP)).fetchone()[0]
                db.execute("UPDATE practice_groups SET last_practiced_at=? WHERE id=?", (last_known, DEFAULT_GROUP))
            db.execute("CREATE INDEX IF NOT EXISTS submissions_group_problem ON submissions(group_id,problem_id,id DESC)")
            db.execute("CREATE UNIQUE INDEX IF NOT EXISTS submissions_request ON submissions(request_id) WHERE request_id IS NOT NULL")
            db.execute("""CREATE TABLE IF NOT EXISTS practice_sessions (
                id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES practice_groups(id), problem_id TEXT NOT NULL,
                started_at TEXT NOT NULL, first_activity_at TEXT, last_active_at TEXT, ended_at TEXT)""")
            db.execute("CREATE INDEX IF NOT EXISTS sessions_group_time ON practice_sessions(group_id,started_at DESC)")
            db.execute("""CREATE TABLE IF NOT EXISTS practice_days (
                group_id TEXT NOT NULL, day TEXT NOT NULL, session_id TEXT NOT NULL REFERENCES practice_sessions(id),
                PRIMARY KEY(group_id,day,session_id))""")
            db.execute("INSERT INTO settings VALUES('schema_version','3') ON CONFLICT(key) DO UPDATE SET value='3'")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(str(self.path), timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def now():
        return datetime.now(timezone.utc).isoformat()

    def configure_catalog(self, problem_ids):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT catalog_initialized FROM practice_groups WHERE id=?", (DEFAULT_GROUP,)).fetchone()[0]:
                db.executemany("INSERT INTO practice_group_problems VALUES(?,?,?)", [(DEFAULT_GROUP, p, i) for i, p in enumerate(dict.fromkeys(problem_ids))])
                db.execute("UPDATE practice_groups SET catalog_initialized=1 WHERE id=?", (DEFAULT_GROUP,))

    def problem_ids(self, group_id=DEFAULT_GROUP):
        with self.connect() as db:
            return [r[0] for r in db.execute("SELECT problem_id FROM practice_group_problems WHERE group_id=? ORDER BY position", (group_id,))]

    def group(self, group_id=DEFAULT_GROUP):
        return next((group for group in self.groups() if group["id"] == group_id), None)

    def groups(self):
        today = datetime.fromisoformat(self.now()).astimezone(PRACTICE_ZONE).date()
        with self.connect() as db:
            rows = db.execute("""SELECT g.*,
                (SELECT COUNT(*) FROM practice_group_problems m WHERE m.group_id=g.id) total,
                (SELECT COUNT(*) FROM progress p JOIN practice_group_problems m ON m.group_id=p.group_id AND m.problem_id=p.problem_id WHERE p.group_id=g.id AND COALESCE(p.completion_override,p.accepted)=1) completed,
                (SELECT COUNT(*) FROM progress p JOIN practice_group_problems m ON m.group_id=p.group_id AND m.problem_id=p.problem_id WHERE p.group_id=g.id AND p.completion_override IS NOT NULL) manual_count,
                (SELECT COUNT(*) FROM practice_sessions s WHERE s.group_id=g.id AND s.first_activity_at IS NOT NULL) practice_count
                FROM practice_groups g ORDER BY g.created_at DESC,g.rowid DESC""").fetchall()
            days = db.execute("SELECT group_id,day,session_id FROM practice_days").fetchall()
        result = []
        for row in rows:
            group_days = {r["day"] for r in days if r["group_id"] == row["id"]}
            cursor = today if today.isoformat() in group_days else today - timedelta(days=1)
            streak = 0
            while cursor.isoformat() in group_days:
                streak += 1
                cursor -= timedelta(days=1)
            weekly = len({r["session_id"] for r in days if r["group_id"] == row["id"] and (today - timedelta(days=6)).isoformat() <= r["day"] <= today.isoformat()})
            result.append({"id": row["id"], "name": row["name"], "createdAt": row["created_at"],
                           "updatedAt": row["updated_at"],
                           "lastPracticedAt": row["last_practiced_at"], "lastProblemId": row["last_problem_id"],
                           "archivedAt": row["archived_at"], "sourceGroupId": row["source_group_id"],
                           "chapterIds": json.loads(row["chapter_ids"]) if row["chapter_ids"] else None,
                           "copiedProgress": bool(row["copied_progress"]),
                           "manualCount": row["manual_count"],
                           "legacyImported": bool(row["legacy_imported"]), "total": row["total"], "completed": row["completed"],
                           "practiceCount": row["practice_count"], "weeklyCount": weekly, "streak": streak})
        return result

    def active_group_id(self):
        with self.connect() as db:
            value = db.execute("SELECT value FROM settings WHERE key='active_group_id'").fetchone()
        return value[0] if value and self.group(value[0]) else DEFAULT_GROUP

    def activate(self, group_id):
        with self.connect() as db:
            db.execute("INSERT INTO settings VALUES('active_group_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (group_id,))

    def create_group(self, name, problem_ids, source_group_id=None, chapter_ids=None, copy_progress=False):
        group_id = uuid.uuid4().hex
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            source = None
            if source_group_id:
                source = db.execute("SELECT * FROM practice_groups WHERE id=?", (source_group_id,)).fetchone()
                if source is None:
                    raise ValueError("来源练习组不存在")
                problem_ids = [row[0] for row in db.execute("SELECT problem_id FROM practice_group_problems WHERE group_id=? ORDER BY position", (source_group_id,))]
                chapter_ids = json.loads(source["chapter_ids"]) if source["chapter_ids"] else None
            db.execute("INSERT INTO practice_groups(id,name,created_at,source_group_id,catalog_initialized,chapter_ids,copied_progress,last_problem_id,updated_at) VALUES(?,?,?,?,1,?,?,?,?)",
                       (group_id, name, self.now(), source_group_id, json.dumps(chapter_ids) if chapter_ids is not None else None,
                        int(copy_progress), source["last_problem_id"] if source and copy_progress and source["last_problem_id"] in problem_ids else None, self.now()))
            db.executemany("INSERT INTO practice_group_problems VALUES(?,?,?)", [(group_id, p, i) for i, p in enumerate(dict.fromkeys(problem_ids))])
            if copy_progress:
                db.execute("""INSERT INTO progress(group_id,problem_id,draft,review,accepted,updated_at,completion_override)
                    SELECT ?,p.problem_id,p.draft,p.review,p.accepted,p.updated_at,p.completion_override FROM progress p
                    JOIN practice_group_problems m ON m.group_id=p.group_id AND m.problem_id=p.problem_id
                    WHERE p.group_id=?""", (group_id, source_group_id))
        return self.group(group_id)

    def update_group(self, group_id, name=None, archived=None, problem_ids=None, chapter_ids=None, expected_updated_at=None, completion_updates=None):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute("SELECT updated_at FROM practice_groups WHERE id=?", (group_id,)).fetchone()
            if expected_updated_at is not None and current["updated_at"] != expected_updated_at:
                raise ValueError("练习组已在别处修改，请重新打开编辑后再保存")
            if name is not None:
                db.execute("UPDATE practice_groups SET name=? WHERE id=?", (name, group_id))
            if archived is not None:
                db.execute("UPDATE practice_groups SET archived_at=? WHERE id=?", (self.now() if archived else None, group_id))
            if problem_ids is not None:
                if not problem_ids:
                    raise ValueError("练习组至少需要一道题")
                db.execute("DELETE FROM practice_group_problems WHERE group_id=?", (group_id,))
                db.executemany("INSERT INTO practice_group_problems VALUES(?,?,?)", [(group_id, p, i) for i, p in enumerate(dict.fromkeys(problem_ids))])
                db.execute("UPDATE practice_groups SET chapter_ids=? WHERE id=?", (json.dumps(chapter_ids) if chapter_ids is not None else None, group_id))
                db.execute("""UPDATE practice_groups SET last_problem_id=NULL WHERE id=? AND last_problem_id NOT IN
                    (SELECT problem_id FROM practice_group_problems WHERE group_id=?)""", (group_id, group_id))
            for problem_id, override in (completion_updates or {}).items():
                old = db.execute("SELECT completion_override FROM progress WHERE group_id=? AND problem_id=?", (group_id, problem_id)).fetchone()
                previous = old[0] if old else None
                if previous == override:
                    continue
                now = self.now()
                db.execute("""INSERT INTO progress(group_id,problem_id,updated_at,completion_override) VALUES(?,?,?,?)
                    ON CONFLICT(group_id,problem_id) DO UPDATE SET completion_override=excluded.completion_override""", (group_id, problem_id, now, override))
                db.execute("INSERT INTO progress_adjustments(group_id,problem_id,old_override,new_override,created_at) VALUES(?,?,?,?,?)", (group_id, problem_id, previous, override, now))
            db.execute("UPDATE practice_groups SET updated_at=? WHERE id=?", (self.now(), group_id))
        return self.group(group_id)

    def state(self, problem_id: str, group_id=DEFAULT_GROUP) -> Dict[str, Any]:
        with self.connect() as db:
            row = db.execute("SELECT * FROM progress WHERE group_id=? AND problem_id=?", (group_id, problem_id)).fetchone()
        return {"draft": row["draft"], "review": bool(row["review"]), "accepted": bool(row["completion_override"] if row["completion_override"] is not None else row["accepted"])} if row else {
            "draft": None, "review": False, "accepted": False,
        }

    def _session(self, db, problem_id, group_id, session_id, active=False):
        now = self.now()
        row = db.execute("SELECT * FROM practice_sessions WHERE id=?", (session_id,)).fetchone()
        if row and (row["group_id"] != group_id or row["problem_id"] != problem_id):
            raise ValueError("练习会话与题目或练习组不匹配")
        db.execute("INSERT OR IGNORE INTO practice_sessions(id,group_id,problem_id,started_at) VALUES(?,?,?,?)", (session_id, group_id, problem_id, now))
        if active:
            db.execute("UPDATE practice_sessions SET first_activity_at=COALESCE(first_activity_at,?),last_active_at=? WHERE id=?", (now, now, session_id))
            day = datetime.fromisoformat(now).astimezone(PRACTICE_ZONE).date().isoformat()
            db.execute("INSERT OR IGNORE INTO practice_days VALUES(?,?,?)", (group_id, day, session_id))
            db.execute("UPDATE practice_groups SET last_practiced_at=? WHERE id=?", (now, group_id))
        return session_id

    def save_draft(self, problem_id: str, code: str, group_id=DEFAULT_GROUP, session_id=None):
        with self.connect() as db:
            if session_id:
                self._session(db, problem_id, group_id, session_id, active=True)
            db.execute("""INSERT INTO progress(group_id,problem_id,draft,updated_at) VALUES(?,?,?,?)
                ON CONFLICT(group_id,problem_id) DO UPDATE SET draft=excluded.draft,updated_at=excluded.updated_at""", (group_id, problem_id, code, self.now()))
            db.execute("UPDATE practice_groups SET last_problem_id=COALESCE(last_problem_id,?) WHERE id=?", (problem_id, group_id))

    def visit(self, problem_id: str, group_id=DEFAULT_GROUP, session_id=None):
        with self.connect() as db:
            if session_id:
                self._session(db, problem_id, group_id, session_id)
            db.execute("UPDATE practice_groups SET last_problem_id=? WHERE id=?", (problem_id, group_id))

    def end_session(self, group_id, session_id):
        with self.connect() as db:
            db.execute("UPDATE practice_sessions SET ended_at=COALESCE(ended_at,?) WHERE id=? AND group_id=?", (self.now(), session_id, group_id))

    def set_review(self, problem_id: str, review: bool, group_id=DEFAULT_GROUP):
        with self.connect() as db:
            db.execute("""INSERT INTO progress(group_id,problem_id,review,updated_at) VALUES(?,?,?,?)
                ON CONFLICT(group_id,problem_id) DO UPDATE SET review=excluded.review""", (group_id, problem_id, review, self.now()))

    def begin_execution(self, problem_id, code, kind, group_id=DEFAULT_GROUP, session_id=None, request_id=None, custom_args=None):
        context = json.dumps(custom_args, sort_keys=True, ensure_ascii=False)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if request_id:
                existing = db.execute("SELECT * FROM submissions WHERE request_id=?", (request_id,)).fetchone()
                if existing:
                    if (existing["problem_id"], existing["code"], existing["kind"], existing["group_id"], existing["request_context"]) != (problem_id, code, kind, group_id, context):
                        raise ValueError("请求标识已用于其他执行")
                    return existing["id"], False
            session_id = self._session(db, problem_id, group_id, session_id or uuid.uuid4().hex, active=True)
            result = {"status": "Running", "passed": 0, "total": 0, "elapsedMs": 0, "results": []}
            cursor = db.execute("""INSERT INTO submissions(group_id,problem_id,code,result,created_at,session_id,kind,request_id,status,request_context)
                VALUES(?,?,?,?,?,?,?,?,?,?)""", (group_id, problem_id, code, json.dumps(result), self.now(), session_id, kind, request_id, "Running", context))
            return cursor.lastrowid, True

    def finish_execution(self, execution_id, result):
        now = self.now()
        with self.connect() as db:
            row = db.execute("SELECT * FROM submissions WHERE id=?", (execution_id,)).fetchone()
            db.execute("UPDATE submissions SET result=?,status=?,finished_at=? WHERE id=?", (json.dumps(result, ensure_ascii=False), result["status"], now, execution_id))
            if row["kind"] == "submit" and result["status"] != "Judge Unavailable":
                db.execute("""INSERT INTO progress(group_id,problem_id,draft,accepted,updated_at) VALUES(?,?,?,?,?)
                    ON CONFLICT(group_id,problem_id) DO UPDATE SET draft=COALESCE(progress.draft,excluded.draft),
                    accepted=MAX(progress.accepted,excluded.accepted),
                    updated_at=CASE WHEN progress.draft IS NULL THEN excluded.updated_at ELSE progress.updated_at END""",
                           (row["group_id"], row["problem_id"], row["code"], result["status"] == "Accepted", now))
                if result["status"] == "Accepted":
                    db.execute("UPDATE progress SET completion_override=NULL WHERE group_id=? AND problem_id=?", (row["group_id"], row["problem_id"]))

    def save_submission(self, problem_id: str, code: str, result: Dict[str, Any], group_id=DEFAULT_GROUP) -> int:
        execution_id, _ = self.begin_execution(problem_id, code, "submit", group_id)
        self.finish_execution(execution_id, result)
        return execution_id

    @staticmethod
    def _execution(row):
        return dict(json.loads(row["result"]), id=row["id"], code=row["code"], createdAt=row["created_at"],
                    finishedAt=row["finished_at"], kind=row["kind"], sessionId=row["session_id"])

    def execution(self, execution_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM submissions WHERE id=?", (execution_id,)).fetchone()
        return self._execution(row)

    def submissions(self, problem_id: str, group_id=DEFAULT_GROUP, include_runs=False):
        with self.connect() as db:
            rows = db.execute("""SELECT * FROM submissions WHERE group_id=? AND problem_id=?
                AND (? OR (kind='submit' AND status NOT IN ('Judge Unavailable','Running')))
                ORDER BY id DESC LIMIT 100""", (group_id, problem_id, include_runs)).fetchall()
        return [self._execution(row) for row in rows]

    def sessions(self, group_id, offset=0):
        with self.connect() as db:
            rows = db.execute("""SELECT s.*,
                (SELECT COUNT(*) FROM submissions e WHERE e.session_id=s.id AND e.kind='run') runs,
                (SELECT COUNT(*) FROM submissions e WHERE e.session_id=s.id AND e.kind='submit') submits
                FROM practice_sessions s WHERE s.group_id=? ORDER BY s.started_at DESC LIMIT 30 OFFSET ?""", (group_id, offset)).fetchall()
            total = db.execute("SELECT COUNT(*) FROM practice_sessions WHERE group_id=?", (group_id,)).fetchone()[0]
        return {"total": total, "sessions": [{"id": r["id"], "problemId": r["problem_id"], "startedAt": r["started_at"],
                "lastActiveAt": r["last_active_at"], "endedAt": r["ended_at"], "active": r["first_activity_at"] is not None,
                "runs": r["runs"], "submits": r["submits"]} for r in rows]}

    def progress(self, group_id=DEFAULT_GROUP):
        with self.connect() as db:
            rows = db.execute("""SELECT p.problem_id,p.review,COALESCE(p.completion_override,p.accepted) AS accepted,
                (SELECT COUNT(*) FROM submissions s WHERE s.group_id=p.group_id AND s.problem_id=p.problem_id AND s.kind='submit' AND s.status NOT IN ('Judge Unavailable','Running')) AS attempts
                FROM progress p WHERE p.group_id=?""", (group_id,)).fetchall()
        return {row["problem_id"]: {"review": bool(row["review"]), "accepted": bool(row["accepted"]), "attempts": row["attempts"]} for row in rows}

    def completion_states(self, group_id):
        with self.connect() as db:
            rows = db.execute("SELECT problem_id,completion_override FROM progress WHERE group_id=? AND completion_override IS NOT NULL", (group_id,)).fetchall()
        return {row["problem_id"]: bool(row["completion_override"]) for row in rows}

    def resume(self, group_id=DEFAULT_GROUP):
        with self.connect() as db:
            row = db.execute("SELECT last_problem_id FROM practice_groups WHERE id=?", (group_id,)).fetchone()
            if row and row[0]:
                return row[0]
            row = db.execute("""SELECT p.problem_id FROM progress p JOIN practice_group_problems m
                ON m.group_id=p.group_id AND m.problem_id=p.problem_id
                WHERE p.group_id=? AND p.draft IS NOT NULL ORDER BY p.updated_at DESC LIMIT 1""", (group_id,)).fetchone()
        return row[0] if row else None
