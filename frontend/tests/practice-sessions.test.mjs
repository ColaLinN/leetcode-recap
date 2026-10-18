import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness() {
  const module = { exports: {} };
  const storage = new Map();
  const calls = [];
  let id = 0;
  let route = { kind: 'problem', id: 'sum', groupId: 'a' };
  const source = ts.transpileModule(fs.readFileSync(new URL('../src/practice.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports: module.exports, module, Date,
    crypto: { randomUUID: () => `visit-${++id}` },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    require: name => name === './router' ? { parseRoute: () => route } : { api: async (...args) => calls.push(args) },
  });
  return { ...module.exports, calls, navigate: value => { route = value; } };
}

test('refresh reuses one practice token, navigation ends it, another group starts separately', () => {
  const h = harness();
  const initial = h.practiceSession('a', 'sum');
  assert.equal(h.practiceSession('a', 'sum').id, initial.id);
  h.endPracticeOnNavigation();
  assert.equal(h.calls.length, 0);
  h.navigate({ kind: 'home', groupId: 'a' });
  h.endPracticeOnNavigation();
  assert.equal(h.calls[0][0], `/api/practice-groups/a/sessions/${initial.id}/end`);
  const revisited = h.practiceSession('a', 'sum');
  assert.notEqual(revisited.id, initial.id);
  h.navigate({ kind: 'problem', id: 'sum', groupId: 'b' });
  h.endPracticeOnNavigation();
  const otherGroup = h.practiceSession('b', 'sum');
  assert.notEqual(otherGroup.id, revisited.id);
  assert.equal(h.calls.length, 2);
});

test('timestamps are consistently rendered in Singapore regardless of process timezone', () => {
  const h = harness();
  assert.match(h.fullPracticeTime('2026-10-18T16:01:00+00:00'), /2026\/10\/19 00:01:00/);
  assert.equal(h.practiceTime(null), '尚未练习');
});
