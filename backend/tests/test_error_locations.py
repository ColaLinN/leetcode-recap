from types import SimpleNamespace

from backend.judge import worker


def frame(filename, line, next_frame=None):
    return SimpleNamespace(tb_frame=SimpleNamespace(f_code=SimpleNamespace(co_filename=filename)),
                           tb_lineno=line, tb_next=next_frame)


def test_runtime_location_selects_deepest_user_frame_and_converts_utf8_to_utf16(monkeypatch):
    line = '\ttext = "😀"; value = 1 / 0'
    start = len(line[:line.index("1 / 0")].encode("utf-8"))
    end = len(line.encode("utf-8"))
    summary = SimpleNamespace(colno=start, end_colno=end, end_lineno=3)
    deepest = frame("<submission>", 3, frame("/judge/worker.py", 100))
    tb = frame("/judge/worker.py", 10, frame("<submission>", 1, deepest))
    calls = []

    def extract(selected, limit):
        calls.append((selected, limit))
        return [summary]

    monkeypatch.setattr(worker.traceback, "extract_tb", extract)
    result = worker.runtime_location(tb, ["class Solution:", " def solve(self):", line])
    assert result == {"line": 3, "column": line.index("1 / 0") + 2,
                      "endLine": 3, "endColumn": len(line) + 2}
    assert calls == [(deepest, 1)]


def test_runtime_line_fallback_and_internal_frames_never_become_user_positions(monkeypatch):
    monkeypatch.setattr(worker.traceback, "extract_tb", lambda _tb, limit: [SimpleNamespace()])
    assert worker.runtime_location(frame("<submission>", 2), ["one", "two"]) == {"line": 2}
    assert worker.runtime_location(frame("/judge/worker.py", 2), ["one", "two"]) is None
    assert worker.runtime_location(frame("<submission>", 99), ["one", "two"]) is None
    assert "errorLocation" not in worker.error_details(RuntimeError("adapter error"), "class Solution: pass")


def test_utf16_positions_reject_invalid_byte_boundaries_and_support_multiline(monkeypatch):
    assert worker.utf16_column('"😀"', 2, byte_offset=True) is None
    assert worker.utf16_column('"😀"', 99, byte_offset=True) is None
    assert worker.utf16_column("x", -1) is None
    monkeypatch.setattr(worker.traceback, "extract_tb", lambda _tb, limit: [
        SimpleNamespace(colno=0, end_lineno=2, end_colno=len('"😀"'.encode("utf-8")))])
    assert worker.runtime_location(frame("<submission>", 1), ["calculate(", '"😀"']) == {
        "line": 1, "column": 1, "endLine": 2, "endColumn": 5,
    }


def test_syntax_error_ascii_ranges_context_and_foreign_filenames():
    error = SyntaxError("invalid syntax", ("<submission>", 2, 5, "    broken"))
    error.end_lineno, error.end_offset = 2, 11
    result = worker.error_details(error, "class Solution:\r\n    broken")
    assert result["errorLocation"] == {"line": 2, "column": 5, "endLine": 2, "endColumn": 11}
    assert "SyntaxError: invalid syntax" in result["error"]
    assert "用户代码第 2 行：\n   2 |     broken" in result["error"]
    assert worker.syntax_location(SyntaxError("bad", ("<string>", 1, 1, "x")), ["x"]) is None


def test_unicode_syntax_offsets_do_not_claim_ambiguous_columns_or_shift_lines():
    code = 'text = "a\u2028b"\nclass Solution:\n    text = "😀"; return 1'
    error = SyntaxError("return outside function", ("<submission>", 3, 17, code.split("\n")[2]))
    error.end_lineno, error.end_offset = 3, 25
    result = worker.error_details(error, code)
    assert result["errorLocation"] == {"line": 3, "endLine": 3}
    assert '3 |     text = "😀"; return 1' in result["error"]
