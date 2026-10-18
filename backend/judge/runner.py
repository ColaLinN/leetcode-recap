"""Container supervisor: fresh Python worker and wall/output budget for every case."""

import json
import os
import selectors
import signal
import subprocess
import sys
import time


def bounded_worker(payload, timeout=2.0, max_output=131072):
    start = time.monotonic()
    process = subprocess.Popen([sys.executable, "-I", "-B", "/judge/worker.py"], stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    selector = selectors.DefaultSelector()
    data = json.dumps(payload, ensure_ascii=False).encode()
    position = 0
    captured = {"stdout": bytearray(), "stderr": bytearray()}
    for stream, name in ((process.stdout, "stdout"), (process.stderr, "stderr")):
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ, name)
    os.set_blocking(process.stdin.fileno(), False)
    selector.register(process.stdin, selectors.EVENT_WRITE, "stdin")
    failure = None
    try:
        while selector.get_map():
            if time.monotonic() - start > timeout:
                failure = "Time Limit Exceeded"
                break
            for key, _ in selector.select(timeout=0.03):
                if key.data == "stdin":
                    try:
                        position += os.write(key.fd, data[position:position + 8192])
                    except BrokenPipeError:
                        position = len(data)
                    if position >= len(data):
                        selector.unregister(key.fileobj)
                        key.fileobj.close()
                else:
                    chunk = os.read(key.fd, 8192)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    captured[key.data].extend(chunk)
                    if sum(map(len, captured.values())) > max_output:
                        failure = "Output Limit Exceeded"
                        break
            if failure:
                break
    finally:
        # Kill the whole worker process group, including children spawned by user code.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=1)
        selector.close()
        for stream in (process.stdin, process.stdout, process.stderr):
            if not stream.closed:
                stream.close()
    elapsed = round((time.monotonic() - start) * 1000, 2)
    if failure:
        return {"status": failure, "actual": None, "stdout": "", "error": "单个测试用例超过 2 秒" if failure == "Time Limit Exceeded" else "输出超过限制", "elapsedMs": elapsed}
    try:
        result = json.loads(captured["stdout"].decode())
        if not isinstance(result, dict) or result.get("status") not in ("Accepted", "Runtime Error", "Output Limit Exceeded"):
            raise ValueError("invalid worker response")
        return result
    except (ValueError, UnicodeError):
        return {"status": "Runtime Error", "actual": None, "stdout": captured["stdout"].decode(errors="replace")[:4000],
                "error": captured["stderr"].decode(errors="replace")[-4000:] or "Python 进程异常退出（可能超出内存限制或直接写入了标准输出）", "elapsedMs": elapsed}


def canonical(value):
    # JSON parsers may represent the same numeric answer as 2 or 2.0.
    def normalize(item):
        if isinstance(item, float) and item.is_integer():
            return int(item)
        if isinstance(item, list):
            return [normalize(child) for child in item]
        if isinstance(item, dict):
            return {key: normalize(child) for key, child in item.items()}
        return item
    return json.dumps(normalize(value), sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def matches(actual, expected, comparison):
    # JSON equality must keep booleans distinct from integers.
    if comparison == "unordered" and isinstance(actual, list) and isinstance(expected, list):
        return sorted(map(canonical, actual)) == sorted(map(canonical, expected))
    if comparison == "nested-unordered" and isinstance(actual, list) and isinstance(expected, list):
        normalize = lambda group: canonical(sorted(group, key=canonical)) if isinstance(group, list) else canonical(group)
        return sorted(map(normalize, actual)) == sorted(map(normalize, expected))
    return canonical(actual) == canonical(expected)


def main():
    payload = json.load(sys.stdin)
    results = []
    for index, case in enumerate(payload["tests"]):
        result = bounded_worker({"code": payload["code"], "problem": payload["problem"], "args": case["args"]})
        if result["status"] == "Accepted" and not payload.get("reference"):
            if not matches(result["actual"], case.get("expected"), payload["problem"].get("compare", "exact")):
                result["status"] = "Wrong Answer"
        result.update(index=index, input=case["args"], expected=case.get("expected"))
        results.append(result)
        # A timeout, crash or output flood should not repeat across the whole suite.
        if result["status"] in ("Time Limit Exceeded", "Runtime Error", "Output Limit Exceeded"):
            break
    json.dump({"results": results}, sys.stdout, ensure_ascii=False, allow_nan=False)


if __name__ == "__main__":
    main()
