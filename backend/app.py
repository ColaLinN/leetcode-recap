"""Local learning API and production SPA host."""

import json
import os
from pathlib import Path
from typing import Any, List, Optional
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.database import Store
from backend.judge_client import DockerJudge


ROOT = Path(__file__).resolve().parents[1]
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "testserver"}


class CodeRequest(BaseModel):
    code: str = Field(min_length=1, max_length=100000)


class RunRequest(CodeRequest):
    customArgs: Optional[List[Any]] = None


class ReviewRequest(BaseModel):
    review: bool


class DraftRequest(BaseModel):
    code: str = Field(max_length=100000)


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

    @app.get("/api/health")
    def health():
        return {"ok": True, "judge": judge.availability()}

    @app.get("/api/catalog")
    def get_catalog():
        content = catalog()
        return dict(content, problems=[safe_problem(problem) for problem in content["problems"]], progress=store.progress())

    @app.get("/api/resume")
    def resume():
        return {"problemId": store.resume()}

    @app.get("/api/problems/{problem_id}")
    def get_problem(problem_id: str):
        return dict(safe_problem(problem_by_id(problem_id)), **store.state(problem_id))

    @app.get("/api/problems/{problem_id}/solution")
    def get_solution(problem_id: str):
        problem = problem_by_id(problem_id)
        return {"solution": problem["solution"], "explanation": problem.get("explanation", "")}

    @app.post("/api/problems/{problem_id}/visit")
    def visit_problem(problem_id: str):
        problem_by_id(problem_id)
        store.visit(problem_id)
        return {"ok": True}

    @app.put("/api/problems/{problem_id}/draft")
    def save_draft(problem_id: str, body: DraftRequest):
        problem_by_id(problem_id)
        store.save_draft(problem_id, body.code)
        return {"ok": True}

    @app.put("/api/problems/{problem_id}/review")
    def set_review(problem_id: str, body: ReviewRequest):
        problem_by_id(problem_id)
        store.set_review(problem_id, body.review)
        return {"ok": True, "review": body.review}

    @app.post("/api/problems/{problem_id}/run")
    def run(problem_id: str, body: RunRequest):
        problem = problem_by_id(problem_id)
        tests = problem["examples"]
        if body.customArgs is not None:
            if len(json.dumps(body.customArgs)) > 65536:
                raise HTTPException(422, "自定义输入不得超过 64 KiB")
            tests = [{"args": body.customArgs}]
            reference = judge.execute(problem, problem["solution"], tests, reference=True)
            if reference["status"] != "Accepted":
                if reference["status"] == "Judge Unavailable":
                    return reference
                raise HTTPException(422, "参考解无法处理这组输入，请检查参数数量、类型及题目约束。")
            tests[0]["expected"] = reference["results"][0]["actual"]
        return judge.execute(problem, body.code, tests)

    @app.post("/api/problems/{problem_id}/submit")
    def submit(problem_id: str, body: CodeRequest):
        problem = problem_by_id(problem_id)
        result = judge.execute(problem, body.code, problem["tests"])
        if result["status"] != "Judge Unavailable":
            result["submissionId"] = store.save_submission(problem_id, body.code, result)
        return result

    @app.get("/api/problems/{problem_id}/submissions")
    def get_submissions(problem_id: str):
        problem_by_id(problem_id)
        return {"submissions": store.submissions(problem_id)}

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
