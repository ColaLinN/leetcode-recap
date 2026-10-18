import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { pageTask } from '../page-task.js';

function harness(responses, overrides = {}) {
  const calls = [];
  const context = { location: { origin: 'https://leetcode.cn', pathname: '/problems/two-sum/' },
    document: { cookie: 'other=value; csrftoken=browser_only_secret' }, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { status: next?.status ?? 200, ok: (next?.status ?? 200) < 400,
        headers: { get: () => next?.contentType ?? 'application/json' }, json: async () => next?.data };
    }, ...overrides };
  vm.createContext(context);
  // MAIN receives only the serialized function, not any extension closures.
  const run = vm.runInContext(`(${pageTask.toString()})`, context);
  return { calls, run: input => run({ slug: 'two-sum', ...input }) };
}

test('prepare confirms exact slug/id and signed-in status without returning credentials', async () => {
  const h = harness([{ data: { data: { question: { questionId: '1', titleSlug: 'two-sum' }, userStatus: { isSignedIn: true } } } }]);
  const result = await h.run({ action: 'prepare' });
  assert.equal(result.ok, true);
  assert.equal(result.questionId, '1');
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(h.calls[0].url, '/graphql/');
  assert.equal(h.calls[0].options.credentials, 'include');
  assert.equal(h.calls[0].options.headers['X-CSRFToken'], 'browser_only_secret');
  assert.equal(h.calls[0].options.redirect, 'error');
});

test('login, changed schema, challenge HTML, rate limit, and missing CSRF fail closed', async () => {
  const cases = [
    { data: { data: { userStatus: { isSignedIn: false } } } },
    { data: { data: { question: { questionId: '1', titleSlug: 'other' }, userStatus: { isSignedIn: true } } } },
    { data: { data: {} } }, { status: 403 }, { status: 429 }, { contentType: 'text/html', data: '<captcha secret>' },
  ];
  for (const response of cases) {
    const h = harness([response]);
    const result = await h.run({ action: 'prepare' });
    assert.equal(result.ok, false);
    assert.equal(h.calls.length, 1);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
  const noToken = harness([], { document: { cookie: '' } });
  assert.equal((await noToken.run({ action: 'prepare' })).ok, false);
  assert.equal(noToken.calls.length, 0);
});

test('submission sends source strictly as JSON data once and never retries unknown outcomes', async () => {
  for (const response of [{ data: { submission_id: 456 } }, { data: {} }, new Error('secret network detail')]) {
    const h = harness([response]);
    const code = 'class Solution:\n def twoSum(self): return "not executed"';
    const result = await h.run({ action: 'submit', questionId: '1', code });
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].url, '/problems/two-sum/submit/');
    assert.deepEqual(JSON.parse(h.calls[0].options.body), { lang: 'python3', question_id: '1', typed_code: code });
    assert.equal(JSON.stringify(result).includes('secret'), false);
    if (response.data?.submission_id) assert.equal(result.submissionId, '456');
    else { assert.equal(result.ok, false); assert.equal(result.uncertain, true); }
  }
});

test('different origin/problem or unsafe IDs cannot make any request', async () => {
  const h = harness([], { location: { origin: 'https://evil.example', pathname: '/problems/two-sum/' } });
  assert.equal((await h.run({ action: 'submit', questionId: 1, code: 'pass' })).ok, false);
  assert.equal(h.calls.length, 0);
  const wrongProblem = harness([], { location: { origin: 'https://leetcode.cn', pathname: '/problems/other/' } });
  assert.equal((await wrongProblem.run({ action: 'prepare' })).ok, false);
  const badId = harness([]);
  assert.equal((await badId.run({ action: 'check', submissionId: '1/../../' })).ok, false);
  assert.equal(badId.calls.length, 0);
});

test('SUCCESS is only accepted with the exact accepted verdict; unknown schemas fail closed', async () => {
  const cases = [
    [{ state: 'PENDING' }, 'pending'], [{ state: 'STARTED' }, 'pending'],
    [{ state: 'SUCCESS', status_code: 10, status_msg: 'Accepted' }, 'accepted'],
    [{ state: 'SUCCESS', status_code: 11, status_msg: 'Wrong Answer' }, 'rejected'],
    [{ state: 'SUCCESS', status_code: 10, status_msg: 'Wrong Answer' }, undefined],
    [{ state: 'SUCCESS', status_code: 999, status_msg: 'Wrong Answer' }, undefined],
    [{ state: 'SUCCESS', status_code: 11, status_msg: 'Runtime Error' }, undefined],
    [{ state: 'SUCCESS', status_code: 10 }, undefined], [{ state: 'SUCCESS' }, undefined],
    [{ state: 'SUCCESS', status_code: 0, status_msg: 'mystery secret' }, undefined],
    [{ submission_id: 999, state: 'PENDING' }, undefined],
  ];
  for (const [data, expected] of cases) {
    const h = harness([{ data }]);
    const result = await h.run({ action: 'check', submissionId: '456' });
    assert.equal(result.status, expected, JSON.stringify(data));
    assert.equal(result.ok, Boolean(expected));
    assert.equal(h.calls[0].options.method, 'GET');
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});
