"""Run every curated reference solution through the real Docker judge.

Usage: python -m backend.validate_catalog [--workers 2]
"""

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from backend.judge_client import DockerJudge


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, choices=(1, 2), default=2)
    parser.add_argument("--include-examples", action="store_true", help="同时执行每道题的展示样例")
    parser.add_argument("--catalog", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "catalog.json")
    options = parser.parse_args()
    judge = DockerJudge()
    health = judge.availability()
    if not health["available"]:
        raise SystemExit(health["detail"])
    problems = json.loads(options.catalog.read_text(encoding="utf-8"))["problems"]

    def check(problem):
        tests = problem["tests"] + problem["examples"] if options.include_examples else problem["tests"]
        return problem, judge.execute(problem, problem["solution"], tests)

    passed, cases, failures = 0, 0, []
    with ThreadPoolExecutor(max_workers=options.workers) as pool:
        for future in as_completed([pool.submit(check, problem) for problem in problems]):
            problem, result = future.result()
            cases += result["total"]
            if result["status"] == "Accepted" and result["passed"] == result["total"]:
                passed += 1
                print("PASS {} {} ({}/{})".format(problem["number"], problem["title"], result["passed"], result["total"]), flush=True)
            else:
                failures.append({"id": problem["id"], "number": problem["number"], "result": result})
                print("FAIL {} {}: {}".format(problem["number"], problem["title"], result["status"]), flush=True)
    print("Validated {}/{} reference solutions; {} test cases.".format(passed, len(problems), cases), flush=True)
    if failures:
        print(json.dumps(failures, ensure_ascii=False, indent=2))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
