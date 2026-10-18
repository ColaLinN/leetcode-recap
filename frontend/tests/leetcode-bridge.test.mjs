import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, URL,
    require: name => name.endsWith('.css') ? {} : imports[name] ?? require(name), ...globals });
  return module.exports;
}
function harness() {
  const timers = new Map();
  let timerId = 0;
  const module = load('../src/leetcodeBridge.ts', {}, {
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  const sent = [];
  const listeners = new Set();
  const changes = [];
  let sequence = 0;
  const host = {
    location: { origin: 'http://127.0.0.1:8766' },
    postMessage: (message, origin) => sent.push({ message: plain(message), origin }),
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener),
  };
  const bridge = module.createLeetCodeBridge(host, state => changes.push(plain(state)), { requestId: () => `request-${++sequence}` });
  function receive(message, overrides = {}) {
    const event = { source: host, origin: host.location.origin,
      data: { source: 'leetcode-recap-extension', version: 1, ...message }, ...overrides };
    for (const listener of listeners) listener(event);
  }
  function ready() {
    bridge.probe();
    const requestId = sent.at(-1).message.requestId;
    receive({ type: 'LEETCODE_PONG', requestId, status: 'ready', browser: 'chrome' });
  }
  function expire() { const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) callback(); }
  function expireAll() {
    for (let turn = 0; timers.size > 0 && turn < 20; turn++) expire();
    assert.equal(timers.size, 0, 'timers must settle after a bounded number of probe attempts');
  }
  return { module, bridge, host, sent, changes, listeners, receive, ready, expire, expireAll };
}
const payload = { slug: 'two-sum', language: 'python3', code: 'class Solution:\n    pass' };

test('no extension remains unavailable and cannot submit or fabricate a ready state', () => {
  const h = harness();
  h.bridge.probe();
  assert.equal(h.bridge.getState().connection, 'checking');
  assert.equal(h.sent[0].message.type, 'LEETCODE_PING');
  assert.equal(h.sent[0].origin, h.host.location.origin);
  h.expireAll();
  assert.equal(h.bridge.getState().connection, 'unavailable');
  const probes = h.sent.filter(entry => entry.message.type === 'LEETCODE_PING');
  assert.equal(probes.length, 3);
  assert.equal(new Set(probes.map(entry => entry.message.requestId)).size, 3);
  assert.equal(h.bridge.submit(payload), false);
  assert.equal(h.sent.some(entry => entry.message.type === 'LEETCODE_SUBMIT'), false);
  assert.equal(h.bridge.getState().submission.status, 'failed');
  h.bridge.dispose();
});

test('only a matching same-window same-origin Chrome extension pong enables sync', () => {
  const h = harness();
  h.bridge.probe();
  const pong = { type: 'LEETCODE_PONG', requestId: h.sent[0].message.requestId, status: 'ready', browser: 'chrome' };
  h.receive(pong, { origin: 'https://evil.example' });
  h.receive(pong, { source: {} });
  h.receive({ ...pong, source: 'different-extension' });
  h.receive({ ...pong, version: 2 });
  h.receive({ ...pong, requestId: 'old-request' });
  h.receive({ ...pong, browser: 'other' });
  assert.equal(h.bridge.getState().connection, 'checking');
  h.receive(pong);
  assert.equal(h.bridge.getState().connection, 'ready');
  h.bridge.dispose();
});

test('a late or previous probe response cannot claim a new connection', () => {
  const h = harness();
  h.bridge.probe();
  const first = h.sent[0].message.requestId;
  h.bridge.probe();
  h.receive({ type: 'LEETCODE_PONG', requestId: first, status: 'ready', browser: 'chrome' });
  assert.equal(h.bridge.getState().connection, 'checking');
  const last = h.sent.at(-1).message.requestId;
  h.expireAll();
  h.receive({ type: 'LEETCODE_PONG', requestId: last, status: 'ready', browser: 'chrome' });
  assert.equal(h.bridge.getState().connection, 'unavailable');
  h.bridge.dispose();
});

test('a content script that misses the first ping can connect on the second bounded attempt', () => {
  const h = harness();
  h.bridge.probe();
  const first = h.sent[0].message.requestId;
  h.expire(); // First response window expires; wait for the short retry backoff.
  assert.equal(h.sent.length, 1);
  assert.equal(h.bridge.getState().connection, 'checking');
  h.receive({ type: 'LEETCODE_PONG', requestId: first, status: 'ready', browser: 'chrome' });
  assert.equal(h.bridge.getState().connection, 'checking');
  h.expire();
  const second = h.sent.at(-1).message.requestId;
  assert.notEqual(second, first);
  h.receive({ type: 'LEETCODE_PONG', requestId: first, status: 'ready', browser: 'chrome' });
  assert.equal(h.bridge.getState().connection, 'checking');
  h.receive({ type: 'LEETCODE_PONG', requestId: second, status: 'ready', browser: 'chrome' });
  assert.equal(h.bridge.getState().connection, 'ready');
  h.expireAll();
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent.some(entry => entry.message.type === 'LEETCODE_SUBMIT'), false);
  h.bridge.dispose();
});

test('disposing during backoff cancels queued connection probes', () => {
  const h = harness();
  h.bridge.probe();
  h.expire();
  const changes = h.changes.length;
  h.bridge.dispose();
  h.expireAll();
  h.bridge.probe();
  assert.equal(h.sent.length, 1);
  assert.equal(h.changes.length, changes);
  assert.equal(h.listeners.size, 0);
});

test('a manual new probe clears the previous backoff and keeps only its own attempt valid', () => {
  const h = harness();
  h.bridge.probe();
  const old = h.sent[0].message.requestId;
  h.expire();
  h.bridge.probe();
  const current = h.sent.at(-1).message.requestId;
  assert.equal(h.sent.length, 2);
  h.receive({ type: 'LEETCODE_PONG', requestId: old, status: 'ready', browser: 'chrome' });
  assert.equal(h.bridge.getState().connection, 'checking');
  h.receive({ type: 'LEETCODE_PONG', requestId: current, status: 'ready', browser: 'chrome' });
  h.expireAll();
  assert.equal(h.bridge.getState().connection, 'ready');
  assert.equal(h.sent.length, 2);
  h.bridge.dispose();
});

test('one action sends the same immutable code snapshot locally and remotely and blocks duplicate remote submits', async () => {
  const h = harness();
  h.ready();
  const local = [];
  let editorCode = payload.code;
  const promise = h.module.submitWithSnapshot(editorCode, async code => { local.push(code); return { status: 'Wrong Answer' }; },
    code => h.bridge.submit({ ...payload, code }));
  editorCode = 'edited while waiting';
  assert.equal(h.bridge.submit({ ...payload, code: editorCode }), false);
  assert.deepEqual(await promise, { status: 'Wrong Answer' });
  const submits = h.sent.filter(entry => entry.message.type === 'LEETCODE_SUBMIT');
  assert.equal(submits.length, 1);
  assert.deepEqual(local, [payload.code]);
  assert.equal(submits[0].message.payload.code, payload.code);
  assert.equal(h.bridge.getState().submission.status, 'submitting'); // Local WA never decides remote status.
  h.bridge.dispose();
});

test('remote failure leaves local results intact and local failure does not retract the explicit remote submission', async () => {
  const h = harness();
  const errors = [];
  const local = await h.module.submitWithSnapshot('code', async () => ({ status: 'Accepted' }), () => { throw new Error('disconnected'); }, error => errors.push(error.message));
  assert.deepEqual(local, { status: 'Accepted' });
  assert.deepEqual(errors, ['disconnected']);
  const remote = [];
  await assert.rejects(h.module.submitWithSnapshot('same snapshot', async () => { throw new Error('local offline'); }, code => remote.push(code)), /local offline/);
  assert.deepEqual(remote, ['same snapshot']);
  h.bridge.dispose();
});

test('status responses must match the pending request, cannot regress, and terminal results ignore late messages', () => {
  const h = harness(); h.ready(); h.bridge.submit(payload);
  const requestId = h.bridge.getState().submission.requestId;
  h.receive({ type: 'LEETCODE_STATUS', requestId: 'previous-problem', status: 'accepted' });
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'invented' });
  assert.equal(h.bridge.getState().submission.status, 'submitting');
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'pending', submissionId: '12345' });
  assert.equal(h.bridge.getState().submission.url, 'https://leetcode.cn/submissions/detail/12345/');
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'submitting' });
  assert.equal(h.bridge.getState().submission.status, 'pending');
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'accepted' });
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'failed', error: 'late failure' });
  h.expire();
  assert.equal(h.bridge.getState().submission.status, 'accepted');
  h.bridge.dispose();
});

test('untrusted result links are discarded and failed result messages are safely bounded', () => {
  const h = harness(); h.ready(); h.bridge.submit(payload);
  const requestId = h.bridge.getState().submission.requestId;
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'failed', url: 'javascript:alert(1)', submissionId: 'not-an-id', error: 'x'.repeat(2000) });
  assert.equal(h.bridge.getState().submission.url, undefined);
  assert.equal(h.bridge.getState().submission.submissionId, undefined);
  assert.equal(h.bridge.getState().submission.error.length, 1000);
  h.bridge.dispose();
});

test('timeouts stop waiting with an unknown-result message and never retry or accept late success', () => {
  const h = harness(); h.ready(); h.bridge.submit(payload);
  const requestId = h.bridge.getState().submission.requestId;
  h.expire();
  assert.equal(h.bridge.getState().submission.status, 'failed');
  assert.match(h.bridge.getState().submission.error, /核对提交记录/);
  assert.equal(h.bridge.getState().connection, 'unavailable');
  assert.equal(h.sent.filter(entry => entry.message.type === 'LEETCODE_SUBMIT').length, 1);
  assert.equal(h.sent.at(-1).message.type, 'LEETCODE_CANCEL');
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'accepted' });
  assert.equal(h.bridge.getState().submission.status, 'failed');
  h.bridge.dispose();
});

test('stopping waiting and changing problems cancel observation without claiming the remote submission was revoked', () => {
  const h = harness(); h.ready(); h.bridge.submit(payload);
  h.bridge.cancelWaiting();
  assert.equal(h.bridge.getState().submission.status, 'canceled');
  assert.equal(h.sent.at(-1).message.type, 'LEETCODE_CANCEL');
  assert.equal(h.module.isLeetCodePending(h.bridge.getState().submission), false);
  h.bridge.submit(payload);
  const requestId = h.bridge.getState().submission.requestId;
  h.bridge.dispose();
  const count = h.changes.length;
  assert.equal(h.listeners.size, 0);
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'accepted' });
  h.expire();
  assert.equal(h.changes.length, count);
  assert.equal(h.bridge.submit(payload), false);
});

test('source problem slugs reject unrelated origins and invalid identifiers', () => {
  const { leetCodeSlug } = harness().module;
  assert.equal(leetCodeSlug('https://leetcode.com/problems/two-sum/description/'), 'two-sum');
  assert.equal(leetCodeSlug('https://leetcode.cn/problems/subsets/'), 'subsets');
  for (const url of ['https://evil.example/problems/two-sum/', 'http://leetcode.cn/problems/two-sum/', 'https://leetcode.cn/problems/TwoSum/', 'https://leetcode.cn/problems/two-sumEVIL/', 'not a URL']) assert.equal(leetCodeSlug(url), null);
});

test('rendered controls default off while disconnected and clearly distinguish unknown and official results', () => {
  const bridge = harness().module;
  const ui = load('../src/LeetCodeSync.tsx', { './leetcodeBridge': bridge });
  const html = renderToStaticMarkup(React.createElement(ui.LeetCodeSyncControl, { state: { connection: 'unavailable', submission: null }, enabled: false, available: true, busy: false, onEnabled() {}, onConnect() {} }));
  assert.match(html, /disabled=""/);
  assert.match(html, /连接 Chrome/);
  assert.equal(html.includes('checked=""'), false);
  assert.equal(html.includes('Chrome 已连接'), false);
  const unknown = renderToStaticMarkup(React.createElement(ui.LeetCodeSyncResult, { submission: { requestId: 'one', slug: 'two-sum', status: 'canceled' }, onCancel() {} }));
  assert.match(unknown, /提交状态未确认/);
  assert.match(unknown, /不会自动重试/);
  assert.match(unknown, /https:\/\/leetcode.cn\/problems\/two-sum\/submissions\//);
  const accepted = renderToStaticMarkup(React.createElement(ui.LeetCodeSyncResult, { submission: { requestId: 'one', slug: 'two-sum', status: 'accepted' }, onCancel() {} }));
  assert.match(accepted, /LeetCode.cn · 已通过/);
  const rejected = renderToStaticMarkup(React.createElement(ui.LeetCodeSyncResult, { submission: { requestId: 'one', slug: 'two-sum', status: 'rejected', statusDisplay: '答案错误' }, onCancel() {} }));
  assert.match(rejected, /LeetCode.cn · 未通过 · 答案错误/);
});
