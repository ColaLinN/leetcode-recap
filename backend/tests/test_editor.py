from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from backend.app import create_app
from backend.database import Store
from backend.editor import router, utf16_length


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def request(client, code, *, column=None, line=None, endpoint="completions"):
    line = line or code.count("\n") + 1
    column = column or utf16_length(code.split("\n")[line - 1].rstrip("\r")) + 1
    response = client.post("/api/editor/" + endpoint, json={"code": code, "line": line, "column": column})
    assert response.status_code == 200, response.text
    return response.json()


def names(result):
    return {item["label"] for item in result["suggestions"]}


def test_local_parameters_members_and_builtins(client):
    code = "class Solution:\n    def solve(self, numbers: List[int]):\n        count = len(numbers)\n        cou"
    result = request(client, code)
    assert result["suggestions"][0]["label"] == "count"
    assert "append" in names(request(client, code.rsplit("cou", 1)[0] + "numbers.ap"))
    assert "len" in names(request(client, "le"))
    assert "numbers" in names(request(client, code.rsplit("cou", 1)[0] + "num"))
    other_scope = "def first():\n    secret_local = 1\ndef second():\n    secret_"
    assert "secret_local" not in names(request(client, other_scope))
    self_method = "class Solution:\n    def helper(self):\n        pass\n    def solve(self):\n        self.he"
    assert "helper" in names(request(client, self_method))


def test_implicit_judge_imports_and_node_types(client):
    assert {"append", "appendleft"} <= names(request(client, "deque().ap"))
    assert "heappush" in names(request(client, "heapq.heappu"))
    assert "next" in names(request(client, "def solve(head: Optional[ListNode]):\n    head.ne"))
    assert "left" in names(request(client, "def solve(root: Optional[TreeNode]):\n    root.le"))
    assert "append" in names(request(client, "from __future__ import annotations\ndef solve(nums: List[int]):\n    nums.ap"))


def test_midword_completion_replaces_suffix_with_utf16_columns(client):
    line = "标签 = '😀'; 数字 = []; 数字.append"
    prefix = line.rsplit("append", 1)[0]
    column = utf16_length(prefix + "ap") + 1
    item = next(item for item in request(client, line, column=column)["suggestions"] if item["label"] == "append")
    assert item["startColumn"] == utf16_length(prefix) + 1
    assert item["endColumn"] == utf16_length(line) + 1
    encoded = line.encode("utf-16-le")
    replaced = (encoded[:(item["startColumn"] - 1) * 2] + item["insertText"].encode("utf-16-le")
                + encoded[(item["endColumn"] - 1) * 2:]).decode("utf-16-le")
    assert replaced == line
    keyword = "def merge(left, right=0):\n    pass\nmerge(right=1)"
    item = next(item for item in request(client, keyword, column=9)["suggestions"] if item["label"] == "right=")
    assert item["insertText"] == "right"
    assert item["startColumn"] == 7 and item["endColumn"] == 12


def test_crlf_trailing_line_and_incomplete_source(client):
    assert "append" in names(request(client, "nums = []\r\nnums.ap"))
    assert "nums" in names(request(client, "nums=[]\n"))
    assert "numbers" in names(request(client, "def solve(numbers):\n    if (\n        num"))
    assert request(client, "count=1\n# cou")["suggestions"] == []
    assert request(client, 'count=1\n"cou"', column=5)["suggestions"] == []


def test_function_signatures_and_active_parameter(client):
    code = "def merge(left: int, right: int = 1):\n    pass\nmerge(1, "
    result = request(client, code, endpoint="signatures")
    assert result["activeParameter"] == 1
    assert result["signatures"][0]["activeParameter"] == 1
    assert result["signatures"][0]["label"] == "merge(left: int, right: int=1)"
    assert [param["label"] for param in result["signatures"][0]["parameters"]] == ["left: int", "right: int=1"]
    assert request(client, "len(", endpoint="signatures")["signatures"][0]["label"].startswith("len(")
    assert request(client, "len([])", endpoint="signatures")["signatures"] == []


@pytest.mark.parametrize("body", [
    {"code": "x", "line": 0, "column": 1},
    {"code": "x", "line": 2, "column": 1},
    {"code": "x", "line": 1, "column": 3},
    {"code": "😀", "line": 1, "column": 2},
    {"code": "x" * 100001, "line": 1, "column": 1},
])
def test_invalid_positions_and_oversized_source_are_rejected(client, body):
    assert client.post("/api/editor/completions", json=body).status_code == 422


def test_editor_analysis_never_executes_source_or_changes_progress(tmp_path):
    class NoJudge:
        def execute(self, *_args, **_kwargs):
            raise AssertionError("editor analysis called the judge")

    data = tmp_path / "data"
    database = tmp_path / "progress.sqlite3"
    client = TestClient(create_app(data_dir=data, database_path=database, judge=NoJudge()))
    store = Store(database)
    store.save_draft("example", "original draft")
    store.visit("example")
    before = store.state("example")
    marker = tmp_path / "executed.txt"
    code = ("from pathlib import Path\n"
            f"Path({str(marker)!r}).write_text('executed')\n"
            "def values():\n"
            f"    Path({str(marker)!r}).write_text('executed')\n"
            "    return []\n"
            "values().ap")
    assert "append" in names(request(client, code))
    assert request(client, code + "pend(", endpoint="signatures")["signatures"]
    assert not Path(marker).exists()
    assert store.state("example") == before
    assert store.resume() == "example"
    assert store.submissions("example") == []
