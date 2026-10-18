"""Static Python editor assistance; submitted source is never executed or saved."""

import io
import logging
from pathlib import Path
import sysconfig
from threading import Lock
import tokenize

import jedi
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


router = APIRouter(prefix="/api/editor", tags=["editor"])
logger = logging.getLogger(__name__)

# These are the names supplied by judge/worker.py, represented only as source
# for inference. This text is never inserted into the user's editor or draft.
PRELUDE = """from typing import List, Optional, Tuple, Dict, Set, Any, Deque
import collections, heapq, bisect, math, random, functools, itertools
from collections import deque, defaultdict, Counter, OrderedDict
from heapq import heappush, heappop
from bisect import bisect_left, bisect_right
from math import inf
from functools import lru_cache, cache
from itertools import accumulate

class ListNode:
    def __init__(self, val: int = 0, next: Optional['ListNode'] = None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val: int = 0, left: Optional['TreeNode'] = None, right: Optional['TreeNode'] = None):
        self.val = val
        self.left = left
        self.right = right

"""
PRELUDE_LINES = PRELUDE.count("\n")

# Keep imports limited to the interpreter's standard library. In particular,
# don't discover project sys.path files or dynamically import submitted modules.
jedi.settings.auto_import_modules = []
_stdlib = sysconfig.get_path("stdlib")
_project = jedi.Project(
    path=_stdlib,
    sys_path=[_stdlib, sysconfig.get_config_var("DESTSHARED") or _stdlib],
    smart_sys_path=False,
    load_unsafe_extensions=False,
)
_editor_path = Path(_stdlib) / "__recap_editor__.py"
# Jedi/Parso share mutable inference caches across Scripts. FastAPI runs sync
# routes in threads, so the entire inference and response conversion is locked.
_analysis_lock = Lock()


class EditorRequest(BaseModel):
    code: str = Field(max_length=100000)
    line: int = Field(ge=1, le=100001, strict=True)
    column: int = Field(ge=1, le=200001, strict=True)


def utf16_length(text):
    return len(text.encode("utf-16-le")) // 2


def source_position(body):
    """Convert Monaco's 1-based UTF-16 column to Jedi's code-point column."""
    lines = body.code.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if body.line > len(lines):
        raise HTTPException(422, "光标行超出代码范围")
    line = lines[body.line - 1]
    units = body.column - 1
    column = 0
    try:
        while units > 0 and column < len(line):
            units -= utf16_length(line[column])
            column += 1
    except UnicodeEncodeError:
        raise HTTPException(422, "无效的代码字符")
    if units != 0:
        raise HTTPException(422, "光标列超出代码范围或位于字符内部")
    return "\n".join(lines), line, column


def _suggestions(script, line_number, line, column):
    completions = script.complete(line_number, column)
    # Put identifiers defined by the learner before imported names and builtins.
    completions.sort(key=lambda item: (
        not (item.module_path == _editor_path and (item.line or 0) > PRELUDE_LINES),
        item.name.startswith("_"), item.name.lower(),
    ))
    end = column
    while end < len(line) and ("a" + line[end]).isidentifier():
        end += 1
    suggestions = []
    for item in completions:
        if item.type == "path":
            continue
        start = max(0, column - item.get_completion_prefix_length())
        insert_text = item.name_with_symbols
        if insert_text.endswith("=") and line[end:].lstrip().startswith("="):
            insert_text = insert_text[:-1]
        suggestions.append({
            "label": item.name_with_symbols,
            "insertText": insert_text,
            "type": item.type,
            "detail": item.description[:500],
            "startColumn": utf16_length(line[:start]) + 1,
            "endColumn": utf16_length(line[:end]) + 1,
        })
        if len(suggestions) == 100:
            break
    return {"suggestions": suggestions}


def _signatures(script, line_number, _line, column):
    signatures = []
    for item in script.get_signatures(line_number, column)[:10]:
        parameters = [{"label": param.to_string()} for param in item.params]
        signatures.append({
            "label": item.to_string(),
            "parameters": parameters,
            "activeParameter": min(item.index or 0, max(0, len(parameters) - 1)),
        })
    return {"signatures": signatures, "activeSignature": 0,
            "activeParameter": signatures[0]["activeParameter"] if signatures else 0}


def in_comment_or_string(source, line, column):
    position = (line, column)
    try:
        for token in tokenize.generate_tokens(io.StringIO(source).readline):
            if token.start > position:
                break
            if token.type == tokenize.COMMENT and token.start <= position <= token.end:
                return True
            if token.type == tokenize.STRING and token.start < position < token.end:
                return True
            if token.type == tokenize.ERRORTOKEN and token.string in ("'", '"') and token.start[0] == line:
                return True
    except tokenize.TokenError as error:
        if "multi-line string" in error.args[0] and error.args[1] <= position:
            return True
    except (IndentationError, SyntaxError):
        pass
    return False


def analyze(body, operation):
    source, line, column = source_position(body)
    if operation is _suggestions and in_comment_or_string(source, body.line, column):
        return {"suggestions": []}
    try:
        with _analysis_lock:
            script = jedi.Script(PRELUDE + source, path=_editor_path, project=_project)
            return operation(script, body.line + PRELUDE_LINES, line, column)
    except Exception:
        # Incomplete source is normal while typing. If inference itself fails,
        # the editor can still offer words from the current document.
        logger.debug("Python editor inference failed", exc_info=True)
        raise HTTPException(503, "代码提示暂时不可用")


@router.post("/completions")
def complete(body: EditorRequest):
    return analyze(body, _suggestions)


@router.post("/signatures")
def signatures(body: EditorRequest):
    return analyze(body, _signatures)
