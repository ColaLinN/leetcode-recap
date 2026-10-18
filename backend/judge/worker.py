"""One test case. Only executed inside the constrained Docker container."""

import bisect
import collections
import contextlib
import functools
import heapq
import io
import itertools
import json
import math
import random
import resource
import sys
import time
import traceback
import typing


SUBMISSION_FILENAME = "<submission>"


class OutputLimitExceeded(Exception):
    pass


class BoundedOutput(io.StringIO):
    def write(self, value):
        if self.tell() + len(value) > 32768:
            raise OutputLimitExceeded("输出超过 32 KiB 限制")
        return super().write(value)


class ListNode:
    def __init__(self, val=0, next=None):
        self.val, self.next = val, next


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right


def list_node(values, pos=-1):
    nodes = [ListNode(value) for value in values]
    for left, right in zip(nodes, nodes[1:]):
        left.next = right
    if nodes and 0 <= pos < len(nodes):
        nodes[-1].next = nodes[pos]
    return nodes[0] if nodes else None


def tree_node(values):
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = collections.deque([root])
    index = 1
    while queue and index < len(values):
        parent = queue.popleft()
        for side in ("left", "right"):
            if index == len(values):
                break
            value = values[index]
            index += 1
            if value is not None:
                node = TreeNode(value)
                setattr(parent, side, node)
                queue.append(node)
    return root


def decode(value, kind):
    if kind == "listnode":
        return list_node(value)
    if kind == "cyclelist":
        return list_node(value["values"], value["pos"])
    if kind == "tree":
        return tree_node(value)
    return value


def encode(value, kind):
    if kind == "listnode" or kind == "cyclelist":
        result, visited = [], set()
        while value is not None:
            if id(value) in visited:
                raise ValueError("返回链表中存在环，无法转换为数组")
            visited.add(id(value))
            result.append(value.val)
            value = value.next
            if len(result) > 10000:
                raise OutputLimitExceeded("返回链表超过 10000 个节点")
        return result
    if kind == "tree":
        result, queue, visited = [], collections.deque([value]), set()
        while queue:
            node = queue.popleft()
            if node is None:
                result.append(None)
            else:
                if id(node) in visited:
                    raise ValueError("返回树中存在循环引用")
                visited.add(id(node))
                result.append(node.val)
                queue.extend([node.left, node.right])
            if len(result) > 20001:
                raise OutputLimitExceeded("返回树超过 10000 个节点")
        while result and result[-1] is None:
            result.pop()
        return result
    return value


def execute(payload):
    problem = payload["problem"]
    namespace = {
        "__name__": "__submission__", "ListNode": ListNode, "TreeNode": TreeNode,
        "collections": collections, "deque": collections.deque, "defaultdict": collections.defaultdict,
        "Counter": collections.Counter, "OrderedDict": collections.OrderedDict,
        "heapq": heapq, "heappush": heapq.heappush, "heappop": heapq.heappop,
        "bisect": bisect, "bisect_left": bisect.bisect_left, "bisect_right": bisect.bisect_right,
        "math": math, "inf": math.inf, "random": random,
        "functools": functools, "lru_cache": functools.lru_cache, "cache": functools.cache,
        "itertools": itertools, "accumulate": itertools.accumulate,
    }
    namespace.update({name: getattr(typing, name) for name in ("List", "Optional", "Tuple", "Dict", "Set", "Any", "Deque")})
    # Compile the original text directly: editor and Python line numbers agree.
    exec(compile(payload["code"], SUBMISSION_FILENAME, "exec"), namespace)
    if problem.get("kind") == "design":
        operations, arguments = payload["args"]
        constructor = namespace[problem["className"]]
        instance = constructor(*arguments[0])
        result = [None]
        for operation, args in zip(operations[1:], arguments[1:]):
            if operation.startswith("_"):
                raise ValueError("不支持调用私有方法")
            result.append(getattr(instance, operation)(*args))
        return result
    kinds = problem.get("argTypes", [])
    args = [decode(value, kinds[index] if index < len(kinds) else "raw") for index, value in enumerate(payload["args"])]
    result = getattr(namespace[problem.get("className", "Solution")](), problem["method"])(*args)
    if problem.get("mutates") is not None:
        index = problem["mutates"]
        return encode(args[index], kinds[index] if index < len(kinds) else "raw")
    return encode(result, problem.get("returnType", "raw"))


def utf16_column(line, offset, *, byte_offset=False):
    """Convert a 0-based Python position to a 1-based Monaco column."""
    if not isinstance(offset, int) or offset < 0:
        return None
    if byte_offset:
        encoded = line.encode("utf-8")
        if offset > len(encoded):
            return None
        try:
            prefix = encoded[:offset].decode("utf-8")
        except UnicodeDecodeError:
            return None
    else:
        if offset > len(line):
            return None
        prefix = line[:offset]
    return len(prefix.encode("utf-16-le")) // 2 + 1


def runtime_location(tb, lines):
    """Select the deepest real submission frame, excluding judge adapters."""
    selected = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == SUBMISSION_FILENAME and 1 <= tb.tb_lineno <= len(lines):
            selected = tb
        tb = tb.tb_next
    if selected is None:
        return None
    location = {"line": selected.tb_lineno}
    # An explicit limit also avoids a submission's sys.tracebacklimit hiding the
    # frame. Python <3.11 has no column metadata, so a line alone is sufficient.
    frame = traceback.extract_tb(selected, limit=1)[0]
    column = utf16_column(lines[location["line"] - 1], getattr(frame, "colno", None), byte_offset=True)
    if column is not None:
        location["column"] = column
    end_line = getattr(frame, "end_lineno", None)
    if isinstance(end_line, int) and location["line"] <= end_line <= len(lines):
        end_column = utf16_column(lines[end_line - 1], getattr(frame, "end_colno", None), byte_offset=True)
        if end_column is not None:
            location.update(endLine=end_line, endColumn=end_column)
    return location


def syntax_location(error, lines):
    if error.filename != SUBMISSION_FILENAME or not isinstance(error.lineno, int) or not 1 <= error.lineno <= len(lines):
        return None
    location = {"line": error.lineno}
    end_line = getattr(error, "end_lineno", None)
    if isinstance(end_line, int) and error.lineno <= end_line <= len(lines):
        location["endLine"] = end_line
    # CPython's parser and compiler report SyntaxError offsets in different
    # units for non-ASCII source. ASCII is unambiguous; otherwise mark the exact
    # line without claiming a column that could point at the wrong character.
    if lines[error.lineno - 1].isascii() and isinstance(error.offset, int):
        column = utf16_column(lines[error.lineno - 1], error.offset - 1)
        if column is not None:
            location["column"] = column
    end_offset = getattr(error, "end_offset", None)
    if "endLine" in location and lines[end_line - 1].isascii() and isinstance(end_offset, int):
        end_column = utf16_column(lines[end_line - 1], end_offset - 1)
        if end_column is not None:
            location["endColumn"] = end_column
    return location


def error_details(error, code, *, include_traceback=True):
    lines = code.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    location = runtime_location(error.__traceback__, lines)
    if location is None and isinstance(error, SyntaxError):
        location = syntax_location(error, lines)
    if include_traceback:
        text = "".join(traceback.format_exception(type(error), error, error.__traceback__, limit=-7))[-7000:]
    else:
        text = str(error)[-7000:]
    details = {}
    if location is not None:
        details["errorLocation"] = location
        source = lines[location["line"] - 1]
        excerpt = source[:500] + ("…" if len(source) > 500 else "")
        text += f"\n用户代码第 {location['line']} 行：\n{location['line']:>4} | {excerpt}"
    details["error"] = text
    return details


def main():
    sys.setrecursionlimit(100000)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1048576, 1048576))
    protocol = sys.stdout
    dumps = json.dumps
    payload = json.load(sys.stdin)
    output = BoundedOutput()
    start = time.perf_counter()
    result = {"status": "Accepted", "actual": None, "stdout": "", "error": ""}
    try:
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            result["actual"] = execute(payload)
        encoded_actual = dumps(result["actual"], ensure_ascii=False, allow_nan=False)
        if len(encoded_actual) > 65536:
            raise OutputLimitExceeded("返回值超过 64 KiB 限制")
    except OutputLimitExceeded as error:
        result.update(status="Output Limit Exceeded", actual=None, **error_details(error, payload["code"], include_traceback=False))
    except BaseException as error:
        result.update(status="Runtime Error", actual=None, **error_details(error, payload["code"]))
    result.update(stdout=output.getvalue(), elapsedMs=round((time.perf_counter() - start) * 1000, 2))
    protocol.write(dumps(result, ensure_ascii=False, allow_nan=False))
    protocol.flush()


if __name__ == "__main__":
    main()
