import pytest

from backend.judge.runner import matches
from backend.judge_client import DockerJudge


def test_comparators_preserve_duplicate_counts_and_nested_order():
    assert matches([2, 1, 2], [2, 2, 1], "unordered")
    assert not matches([2, 1], [2, 2, 1], "unordered")
    assert matches([[2, 1], [4, 3]], [[3, 4], [1, 2]], "nested-unordered")
    assert not matches([[2, 1]], [[1, 2]], "exact")
    assert not matches(True, 1, "exact")
    assert matches([2.0], [2], "exact")


@pytest.fixture(scope="module")
def docker():
    judge = DockerJudge()
    if not judge.availability()["available"]:
        pytest.skip("Docker + recap-python:local required for integration tests")
    return judge


@pytest.mark.parametrize("problem,code,args,expected", [
    ({"method": "solve"}, "class Solution:\n def solve(self, a): return sum(a)", [[1, 2, 3]], 6),
    ({"method": "reverseList", "argTypes": ["listnode"], "returnType": "listnode"},
     "class Solution:\n def reverseList(self, head):\n  prev=None\n  while head: head.next,prev,head=prev,head,head.next\n  return prev", [[1, 2, 3]], [3, 2, 1]),
    ({"method": "invertTree", "argTypes": ["tree"], "returnType": "tree"},
     "class Solution:\n def invertTree(self, root):\n  if root: root.left,root.right=self.invertTree(root.right),self.invertTree(root.left)\n  return root", [[1, 2, 3, None, 4]], [1, 3, 2, None, None, 4]),
    ({"method": "hasCycle", "argTypes": ["cyclelist"]},
     "class Solution:\n def hasCycle(self, head):\n  seen=set()\n  while head:\n   if head in seen: return True\n   seen.add(head); head=head.next\n  return False", [{"values": [1, 2, 3], "pos": 1}], True),
    ({"method": "rotate", "mutates": 0},
     "class Solution:\n def rotate(self, a): a[:]=[list(row) for row in zip(*a[::-1])]", [[[1, 2], [3, 4]]], [[3, 1], [4, 2]]),
    ({"method": "reorder", "argTypes": ["listnode"], "mutates": 0},
     "class Solution:\n def reorder(self, head):\n  if head and head.next: head.next.val=9", [[1, 2]], [1, 9]),
    ({"kind": "design", "className": "CounterBox"},
     "class CounterBox:\n def __init__(self, n): self.n=n\n def add(self, x): self.n+=x\n def value(self): return self.n", [["CounterBox", "add", "value"], [[2], [3], []]], [None, None, 5]),
    ({"method": "solve", "compare": "nested-unordered"},
     "class Solution:\n def solve(self): return [[2,1],[4,3]]", [], [[3, 4], [1, 2]]),
    ({"method": "solve"},
     "import os\nclass Solution:\n def solve(self): return [os.geteuid(), os.access('/judge/worker.py', os.W_OK), os.path.exists('/Users/fenglyulin')]", [], [65534, False, False]),
])
def test_real_docker_adapters_and_isolation(docker, problem, code, args, expected):
    result = docker.execute(problem, code, [{"args": args, "expected": expected}])
    assert result["status"] == "Accepted", result
    assert result["passed"] == result["total"] == 1
    assert result["results"][0]["actual"] == expected or problem.get("compare")


@pytest.mark.parametrize("code,status", [
    ("class Solution:\n def solve(self): return 2", "Wrong Answer"),
    ("class Solution:\n def solve(self): return 1/0", "Runtime Error"),
    ("class Solution:\n def solve(self):\n  while True: pass", "Time Limit Exceeded"),
    ("class Solution:\n def solve(self): print('x'*40000)", "Output Limit Exceeded"),
    ("import os\nclass Solution:\n def solve(self):\n  while True: os.write(1,b'x'*8192)", "Output Limit Exceeded"),
    ("class Solution:\n def solve(self): return [0]*70000", "Output Limit Exceeded"),
])
def test_real_docker_errors_and_limits(docker, code, status):
    result = docker.execute({"method": "solve"}, code, [{"args": [], "expected": 1}])
    assert result["status"] == status, result


def test_real_custom_reference_computes_expected(docker):
    result = docker.execute({"method": "solve"}, "class Solution:\n def solve(self,x): return x*2", [{"args": [17]}], reference=True)
    assert result["status"] == "Accepted"
    assert result["results"][0]["actual"] == 34


def test_real_container_memory_process_network_and_privilege_limits(docker):
    code = """import os
class Solution:
 def solve(self):
  def read_limit(*paths):
   for path in paths:
    if os.path.exists(path):
     with open(path) as handle: return handle.read().strip()
  with open('/proc/self/status') as handle: status=handle.read()
  with open('/proc/net/dev') as handle: network=handle.read()
  return [read_limit('/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory/memory.limit_in_bytes'),
          read_limit('/sys/fs/cgroup/pids.max','/sys/fs/cgroup/pids/pids.max'),
          'eth0' not in network, 'NoNewPrivs:\\t1' in status,
          'CapEff:\\t0000000000000000' in status,
          bool(os.statvfs('/').f_flag & os.ST_RDONLY)]
"""
    result = docker.execute({"method": "solve"}, code, [{"args": [], "expected": ["268435456", "32", True, True, True, True]}])
    assert result["status"] == "Accepted", result
