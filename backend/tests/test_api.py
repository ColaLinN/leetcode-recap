import json

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.database import Store


class FakeJudge:
    def __init__(self):
        self.calls = []
        self.status = "Accepted"

    def availability(self):
        return {"available": True, "detail": "test judge"}

    def execute(self, problem, code, tests, reference=False):
        self.calls.append((problem, code, tests, reference))
        return {"status": self.status, "passed": len(tests) if self.status == "Accepted" else 0,
                "total": len(tests), "elapsedMs": 2.5,
                "results": [{"index": index, "status": self.status, "input": case["args"],
                             "actual": sum(case["args"][0]), "expected": case.get("expected"),
                             "stdout": "", "error": "", "elapsedMs": 0.1} for index, case in enumerate(tests)]}


@pytest.fixture
def fixture(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    (data / "content").mkdir()
    (data / "content" / "note.md").write_text("# Hello", encoding="utf-8")
    problem = {"id": "sum", "number": 1, "title": "求和", "method": "solve", "kind": "solution",
               "starter": "class Solution: pass", "solution": "REFERENCE_SECRET", "explanation": "EXPLANATION_SECRET",
               "statement": "sum", "examples": [{"args": [[1, 2]], "expected": 3}],
               "tests": [{"args": [[7, 8]], "expected": 15}]}
    (data / "catalog.json").write_text(json.dumps({"chapters": [], "notes": [], "problems": [problem]}), encoding="utf-8")
    frontend = tmp_path / "frontend"
    frontend.mkdir()
    (frontend / "index.html").write_text("<h1>Recap</h1>")
    judge = FakeJudge()
    options = dict(data_dir=data, database_path=tmp_path / "state.sqlite3", frontend_dir=frontend, judge=judge)
    return TestClient(create_app(**options)), judge, options


def test_no_hidden_solutions_or_test_cases(fixture):
    client, _, _ = fixture
    for path in ("/api/catalog", "/api/problems/sum"):
        response = client.get(path)
        assert response.status_code == 200
        assert "REFERENCE_SECRET" not in response.text
        assert "EXPLANATION_SECRET" not in response.text
        assert '"tests"' not in response.text
    assert client.get("/api/problems/sum").json()["testCount"] == 1
    assert client.get("/api/problems/sum/solution").json() == {"solution": "REFERENCE_SECRET", "explanation": "EXPLANATION_SECRET"}


def test_drafts_flags_resume_and_progress_survive_restart(fixture):
    client, judge, options = fixture
    assert client.get("/api/resume").json() == {"problemId": None}
    assert client.post("/api/problems/sum/visit").status_code == 200
    assert client.get("/api/resume").json() == {"problemId": "sum"}
    assert client.get("/api/problems/sum").json()["draft"] is None
    assert client.put("/api/problems/sum/draft", json={"code": "my code"}).status_code == 200
    assert client.put("/api/problems/sum/review", json={"review": True}).status_code == 200
    assert client.get("/api/resume").json() == {"problemId": "sum"}
    first = client.post("/api/problems/sum/submit", json={"code": "correct"}).json()
    assert first["submissionId"] > 0
    judge.status = "Wrong Answer"
    client.post("/api/problems/sum/submit", json={"code": "wrong"})
    client = TestClient(create_app(**options))
    state = client.get("/api/problems/sum").json()
    assert state["accepted"] is True
    assert state["review"] is True
    # Saving a finished submission must not overwrite a newer editor draft.
    assert state["draft"] == "my code"
    assert client.get("/api/catalog").json()["progress"]["sum"] == {"accepted": True, "review": True, "attempts": 2}
    submissions = client.get("/api/problems/sum/submissions").json()["submissions"]
    assert [row["code"] for row in submissions] == ["wrong", "correct"]
    assert submissions[0]["createdAt"].endswith("+00:00")


def test_custom_args_reference_and_run_do_not_create_submission(fixture):
    client, judge, _ = fixture
    response = client.post("/api/problems/sum/run", json={"code": "user", "customArgs": [[5, 6]]})
    assert response.status_code == 200
    assert len(judge.calls) == 2
    assert judge.calls[0][1] == "REFERENCE_SECRET" and judge.calls[0][3] is True
    assert judge.calls[1][1] == "user" and judge.calls[1][2] == [{"args": [[5, 6]], "expected": 11}]
    assert client.get("/api/problems/sum/submissions").json()["submissions"] == []
    judge.status = "Runtime Error"
    assert client.post("/api/problems/sum/run", json={"code": "user", "customArgs": [[]]}).status_code == 422


def test_unavailable_judge_is_not_a_failed_attempt(fixture):
    client, judge, _ = fixture
    judge.status = "Judge Unavailable"
    response = client.post("/api/problems/sum/submit", json={"code": "user"}).json()
    assert response["status"] == "Judge Unavailable"
    assert "submissionId" not in response
    assert client.get("/api/problems/sum/submissions").json()["submissions"] == []


def test_delayed_save_and_submission_preserve_newer_draft_and_visited_problem(tmp_path):
    store = Store(tmp_path / "progress.sqlite3")
    store.save_draft("first", "before submit")
    store.visit("second")
    store.save_draft("first", "new edit while submit was running")
    store.save_submission("first", "before submit", {"status": "Accepted", "passed": 1, "total": 1})
    assert store.resume() == "second"
    assert store.state("first")["draft"] == "new edit while submit was running"
    assert store.state("first")["accepted"] is True


def test_local_origin_guard_unknown_api_and_spa(fixture):
    client, _, _ = fixture
    assert client.post("/api/problems/sum/run", headers={"Origin": "https://evil.example"}, json={"code": "x"}).status_code == 403
    assert client.put("/api/problems/sum/draft", headers={"Origin": "null"}, json={"code": "x"}).status_code == 403
    assert client.get("/api/catalog", headers={"Host": "rebind.evil"}).status_code == 403
    assert client.put("/api/problems/sum/draft", headers={"Origin": "http://localhost:5173"}, json={"code": ""}).status_code == 200
    assert client.get("/api/unknown").status_code == 404
    assert client.get("/chapters/one").text == "<h1>Recap</h1>"
    assert client.get("/content/note.md").text == "# Hello"
    assert client.get("/api/problems/missing").status_code == 404
    assert client.post("/api/problems/sum/submit", json={"code": "x" * 100001}).status_code == 422
