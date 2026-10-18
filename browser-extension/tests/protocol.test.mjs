import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../protocol.js';

const protocol = globalThis.RecapLeetCodeProtocol;
const request = { source: protocol.APP, version: 1, type: 'LEETCODE_SUBMIT', requestId: 'request-0001',
  payload: { slug: 'two-sum', code: 'class Solution: pass', language: 'python3' } };

test('only explicit loopback HTTP origins and the three supported ports are trusted', () => {
  for (const host of ['localhost', '127.0.0.1']) for (const port of ['8765', '8766', '5173']) {
    assert.equal(protocol.localOrigin(`http://${host}:${port}/#/problem/two-sum`), `http://${host}:${port}`);
  }
  for (const url of ['http://localhost:9999/', 'http://localhost/', 'https://localhost:8765/',
    'http://127.0.0.2:8765/', 'http://localhost.evil.example:8765/', 'http://user@localhost:8765/',
    'https://leetcode.cn/problems/two-sum/', 'null']) assert.equal(protocol.localOrigin(url), null, url);
});

test('request payload cannot choose a host, language, endpoint, or unsafe slug', () => {
  assert.equal(protocol.validRequest(request), true);
  for (const slug of ['../two-sum', 'two-sum?x=1', 'two-sum/submit', 'two%2fsum', 'Two-Sum', '', 'a'.repeat(201)]) {
    assert.equal(protocol.validRequest({ ...request, payload: { ...request.payload, slug } }), false);
  }
  for (const payload of [{ ...request.payload, language: 'javascript' }, { ...request.payload, url: 'https://evil.example/' },
    { ...request.payload, code: ' ' }, { ...request.payload, code: 'x'.repeat(100001) }]) {
    assert.equal(protocol.validRequest({ ...request, payload }), false);
  }
  assert.equal(protocol.validRequest({ ...request, source: 'other' }), false);
  assert.equal(protocol.validRequest({ ...request, version: 2 }), false);
  assert.equal(protocol.validRequest({ ...request, requestId: 'short' }), false);
  assert.equal(protocol.validRequest({ ...request, arbitraryUrl: 'https://evil.example' }), false);
});

test('public responses discard credentials and only derive official safe links', () => {
  const response = protocol.publicStatus(request.requestId, 'two-sum', 'failed', {
    submissionId: 123, cookie: 'secret', token: 'secret', code: 'secret', error: '查看提交记录',
  });
  assert.equal(response.submissionId, '123');
  assert.equal(response.url, 'https://leetcode.cn/submissions/detail/123/');
  assert.equal(JSON.stringify(response).includes('secret'), false);
  const clean = protocol.publicResponse({ ...response, csrf: 'secret', cookie: 'secret', data: { token: 'secret' } });
  assert.equal(JSON.stringify(clean).includes('secret'), false);
  assert.equal(protocol.publicResponse({ ...response, url: 'https://leetcode.cn.evil.example/' }), null);
  assert.equal(protocol.submissionId(-1), null);
  assert.equal(protocol.submissionId('123/else'), null);
});

function contentHarness(url = 'http://localhost:8765/') {
  const sent = [], posted = [], listeners = {};
  const window = { postMessage: (message, origin) => posted.push({ message, origin }),
    addEventListener: (name, callback) => { listeners[name] = callback; } };
  window.top = window;
  const context = { window, location: new URL(url), URL, Set, chrome: { runtime: { id: 'extension-id',
    onMessage: { addListener: callback => { listeners.runtime = callback; } },
    sendMessage: async message => { sent.push(message); return { source: protocol.EXTENSION, version: 1,
      type: 'LEETCODE_PONG', requestId: message.requestId, status: 'ready', browser: 'chrome', extensionVersion: '1.0.0' }; },
  } } };
  vm.createContext(context);
  for (const file of ['protocol.js', 'content.js']) vm.runInContext(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
  return { window, context, listeners, sent, posted };
}

test('content bridge checks window identity/origin, deduplicates, and only reports a real extension pong', async () => {
  const h = contentHarness();
  const ping = { source: protocol.APP, version: 1, type: 'LEETCODE_PING', requestId: 'ping-00001' };
  h.listeners.message({ source: {}, origin: 'http://localhost:8765', data: ping });
  h.listeners.message({ source: h.window, origin: 'http://localhost:9999', data: ping });
  assert.equal(h.sent.length, 0);
  h.listeners.message({ source: h.window, origin: 'http://localhost:8765', data: ping });
  h.listeners.message({ source: h.window, origin: 'http://localhost:8765', data: ping });
  await Promise.resolve();
  assert.equal(h.sent.length, 1);
  assert.equal(h.posted[0].message.status, 'ready');
  assert.equal(h.posted[0].origin, 'http://localhost:8765');
  const bad = contentHarness('http://localhost:9999/');
  assert.equal(bad.listeners.message, undefined);
});

test('manifest grants only the required site and APIs without cookies or external connectivity', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['scripting', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://leetcode.cn/*']);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.content_scripts[0].all_frames, false);
});

test('invalid submission payload reports an explicit UI error without forwarding to the worker', () => {
  const h = contentHarness();
  h.listeners.message({ source: h.window, origin: 'http://localhost:8765', data: {
    ...request, payload: { ...request.payload, code: '   ' },
  } });
  assert.equal(h.sent.length, 0);
  assert.equal(h.posted[0].message.status, 'failed');
  assert.equal(h.posted[0].message.requestId, request.requestId);
});
