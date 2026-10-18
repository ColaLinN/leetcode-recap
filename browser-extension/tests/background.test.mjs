import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackground } from '../background-core.js';

const P = globalThis.RecapLeetCodeProtocol;
const sender = { id: 'extension-id', frameId: 0, documentId: 'local-document', origin: 'http://localhost:8765',
  url: 'http://localhost:8765/#/problem/two-sum', tab: { id: 10, url: 'http://localhost:8765/' } };
const submit = (id = 'submit-0001') => ({ source: P.APP, version: 1, type: 'LEETCODE_SUBMIT', requestId: id,
  payload: { slug: 'two-sum', code: 'class Solution: pass', language: 'python3' } });

function harness(action = async input => input.action === 'prepare' ? { ok: true, questionId: '1' }
  : input.action === 'submit' ? { ok: true, submissionId: '456' } : { ok: true, status: 'accepted', statusDisplay: '通过' }) {
  let clock = 0;
  const storage = {}, injections = [], messages = [], created = [];
  const api = { runtime: { id: 'extension-id', getManifest: () => ({ version: '1.0.0' }) },
    storage: { session: { get: async key => ({ [key]: storage[key] }), set: async value => Object.assign(storage, value) } },
    tabs: { query: async () => [{ id: 20, url: 'https://leetcode.cn/problems/two-sum/description/' }],
      create: async options => { created.push(options); return { id: 20, ...options }; },
      get: async () => ({ id: 20, status: 'complete', url: 'https://leetcode.cn/problems/two-sum/description/' }),
      sendMessage: async (id, message, options) => { messages.push({ id, message, options }); } },
    scripting: { executeScript: async options => {
      injections.push(options);
      return [{ frameId: 0, documentId: 'official-document', result: await action(options.args[0]) }];
    } },
  };
  const options = { sleep: async ms => { clock += ms; }, now: () => clock, pollMs: 3000 };
  return { api, options, bridge: createBackground(api, options), storage, injections, messages, created };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('background independently validates extension sender, top frame, document, host, and port', async () => {
  const h = harness();
  for (const bad of [{ ...sender, id: 'other' }, { ...sender, frameId: 1 }, { ...sender, documentId: '' },
    { ...sender, origin: 'http://localhost:9999' }, { ...sender, url: 'http://localhost:9999/' },
    { ...sender, tab: { id: 10, url: 'https://evil.example/' } }]) {
    assert.equal(await h.bridge.handle(submit(), bad), undefined);
  }
  assert.equal(h.injections.length, 0);
  const pong = await h.bridge.handle({ source: P.APP, version: 1, type: 'LEETCODE_PING', requestId: 'ping-00001' }, sender);
  assert.equal(pong.status, 'ready');
  assert.equal(pong.browser, 'chrome');
});

test('explicit submit reuses a tab without editing it and sends only once across duplicate/restarted workers', async () => {
  const h = harness();
  const ack = await h.bridge.handle(submit(), sender);
  assert.equal(ack.status, 'submitting');
  await h.bridge.whenIdle();
  assert.equal(h.injections.filter(call => call.args[0].action === 'submit').length, 1);
  assert.equal(h.created.length, 0);
  assert.equal(h.messages.at(-1).message.status, 'accepted');
  assert.equal(h.messages.at(-1).message.submissionId, '456');
  assert.deepEqual(h.messages.at(-1).options, { documentId: 'local-document' });
  assert.equal(h.injections.every(call => call.world === 'MAIN'), true);
  assert.deepEqual(h.injections[1].target, { tabId: 20, documentIds: ['official-document'] });
  assert.equal((await h.bridge.handle(submit(), sender)).status, 'accepted');
  const restarted = createBackground(h.api, h.options);
  assert.equal((await restarted.handle(submit(), sender)).status, 'accepted');
  assert.equal(h.injections.filter(call => call.args[0].action === 'submit').length, 1);
  assert.equal(JSON.stringify(h.storage).includes('class Solution'), false);
});

test('when no matching tab exists, creates only the official problem page in the background', async () => {
  const h = harness();
  h.api.tabs.query = async () => [];
  await h.bridge.handle(submit(), sender);
  await h.bridge.whenIdle();
  assert.deepEqual(h.created, [{ url: 'https://leetcode.cn/problems/two-sum/', active: false }]);
});

test('new tab waits for its exact pending problem navigation before injecting', async () => {
  const h = harness();
  h.api.tabs.query = async () => [];
  let reads = 0;
  h.api.tabs.get = async () => ++reads === 1
    ? { id: 20, status: 'loading', url: 'about:blank', pendingUrl: 'https://leetcode.cn/problems/two-sum/' }
    : { id: 20, status: 'complete', url: 'https://leetcode.cn/problems/two-sum/' };
  await h.bridge.handle(submit(), sender);
  await h.bridge.whenIdle();
  assert.equal(reads, 2);
  assert.equal(h.messages.at(-1).message.status, 'accepted');
});

test('unknown submit outcome or a closed target never retries the submission POST', async () => {
  for (const failure of ['unknown', 'closed']) {
    const h = harness(async input => {
      if (input.action === 'prepare') return { ok: true, questionId: '1' };
      if (failure === 'closed') throw new Error('target closed');
      return { ok: false, error: '提交状态未确认；未自动重试。' };
    });
    await h.bridge.handle(submit(), sender);
    await h.bridge.whenIdle();
    const final = h.messages.at(-1).message;
    assert.equal(final.status, 'failed');
    assert.match(final.error, /未确认/);
    await h.bridge.handle(submit(), sender);
    assert.equal(h.injections.filter(call => call.args[0].action === 'submit').length, 1);
  }
});

test('short polling timeout retains known submission id/link and does not claim a verdict', async () => {
  const h = harness(async input => input.action === 'prepare' ? { ok: true, questionId: 1 }
    : input.action === 'submit' ? { ok: true, submissionId: 456 } : { ok: true, status: 'pending' });
  await h.bridge.handle(submit(), sender);
  await h.bridge.whenIdle();
  const final = h.messages.at(-1).message;
  assert.equal(final.status, 'failed');
  assert.equal(final.submissionId, '456');
  assert.equal(final.url, 'https://leetcode.cn/submissions/detail/456/');
  assert.match(final.error, /尚未确认/);
  assert.equal(h.injections.filter(call => call.args[0].action === 'submit').length, 1);
});

test('cancellation during POST stops waiting without claiming the server submission was undone', async () => {
  let finishSubmit;
  const h = harness(async input => input.action === 'prepare' ? { ok: true, questionId: 1 }
    : new Promise(resolve => { finishSubmit = resolve; }));
  await h.bridge.handle(submit(), sender);
  while (!finishSubmit) await tick();
  const canceled = await h.bridge.handle({ source: P.APP, version: 1, type: 'LEETCODE_CANCEL', requestId: 'submit-0001' }, sender);
  assert.equal(canceled.status, 'canceled');
  assert.match(canceled.error, /可能已被接收/);
  finishSubmit({ ok: true, submissionId: '456' });
  await h.bridge.whenIdle();
  assert.equal(h.messages.at(-1).message.status, 'canceled');
  assert.equal(h.injections.some(call => call.args[0].action === 'check'), false);
});

test('cancel during initial storage read releases the tab for a new explicit request', async () => {
  const h = harness();
  const original = h.api.storage.session.get;
  let release;
  h.api.storage.session.get = key => {
    const captured = original(key);
    return new Promise(resolve => { release = () => captured.then(resolve); });
  };
  const starting = h.bridge.handle(submit(), sender);
  assert.equal((await h.bridge.handle({ source: P.APP, version: 1, type: 'LEETCODE_CANCEL', requestId: 'submit-0001' }, sender)).status, 'canceled');
  release();
  await starting;
  h.api.storage.session.get = original;
  assert.equal(h.injections.length, 0);
  await h.bridge.handle(submit('submit-0002'), sender);
  await h.bridge.whenIdle();
  assert.equal(h.messages.at(-1).message.status, 'accepted');
});

test('storage failure fails closed before any external action; stored in-flight requests are not replayed', async () => {
  const h = harness();
  h.api.storage.session.get = async () => { throw new Error('unavailable'); };
  assert.equal((await h.bridge.handle(submit(), sender)).status, 'failed');
  assert.equal(h.injections.length, 0);
  const recovered = harness();
  recovered.storage['request:10:submit-0001'] = P.publicStatus('submit-0001', 'two-sum', 'pending', { submissionId: '456' });
  const result = await recovered.bridge.handle(submit(), sender);
  assert.equal(result.status, 'failed');
  assert.equal(result.submissionId, '456');
  assert.equal(recovered.injections.length, 0);
});
