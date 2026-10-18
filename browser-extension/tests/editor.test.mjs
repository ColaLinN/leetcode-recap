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
