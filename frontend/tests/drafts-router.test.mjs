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
      requests.push({ url, code: JSON.parse(options.body).code, resolve, reject });
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
