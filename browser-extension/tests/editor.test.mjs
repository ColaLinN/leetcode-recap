import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { pageTask } from '../page-task.js';
import { editorFixture } from './editor-fixture.mjs';

function harness(options) {
  const fixture = editorFixture(options);
  const calls = [];
  const context = { ...fixture.context, location: { origin: 'https://leetcode.cn', pathname: '/problems/two-sum/description/' },
    AbortController, setTimeout, clearTimeout, fetch: async (...args) => { calls.push(args); throw new Error('unexpected fetch'); } };
  vm.createContext(context);
  const run = vm.runInContext(`(${pageTask.toString()})`, context);
  return { ...fixture, calls, context, run: (action, extra = {}) => run({ action, slug: 'two-sum', code: '# replacement',
    editorModelUri: fixture.model.uri.toString(), editorModelVersion: fixture.state.version, ...extra }) };
}

test('sync binds the unique visible editor, writes source as data, and confirms full readback without cookie/network', async () => {
  const h = harness();
  const code = 'class Solution:\n    def solve(self):\n        return "` ${window.secret} </script> 😀"\n';
  const result = await h.run('editor-sync', { code });
  assert.equal(result.ok, true);
  assert.equal(result.editorSynced, true);
  assert.equal(h.state.value, code);
  assert.equal(h.state.writes, 1);
  assert.equal(h.state.cookieReads, 0);
  assert.equal(h.calls.length, 0);
});

test('standard Monaco python language is supported when the selector explicitly confirms Python3', async () => {
  const h = harness({ language: 'python', label: 'Python3' });
  assert.equal((await h.run('editor-status')).python3, true);
  assert.equal((await h.run('editor-sync')).editorSynced, true);
  assert.equal(h.state.writes, 1);
  assert.equal(h.calls.length, 0);
});

test('Python model alone does not establish Python3; language changes only through the bound dialog', async () => {
  const h = harness({ language: 'python', label: 'Python' });
  assert.equal((await h.run('editor-sync')).ok, false);
  assert.equal(h.state.writes, 0);
  await h.run('editor-open-language');
  await h.run('editor-choose-python3');
  assert.equal(h.state.languageClicks, 1);
  assert.equal((await h.run('editor-status')).python3, true);
  assert.equal((await h.run('editor-sync')).editorSynced, true);
});

test('observed LeetCode Python3 model language is confirmed and synchronizes through the real page task', async () => {
  // Read-only live metadata: the language button is Python3 and the visible
  // editor's containing element carries data-mode-id="python3". No live code,
  // account data, or credentials are needed to replay this language contract.
  const h = harness({ language: 'python3', label: 'Python3' });
  const status = await h.run('editor-status');
  assert.equal(status.ok, true);
  assert.equal(status.languageSelected, true);
  assert.equal(status.python3, true, 'the observed Python3 button/model pair must pass the worker readiness gate');
  const code = 'class Solution:\n    pass\n';
  const synced = await h.run('editor-sync', { code });
  assert.equal(synced.ok, true);
  assert.equal(synced.editorSynced, true);
  assert.equal(h.state.value, code);
  assert.equal(h.state.writes, 1);
  assert.equal(h.state.cookieReads, 0);
  assert.equal(h.calls.length, 0);
});

test('a Python3 model id still requires an explicitly selected Python3 button', async () => {
  const h = harness({ language: 'python3', label: 'Python' });
  assert.equal((await h.run('editor-status')).python3, false);
  assert.equal((await h.run('editor-sync')).ok, false);
  assert.equal(h.state.writes, 0);
  assert.equal(h.state.cookieReads, 0);
  assert.equal(h.calls.length, 0);
});

test('unrelated model language ids cannot pass a Python3 button or cause writes', async () => {
  for (const language of ['plaintext', 'javascript', 'cpp']) {
    const h = harness({ language, label: 'Python3' });
    assert.equal((await h.run('editor-status')).python3, false, language);
    assert.equal((await h.run('editor-sync')).ok, false, language);
    assert.equal(h.state.writes, 0, language);
    assert.equal(h.state.cookieReads, 0, language);
    assert.equal(h.calls.length, 0, language);
  }
});

test('ambiguous visible editor, readonly model, or missing public API fails without writes', async () => {
  const ambiguous = harness();
  ambiguous.document.querySelectorAll = selector => selector === '.monaco-editor' ? [ambiguous.root, ambiguous.root] : [ambiguous.control];
  assert.equal((await ambiguous.run('editor-sync')).ok, false);
  const readonly = harness({ readOnly: true });
  assert.equal((await readonly.run('editor-sync')).ok, false);
  const noApi = harness();
  noApi.context.monaco = undefined;
  assert.equal((await noApi.run('editor-sync')).ok, false);
  for (const h of [ambiguous, readonly, noApi]) { assert.equal(h.state.writes, 0); assert.equal(h.calls.length, 0); }
});

test('stale URI/version and a mismatched readback cannot be confirmed or submitted', async () => {
  const h = harness();
  assert.equal((await h.run('editor-sync', { editorModelUri: 'inmemory://other-problem' })).ok, false);
  assert.equal((await h.run('editor-sync', { editorModelVersion: 999 })).ok, false);
  assert.equal(h.state.writes, 0);
  h.editor.executeEdits = () => { h.state.writes++; h.state.value = '# truncated'; return true; };
  const failed = await h.run('editor-sync');
  assert.equal(failed.ok, false);
  assert.equal(failed.editorSynced, undefined);
  assert.equal((await h.run('submit', { questionId: '1' })).ok, false);
  assert.equal(h.calls.length, 0);
});

test('user edits or language changes after confirmed sync block POST without overwriting again', async () => {
  const h = harness();
  assert.equal((await h.run('editor-sync')).editorSynced, true);
  h.state.value = '# user edited after sync';
  assert.equal((await h.run('submit', { questionId: '1' })).ok, false);
  h.state.value = '# replacement'; h.control.textContent = 'JavaScript';
  assert.equal((await h.run('submit', { questionId: '1' })).ok, false);
  assert.equal(h.state.writes, 1);
  assert.equal(h.calls.length, 0);
});
