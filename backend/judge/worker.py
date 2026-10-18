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
    exec(compile(payload["code"], "<submission>", "exec"), namespace)
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
        result.update(status="Output Limit Exceeded", actual=None, error=str(error))
    except BaseException:
        result.update(status="Runtime Error", actual=None, error=traceback.format_exc(limit=7)[-8000:])
    result.update(stdout=output.getvalue(), elapsedMs=round((time.perf_counter() - start) * 1000, 2))
    protocol.write(dumps(result, ensure_ascii=False, allow_nan=False))
    protocol.flush()


if __name__ == "__main__":
    main()
