import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule(path, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports: module.exports, module, ...globals });
  return module.exports;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function draftHarness() {
  const requests = [];
  const storage = new Map();
  const events = [];
  const drafts = loadModule('../src/drafts.ts', {
    require: () => ({ api: (url, options) => new Promise((resolve, reject) => {
      requests.push({ url, code: JSON.parse(options.body).code, keepalive: options.keepalive, resolve, reject });
    }) }),
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    window: { dispatchEvent: event => events.push(event.type) },
    Event: class { constructor(type) { this.type = type; } },
    Map,
    Promise,
    TextEncoder,
  });
  return { ...drafts, requests, events };
}

test('draft saves serialize and older acknowledgements retain newer recovery', async () => {
  const h = draftHarness();
  h.rememberDraft('first', 'earlier');
  const earlier = h.saveDraft('first', 'earlier');
  await tick();
  h.rememberDraft('first', 'latest');
  const latest = h.saveDraft('first', 'latest');
  await tick();
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve({});
  await earlier;
  await tick();
  assert.equal(h.recoverDraft('first'), 'latest');
  assert.equal(h.requests[1].code, 'latest');
  h.requests[1].resolve({});
  await latest;
  assert.equal(h.recoverDraft('first'), null);
  assert.equal(h.events.length, 2);
});

test('failed save keeps recovery and permits a later retry', async () => {
  const h = draftHarness();
  h.rememberDraft('first', 'unsaved');
  const failed = h.saveDraft('first', 'unsaved');
  await tick();
  h.requests[0].reject(new Error('offline'));
  await assert.rejects(failed, /offline/);
  assert.equal(h.recoverDraft('first'), 'unsaved');
  const retry = h.saveDraft('first', 'unsaved');
  await tick();
  h.requests[1].resolve({});
  await retry;
  assert.equal(h.recoverDraft('first'), null);
});

test('saves for separate problems do not block each other', async () => {
  const h = draftHarness();
  const first = h.saveDraft('first', 'a');
  const second = h.saveDraft('second', 'b');
  await tick();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve({});
  await second;
  h.requests[0].resolve({});
  await first;
});

test('malformed routes stay readable and problem navigation retains chapter context', () => {
  const browser = { location: { hash: '#/problem/%E0%A4%A?chapter=graphs' } };
  const router = loadModule('../src/router.ts', { window: browser, URLSearchParams });
  assert.equal(router.parseRoute().id, '%E0%A4%A');
  assert.equal(router.parseRoute().chapterId, 'graphs');
  router.go('problem', 'two sum', 'arrays');
  assert.equal(browser.location.hash, '#/problem/two%20sum?chapter=arrays');
  router.go('home');
  assert.equal(router.parseRoute().kind, 'home');
});

test('same problem in different groups has separate recovery and save queues', async () => {
  const h = draftHarness();
  h.rememberDraft('same', 'A code', 'group-A');
  h.rememberDraft('same', 'B code', 'group-B');
  const a = h.saveDraft('same', 'A code', 'group-A', 'visit-A');
  const b = h.saveDraft('same', 'B code', 'group-B', 'visit-B');
  await tick();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].url, '/api/problems/same/draft?group_id=group-A');
  assert.equal(h.requests[1].url, '/api/problems/same/draft?group_id=group-B');
  h.requests[0].resolve({});
  await a;
  assert.equal(h.recoverDraft('same', 'group-A'), null);
  assert.equal(h.recoverDraft('same', 'group-B'), 'B code');
  h.requests[1].reject(new Error('offline'));
  await assert.rejects(b, /offline/);
  assert.equal(h.recoverDraft('same', 'group-B'), 'B code');
});

test('all navigation preserves the chosen practice group and allows explicit switching', () => {
  const browser = { location: { hash: '#/problem/two-sum?chapter=arrays&group=round-A' } };
  const router = loadModule('../src/router.ts', { window: browser, URLSearchParams });
  router.go('chapter', 'strings');
  assert.equal(router.parseRoute().groupId, 'round-A');
  router.go('home');
  assert.equal(browser.location.hash, '#/?group=round-A');
  router.go('problem', 'two-sum', 'arrays', 'round-B');
  assert.equal(router.parseRoute().groupId, 'round-B');
  assert.equal(router.parseRoute().chapterId, 'arrays');
});

test('legacy recovery is migrated only to the original group', () => {
  const storage = new Map([['recap:recovery:sum', 'old unsaved code']]);
  const h = loadModule('../src/drafts.ts', {
    require: () => ({ api: async () => ({}) }),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    Map, Promise,
  });
  assert.equal(h.recoverDraft('sum', 'new-round'), null);
  assert.equal(h.recoverDraft('sum', 'original'), 'old unsaved code');
  assert.equal(storage.get('recap:recovery:original:sum'), 'old unsaved code');
  assert.equal(storage.has('recap:recovery:sum'), false);
});

test('navigation flush respects the browser keepalive byte budget without dropping large drafts', async () => {
  const h = draftHarness();
  const small = h.saveDraft('small', 'code', 'a', 'visit', true);
  const large = h.saveDraft('large', '你'.repeat(25000), 'a', 'visit', true);
  const regular = h.saveDraft('regular', 'x'.repeat(100000), 'a', 'visit');
  await tick();
  assert.equal(h.requests[0].keepalive, true);
  assert.equal(h.requests[1].keepalive, false);
  assert.equal(h.requests[2].keepalive, false);
  assert.equal(h.requests[1].code.length, 25000);
  h.requests.forEach(request => request.resolve({}));
  await Promise.all([small, large, regular]);
});
