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
    receive({ type: 'LEETCODE_PONG', requestId, status: 'ready', browser: 'chrome', editorSync: true });
  }
  function expire() { const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) callback(); }
  function expireAll() {
    for (let turn = 0; timers.size > 0 && turn < 20; turn++) expire();
    assert.equal(timers.size, 0, 'timers must settle after a bounded number of probe attempts');
  }
  return { module, bridge, host, sent, changes, listeners, receive, ready, expire, expireAll };
}
const payload = { slug: 'two-sum', language: 'python3', code: 'class Solution:\n    pass' };
function confirmedSubmission(h) {
  h.ready(); h.bridge.submit(payload);
  const requestId = h.bridge.getState().submission.requestId;
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'accepted', editorSynced: true, editorUrl: 'https://leetcode.cn/problems/two-sum/description/' });
  return requestId;
}

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
  const pong = { type: 'LEETCODE_PONG', requestId: h.sent[0].message.requestId, status: 'ready', browser: 'chrome', editorSync: true };
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

test('an older extension without verified editor-sync capability cannot enable remote submission', () => {
  for (const editorSync of [undefined, false, 'true']) {
    const h = harness();
    h.bridge.probe();
    const requestId = h.sent[0].message.requestId;
    h.receive({ type: 'LEETCODE_PONG', requestId, status: 'ready', browser: 'chrome', editorSync });
    assert.equal(h.bridge.getState().connection, 'unavailable');
    assert.match(h.bridge.getState().connectionError, /重新加载项目扩展/);
    assert.equal(h.bridge.submit(payload), false);
    assert.equal(h.sent.some(entry => entry.message.type === 'LEETCODE_SUBMIT'), false);
    h.expireAll();
    h.bridge.dispose();
  }
});

test('a late or previous probe response cannot claim a new connection', () => {
  const h = harness();
  h.bridge.probe();
  const first = h.sent[0].message.requestId;
  h.bridge.probe();
  h.receive({ type: 'LEETCODE_PONG', requestId: first, status: 'ready', browser: 'chrome', editorSync: true });
  assert.equal(h.bridge.getState().connection, 'checking');
  const last = h.sent.at(-1).message.requestId;
  h.expireAll();
  h.receive({ type: 'LEETCODE_PONG', requestId: last, status: 'ready', browser: 'chrome', editorSync: true });
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
  h.receive({ type: 'LEETCODE_PONG', requestId: first, status: 'ready', browser: 'chrome', editorSync: true });
  assert.equal(h.bridge.getState().connection, 'checking');
  h.expire();
  const second = h.sent.at(-1).message.requestId;
  assert.notEqual(second, first);
  h.receive({ type: 'LEETCODE_PONG', requestId: first, status: 'ready', browser: 'chrome', editorSync: true });
  assert.equal(h.bridge.getState().connection, 'checking');
  h.receive({ type: 'LEETCODE_PONG', requestId: second, status: 'ready', browser: 'chrome', editorSync: true });
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
  h.receive({ type: 'LEETCODE_PONG', requestId: old, status: 'ready', browser: 'chrome', editorSync: true });
  assert.equal(h.bridge.getState().connection, 'checking');
  h.receive({ type: 'LEETCODE_PONG', requestId: current, status: 'ready', browser: 'chrome', editorSync: true });
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

test('editor sync requires a boolean acknowledgement for this request and this official problem editor', () => {
  const h = harness(); h.ready(); h.bridge.submit(payload);
  const requestId = h.bridge.getState().submission.requestId;
  const editorUrl = 'https://leetcode.cn/problems/two-sum/description/';
  const acknowledgement = { type: 'LEETCODE_STATUS', requestId, status: 'submitting', editorSynced: true, editorUrl };
  h.receive({ ...acknowledgement, requestId: 'previous-problem' });
  h.receive(acknowledgement, { origin: 'https://evil.example' });
  h.receive(acknowledgement, { source: {} });
  assert.equal(h.bridge.getState().submission.editorSynced, undefined);
  h.receive({ ...acknowledgement, editorSynced: 'true' });
  for (const editorUrl of ['https://evil.example/problems/two-sum/description/', 'https://leetcode.cn/problems/subsets/description/', 'https://user:secret@leetcode.cn/problems/two-sum/description/', 'javascript:alert(1)']) h.receive({ ...acknowledgement, editorUrl });
  assert.equal(h.bridge.getState().submission.editorSynced, false);
  assert.equal(h.bridge.getState().submission.editorUrl, undefined);
  h.receive(acknowledgement);
  assert.equal(h.bridge.getState().submission.editorSynced, true);
  assert.equal(h.bridge.getState().submission.editorUrl, editorUrl);
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'pending', submissionId: '12345' });
  assert.equal(h.bridge.getState().submission.editorSynced, true);
  assert.equal(h.bridge.getState().submission.editorUrl, editorUrl);
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'failed', error: '原站结果未确认' });
  assert.equal(h.bridge.getState().submission.editorSynced, true); // Judging failure does not undo the confirmed editor write.
  h.bridge.submit(payload);
  assert.equal(h.bridge.getState().submission.editorSynced, undefined);
  h.receive(acknowledgement);
  assert.equal(h.bridge.getState().submission.editorSynced, undefined);
  h.bridge.dispose();
});

test('a sync failure renders its specific error without claiming the editor was updated', () => {
  const h = harness(); h.ready(); h.bridge.submit(payload);
  const requestId = h.bridge.getState().submission.requestId;
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'failed', editorSynced: false, error: '编辑器读回内容与本次代码不同，未向原站提交。' });
  const ui = load('../src/LeetCodeSync.tsx', { './leetcodeBridge': h.module });
  const html = renderToStaticMarkup(React.createElement(ui.LeetCodeSyncResult, { submission: h.bridge.getState().submission, onCancel() {}, onOpenEditor() {} }));
  assert.match(html, /编辑器读回内容与本次代码不同，未向原站提交。/);
  assert.equal(html.includes('编辑器已同步'), false);
  assert.equal(html.includes('打开力扣编辑器'), false);
  h.bridge.dispose();
});

test('opening an editor requires a confirmed sync and sends only bound request and operation identifiers', () => {
  const h = harness();
  assert.equal(h.bridge.openEditor(), false);
  h.ready(); h.bridge.submit(payload);
  assert.equal(h.bridge.openEditor(), false);
  const requestId = h.bridge.getState().submission.requestId;
  h.receive({ type: 'LEETCODE_STATUS', requestId, status: 'accepted', editorSynced: true, editorUrl: 'https://leetcode.cn/problems/two-sum/description/' });
  assert.equal(h.bridge.openEditor(), true);
  const open = h.sent.at(-1).message;
  assert.deepEqual(Object.keys(open).sort(), ['openId', 'requestId', 'source', 'type', 'version']);
  assert.equal(open.type, 'LEETCODE_OPEN_EDITOR');
  assert.equal(open.requestId, requestId);
  assert.notEqual(open.openId, requestId);
  assert.equal(h.bridge.openEditor(), false);
  assert.equal(h.sent.filter(entry => entry.message.type === 'LEETCODE_OPEN_EDITOR').length, 1);
  h.bridge.dispose();
});

test('editor-open acknowledgements are separately correlated after judging finishes and cannot replace judge results', () => {
  const h = harness();
  const requestId = confirmedSubmission(h);
  h.bridge.openEditor();
  const openId = h.sent.at(-1).message.openId;
  const opened = { type: 'LEETCODE_EDITOR_OPENED', requestId, openId, opened: true };
  h.receive({ ...opened, opened: 'true' });
  h.receive({ ...opened, openId: 'old-operation' });
  h.receive({ ...opened, requestId: 'old-submission' });
  h.receive(opened, { origin: 'https://evil.example' });
  h.receive(opened, { source: {} });
  assert.equal(h.bridge.getState().submission.editorOpenState, 'opening');
  h.receive(opened);
  assert.equal(h.bridge.getState().submission.editorOpenState, 'opened');
  assert.equal(h.bridge.getState().submission.status, 'accepted');
  assert.equal(h.bridge.getState().submission.editorSynced, true);
  h.expireAll();
  assert.equal(h.bridge.getState().submission.editorOpenState, 'opened');
  h.bridge.dispose();
});

test('a closed or navigated target gives its explicit error without creating a replacement editor URL', () => {
  const h = harness();
  const requestId = confirmedSubmission(h);
  h.bridge.openEditor();
  const openId = h.sent.at(-1).message.openId;
  h.receive({ type: 'LEETCODE_EDITOR_OPENED', requestId, openId, opened: false, error: '已同步的原题标签页已关闭或导航，无法定位本次编辑器。' });
  const current = h.bridge.getState().submission;
  assert.equal(current.editorOpenState, 'failed');
  assert.equal(current.status, 'accepted');
  const ui = load('../src/LeetCodeSync.tsx', { './leetcodeBridge': h.module });
  const html = renderToStaticMarkup(React.createElement(ui.LeetCodeSyncResult, { submission: current, onCancel() {}, onOpenEditor() {} }));
  assert.match(html, /已同步的原题标签页已关闭或导航/);
  assert.equal(html.includes('href="https://leetcode.cn/problems/two-sum/description/"'), false);
  assert.match(html, /<button[^>]*>打开力扣编辑器/);
  h.bridge.dispose();
});

test('editor opening never retries automatically and an older timed-out operation cannot confirm a later explicit attempt', () => {
  const h = harness();
  const requestId = confirmedSubmission(h);
  h.bridge.openEditor();
  const first = h.sent.at(-1).message.openId;
  h.expireAll();
  assert.equal(h.bridge.getState().submission.editorOpenState, 'failed');
  assert.match(h.bridge.getState().submission.editorOpenError, /未收到打开编辑器的确认/);
  assert.equal(h.sent.filter(entry => entry.message.type === 'LEETCODE_OPEN_EDITOR').length, 1);
  h.bridge.openEditor();
  const second = h.sent.at(-1).message.openId;
  assert.notEqual(first, second);
  h.receive({ type: 'LEETCODE_EDITOR_OPENED', requestId, openId: first, opened: true });
  assert.equal(h.bridge.getState().submission.editorOpenState, 'opening');
  h.receive({ type: 'LEETCODE_EDITOR_OPENED', requestId, openId: second, opened: true });
  assert.equal(h.bridge.getState().submission.editorOpenState, 'opened');
  assert.equal(h.sent.filter(entry => entry.message.type === 'LEETCODE_SUBMIT').length, 1);
  h.bridge.dispose();
});

test('a new submission or disposal clears old editor-opening state and ignores stale confirmations', () => {
  const h = harness();
  const oldRequest = confirmedSubmission(h);
  h.bridge.openEditor();
  const oldOpen = h.sent.at(-1).message.openId;
  h.bridge.submit(payload);
  assert.notEqual(h.bridge.getState().submission.requestId, oldRequest);
  assert.equal(h.bridge.getState().submission.editorOpenState, undefined);
  h.receive({ type: 'LEETCODE_EDITOR_OPENED', requestId: oldRequest, openId: oldOpen, opened: true });
  assert.equal(h.bridge.getState().submission.editorOpenState, undefined);
  h.bridge.dispose();
  const changes = h.changes.length;
  h.expireAll();
  assert.equal(h.bridge.openEditor(), false);
  assert.equal(h.changes.length, changes);
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
  const unknown = renderToStaticMarkup(React.createElement(ui.LeetCodeSyncResult, { submission: { requestId: 'one', slug: 'two-sum', status: 'canceled' }, onCancel() {}, onOpenEditor() {} }));
  assert.match(unknown, /提交状态未确认/);
  assert.match(unknown, /已派发的编辑器写入仍可能完成/);
  assert.match(unknown, /已发出的提交可能继续判题/);
  assert.match(unknown, /不会自动重试/);
  assert.match(unknown, /https:\/\/leetcode.cn\/problems\/two-sum\/submissions\//);
  const accepted = renderToStaticMarkup(React.createElement(ui.LeetCodeSyncResult, { submission: { requestId: 'one', slug: 'two-sum', status: 'accepted' }, onCancel() {}, onOpenEditor() {} }));
  assert.match(accepted, /LeetCode.cn · 已通过/);
  const rejected = renderToStaticMarkup(React.createElement(ui.LeetCodeSyncResult, { submission: { requestId: 'one', slug: 'two-sum', status: 'rejected', statusDisplay: '答案错误' }, onCancel() {}, onOpenEditor() {} }));
  assert.match(rejected, /LeetCode.cn · 未通过 · 答案错误/);
  const syncing = renderToStaticMarkup(React.createElement(ui.LeetCodeSyncResult, { submission: { requestId: 'one', slug: 'two-sum', status: 'submitting' }, onCancel() {}, onOpenEditor() {} }));
  assert.match(syncing, /正在同步编辑器/);
  assert.equal(syncing.includes('编辑器已同步'), false);
  const synced = renderToStaticMarkup(React.createElement(ui.LeetCodeSyncResult, { submission: { requestId: 'one', slug: 'two-sum', status: 'submitting', editorSynced: true, editorUrl: 'https://leetcode.cn/problems/two-sum/description/' }, onCancel() {}, onOpenEditor() {} }));
  assert.match(synced, /正在提交代码/);
  assert.match(synced, /编辑器已同步 · Python3/);
  assert.equal(synced.includes('href="https://leetcode.cn/problems/two-sum/description/"'), false);
  assert.match(synced, /<button[^>]*>打开力扣编辑器/);
});
