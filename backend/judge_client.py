"""Host-side Docker transport. Submitted Python is never executed on the host."""

import json
import os
import selectors
import shutil
import subprocess
import threading
import time
import uuid


class DockerJudge:
    image = "recap-python:local"
    slots = threading.BoundedSemaphore(2)

    def availability(self):
        if not shutil.which("docker"):
            return {"available": False, "detail": "未找到 Docker。请先安装并启动 Docker Desktop 或 OrbStack，然后运行 ./scripts/setup.sh。"}
        try:
            check = subprocess.run(["docker", "image", "inspect", self.image], stdout=subprocess.DEVNULL,
                                   stderr=subprocess.PIPE, timeout=4)
            if check.returncode:
                detail = check.stderr.decode(errors="replace")
                if "Cannot connect" in detail or "connect:" in detail or "Is the docker daemon" in detail:
                    return {"available": False, "detail": "Docker 尚未启动。请启动 Docker Desktop 或 OrbStack。"}
                return {"available": False, "detail": "缺少判题镜像 recap-python:local。请运行 ./scripts/setup.sh 构建。"}
            return {"available": True, "detail": "Python 3.12 · Docker 隔离运行 · 每例 2 秒 / 256 MiB"}
        except (OSError, subprocess.TimeoutExpired):
            return {"available": False, "detail": "Docker 服务暂时无响应，请检查 Docker Desktop 或 OrbStack。"}

    @staticmethod
    def failure(status, tests, detail, elapsed=0):
        first = tests[0] if tests else {"args": [], "expected": None}
        return {"status": status, "passed": 0, "total": len(tests), "elapsedMs": elapsed,
                "results": [{"index": 0, "status": status, "input": first["args"], "expected": first.get("expected"),
                             "actual": None, "stdout": "", "error": detail, "elapsedMs": elapsed}]}

    def execute(self, problem, code, tests, reference=False):
        health = self.availability()
        if not health["available"]:
            return self.failure("Judge Unavailable", tests, health["detail"])
        if not self.slots.acquire(timeout=1):
            return self.failure("Judge Unavailable", tests, "已有两个判题任务运行中，请稍后再试。")
        try:
            return self._execute(problem, code, tests, reference)
        finally:
            self.slots.release()

    def _execute(self, problem, code, tests, reference):
        name = "recap-judge-" + uuid.uuid4().hex
        command = ["docker", "run", "--rm", "-i", "--name", name,
                   "--network", "none", "--read-only", "--cap-drop", "ALL",
                   "--security-opt", "no-new-privileges", "--pids-limit", "32",
                   "--memory", "256m", "--memory-swap", "256m", "--cpus", "1",
                   "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m", self.image]
        # Only the fields needed for adapters enter the execution environment.
        specification = {key: problem[key] for key in ("kind", "method", "className", "argTypes", "returnType", "mutates", "compare") if key in problem}
        payload = json.dumps({"problem": specification, "code": code, "tests": tests, "reference": reference}, ensure_ascii=False).encode()
        start = time.monotonic()
        process = None
        selector = selectors.DefaultSelector()
        captured = {"stdout": bytearray(), "stderr": bytearray()}
        status = None
        try:
            process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            for stream, kind in ((process.stdout, "stdout"), (process.stderr, "stderr")):
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, selectors.EVENT_READ, kind)
            os.set_blocking(process.stdin.fileno(), False)
            selector.register(process.stdin, selectors.EVENT_WRITE, "stdin")
            position = 0
            while selector.get_map():
                if time.monotonic() - start > 30:
                    status = "Time Limit Exceeded"
                    break
                for key, _ in selector.select(timeout=0.05):
                    if key.data == "stdin":
                        try:
                            position += os.write(key.fd, payload[position:position + 8192])
                        except BrokenPipeError:
                            position = len(payload)
                        if position == len(payload):
                            selector.unregister(key.fileobj)
                            key.fileobj.close()
                    else:
                        chunk = os.read(key.fd, 8192)
                        if not chunk:
                            selector.unregister(key.fileobj)
                            continue
                        captured[key.data].extend(chunk)
                        if sum(map(len, captured.values())) > 2 * 1024 * 1024:
                            status = "Output Limit Exceeded"
                            break
                if status:
                    break
            if status:
                return self.failure(status, tests, "整个判题任务超过时间或输出限制。", round((time.monotonic() - start) * 1000, 2))
            process.wait(timeout=2)
            if process.returncode:
                detail = captured["stderr"].decode(errors="replace")[-2000:]
                return self.failure("Judge Unavailable", tests, detail or "Docker 判题容器异常退出。")
            response = json.loads(captured["stdout"].decode())
            results = response["results"]
            passed = sum(result["status"] == "Accepted" for result in results)
            first_failure = next((result["status"] for result in results if result["status"] != "Accepted"), None)
            return {"status": first_failure or "Accepted", "passed": passed, "total": len(tests),
                    "elapsedMs": round((time.monotonic() - start) * 1000, 2), "results": results}
        except (OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
            return self.failure("Judge Unavailable", tests, "判题服务无法完成请求：" + str(error)[:500])
        finally:
            selector.close()
            if process:
                if process.poll() is None:
                    process.kill()
                process.wait(timeout=2)
                for stream in (process.stdin, process.stdout, process.stderr):
                    if stream and not stream.closed:
                        stream.close()
            # --rm handles success; force removal also covers daemon/CLI interruptions.
            try:
                subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=4)
            except (OSError, subprocess.TimeoutExpired):
                pass
