"""Local learning API and production SPA host."""

import json
import os
from pathlib import Path
from typing import Any, List, Optional
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.database import Store, DEFAULT_GROUP
from backend.editor import router as editor_router
from backend.judge_client import DockerJudge


ROOT = Path(__file__).resolve().parents[1]
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "testserver"}


class CodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=100000)
    sessionId: Optional[str] = Field(default=None, pattern=r"^[a-zA-Z0-9_-]{1,80}$")
    requestId: Optional[str] = Field(default=None, pattern=r"^[a-zA-Z0-9_-]{1,80}$")


class RunRequest(CodeRequest):
    customArgs: Optional[List[Any]] = None


class ReviewRequest(BaseModel):
    review: bool


class DraftRequest(BaseModel):
    code: str = Field(max_length=100000)
    sessionId: Optional[str] = Field(default=None, pattern=r"^[a-zA-Z0-9_-]{1,80}$")


class VisitRequest(BaseModel):
    sessionId: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,80}$")


class GroupRequest(BaseModel):
    name: str = Field(default="", max_length=80)
    chapterIds: Optional[List[str]] = Field(default=None, max_length=100)
    restartFrom: Optional[str] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    archived: Optional[bool] = None


def safe_problem(problem):
    return dict({key: value for key, value in problem.items() if key not in ("solution", "tests", "explanation")}, testCount=len(problem.get("tests", [])))


def create_app(data_dir=None, database_path=None, judge=None, frontend_dir=None):
    data_dir = Path(data_dir or os.environ.get("RECAP_DATA_DIR", str(ROOT / "data")))
    database_path = Path(database_path or os.environ.get("RECAP_DB_PATH", str(ROOT / "runtime" / "recap.sqlite3")))
    frontend_dir = Path(frontend_dir or ROOT / "frontend" / "dist")
    store = Store(database_path)
    judge = judge or DockerJudge()
    app = FastAPI(title="LeetCode Recap", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.state.store, app.state.judge = store, judge
    app.include_router(editor_router)

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        try:
            host = urlsplit("http://" + request.headers.get("host", "")).hostname
        except ValueError:
            return JSONResponse({"detail": "无效的本机地址。"}, status_code=403)
        if host not in LOCAL_HOSTS:
            return JSONResponse({"detail": "此服务仅支持本机访问。"}, status_code=403)
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            if origin:
                try:
                    parsed = urlsplit(origin)
                except ValueError:
                    return JSONResponse({"detail": "无效的请求来源。"}, status_code=403)
                if parsed.hostname not in LOCAL_HOSTS - {"testserver"} or parsed.scheme not in ("http", "https"):
                    return JSONResponse({"detail": "拒绝来自其他网站的修改请求。"}, status_code=403)
        return await call_next(request)

    def catalog():
        path = data_dir / "catalog.json"
        if not path.is_file():
            raise HTTPException(503, "题库尚未生成，请先运行 ./scripts/setup.sh。")
        return json.loads(path.read_text(encoding="utf-8"))

    def problem_by_id(problem_id):
        problem = next((problem for problem in catalog()["problems"] if str(problem["id"]) == problem_id), None)
        if problem is None:
            raise HTTPException(404, "题目不存在")
        return problem

    if (data_dir / "catalog.json").is_file():
        store.configure_catalog([str(p["id"]) for p in catalog()["problems"]])

    def practice_group(group_id):
        group = store.group(group_id)
        if group is None:
            raise HTTPException(404, "练习组不存在")
        return group

    def scoped_problem(problem_id, group_id):
        practice_group(group_id)
        problem = problem_by_id(problem_id)
        if problem_id not in store.problem_ids(group_id):
            raise HTTPException(404, "此题不在当前练习组中，请切换练习组")
        return problem

    @app.exception_handler(ValueError)
    async def invalid_practice(request: Request, error: ValueError):
        return JSONResponse({"detail": str(error)}, status_code=409)

    @app.get("/api/practice-groups")
    def get_groups():
        return {"groups": store.groups(), "activeGroupId": store.active_group_id(), "timeZone": "Asia/Singapore"}

    @app.post("/api/practice-groups")
    def create_group(body: GroupRequest):
        content = catalog()
        if body.restartFrom:
            source = practice_group(body.restartFrom)
            ids = store.problem_ids(body.restartFrom)
            chapter_ids = source["chapterIds"]
        elif body.chapterIds is None:
            ids = [str(p["id"]) for p in content["problems"]]
            chapter_ids = None
        else:
            chapters = {c["id"]: c for c in content["chapters"]}
            if not body.chapterIds or any(c not in chapters for c in body.chapterIds):
                raise HTTPException(422, "请选择有效章节")
            ids = list(dict.fromkeys(p for c in body.chapterIds for p in chapters[c]["problemIds"]))
            chapter_ids = list(dict.fromkeys(body.chapterIds))
        if not ids:
            raise HTTPException(422, "练习组至少需要一道题")
        name = body.name.strip() or f"第 {len(store.groups()) + 1} 轮复习"
        return store.create_group(name, ids, body.restartFrom, chapter_ids)

    @app.patch("/api/practice-groups/{group_id}")
    def update_group(group_id: str, body: GroupUpdate):
        practice_group(group_id)
        if body.name is not None and not body.name.strip():
            raise HTTPException(422, "练习组名称不能为空")
        return store.update_group(group_id, body.name.strip() if body.name else None, body.archived)

    @app.post("/api/practice-groups/{group_id}/activate")
    def activate_group(group_id: str):
        practice_group(group_id)
        store.activate(group_id)
        return {"ok": True}

    @app.get("/api/practice-groups/{group_id}/sessions")
    def practice_sessions(group_id: str, offset: int = Query(default=0, ge=0)):
        practice_group(group_id)
        result = store.sessions(group_id, offset)
        titles = {str(p["id"]): p["title"] for p in catalog()["problems"]}
        for session in result["sessions"]:
            session["problemTitle"] = titles.get(session["problemId"], session["problemId"])
        return result

    @app.post("/api/practice-groups/{group_id}/sessions/{session_id}/end")
    def end_session(group_id: str, session_id: str):
        practice_group(group_id)
        store.end_session(group_id, session_id)
        return {"ok": True}

    @app.get("/api/health")
    def health():
        return {"ok": True, "judge": judge.availability()}

    @app.get("/api/catalog")
    def get_catalog(group_id: str = DEFAULT_GROUP):
        content = catalog()
        group = practice_group(group_id)
        ids = set(store.problem_ids(group_id))
        chapters = [dict(c, problemIds=[p for p in c["problemIds"] if p in ids]) for c in content["chapters"]
                    if group["chapterIds"] is None or c["id"] in group["chapterIds"]]
        return dict(content, chapters=[c for c in chapters if c["problemIds"]], allChapters=content["chapters"],
                    problems=[safe_problem(p) for p in content["problems"] if str(p["id"]) in ids],
                    progress={p: v for p, v in store.progress(group_id).items() if p in ids}, practiceGroup=group)

    @app.get("/api/resume")
    def resume(group_id: str = DEFAULT_GROUP):
        practice_group(group_id)
        return {"problemId": store.resume(group_id)}

    @app.get("/api/problems/{problem_id}")
    def get_problem(problem_id: str, group_id: str = DEFAULT_GROUP):
        return dict(safe_problem(scoped_problem(problem_id, group_id)), **store.state(problem_id, group_id))

    @app.get("/api/problems/{problem_id}/solution")
    def get_solution(problem_id: str):
        problem = problem_by_id(problem_id)
        return {"solution": problem["solution"], "explanation": problem.get("explanation", "")}

    @app.post("/api/problems/{problem_id}/visit")
    def visit_problem(problem_id: str, body: Optional[VisitRequest] = None, group_id: str = DEFAULT_GROUP):
        scoped_problem(problem_id, group_id)
        store.visit(problem_id, group_id, body.sessionId if body else None)
        return {"ok": True}

    @app.put("/api/problems/{problem_id}/draft")
    def save_draft(problem_id: str, body: DraftRequest, group_id: str = DEFAULT_GROUP):
        scoped_problem(problem_id, group_id)
        store.save_draft(problem_id, body.code, group_id, body.sessionId)
        return {"ok": True}

    @app.put("/api/problems/{problem_id}/review")
    def set_review(problem_id: str, body: ReviewRequest, group_id: str = DEFAULT_GROUP):
        scoped_problem(problem_id, group_id)
        store.set_review(problem_id, body.review, group_id)
        return {"ok": True, "review": body.review}

    @app.post("/api/problems/{problem_id}/run")
    def run(problem_id: str, body: RunRequest, group_id: str = DEFAULT_GROUP):
        problem = scoped_problem(problem_id, group_id)
        return execute(problem_id, body, problem, problem["examples"], "run", group_id)

    def execute(problem_id, body, problem, tests, kind, group_id):
        custom_args = body.customArgs if isinstance(body, RunRequest) else None
        if custom_args is not None and len(json.dumps(custom_args)) > 65536:
            raise HTTPException(422, "自定义输入不得超过 64 KiB")
        execution_id, created = store.begin_execution(problem_id, body.code, kind, group_id, body.sessionId, body.requestId, custom_args)
        if created:
            if custom_args is not None:
                tests = [{"args": custom_args}]
                reference = judge.execute(problem, problem["solution"], tests, reference=True)
                if reference["status"] != "Accepted":
                    if reference["status"] == "Judge Unavailable":
                        store.finish_execution(execution_id, reference)
                        return store.execution(execution_id)
                    store.finish_execution(execution_id, dict(reference, status="Invalid Input"))
                    raise HTTPException(422, "参考解无法处理这组输入，请检查参数数量、类型及题目约束。")
                tests[0]["expected"] = reference["results"][0]["actual"]
            result = judge.execute(problem, body.code, tests)
            store.finish_execution(execution_id, result)
        result = store.execution(execution_id)
        result["executionId"] = execution_id
        if kind == "submit" and result["status"] not in ("Judge Unavailable", "Running"):
            result["submissionId"] = execution_id
        return result

    @app.post("/api/problems/{problem_id}/submit")
    def submit(problem_id: str, body: CodeRequest, group_id: str = DEFAULT_GROUP):
        problem = scoped_problem(problem_id, group_id)
        return execute(problem_id, body, problem, problem["tests"], "submit", group_id)

    @app.get("/api/problems/{problem_id}/submissions")
    def get_submissions(problem_id: str, group_id: str = DEFAULT_GROUP, include_runs: bool = False):
        scoped_problem(problem_id, group_id)
        return {"submissions": store.submissions(problem_id, group_id, include_runs)}

    (data_dir / "content").mkdir(parents=True, exist_ok=True)
    app.mount("/content", StaticFiles(directory=str(data_dir / "content")), name="content")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(404, "API 不存在")
        target = (frontend_dir / path).resolve()
        if target.is_relative_to(frontend_dir.resolve()) and target.is_file():
            return FileResponse(target)
        index = frontend_dir / "index.html"
        if index.is_file():
            return FileResponse(index)
        raise HTTPException(503, "前端尚未构建，请运行 ./scripts/setup.sh。")

    return app


app = create_app()
