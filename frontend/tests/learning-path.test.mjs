import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const module = { exports: {} };
const source = ts.transpileModule(fs.readFileSync(new URL('../src/learningPath.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, { exports: module.exports, module });
const { buildLearningParts, learningPartForChapter, activeLearningPart, expandActivePart } = module.exports;
const plain = value => JSON.parse(JSON.stringify(value));

function catalog() {
  return {
    chapters: [
      { id: 'arrays', title: '数组', group: '数据结构', problemIds: ['shared', 'array', 'array', 'missing'] },
      { id: 'binary-search', title: '二分查找', group: '算法', problemIds: ['shared', 'search'] },
      { id: 'trie', title: '字典树', group: '数据结构', problemIds: ['trie', 'shared'] },
      { id: 'dp', title: '动态规划', group: '算法', problemIds: ['dp', 'shared'] },
    ],
    problems: ['shared', 'array', 'trie', 'search', 'dp'].map(id => ({ id })),
    progress: { shared: { accepted: true }, array: { accepted: false }, dp: { accepted: true }, missing: { accepted: true } },
  };
}

test('learning path orders its two major parts and preserves topic order and identity', () => {
  const data = catalog();
  const parts = buildLearningParts(data);
  assert.deepEqual(plain(parts.map(part => part.id)), ['数据结构', '算法']);
  assert.equal(parts[0].label, '第一部分');
  assert.equal(parts[1].label, '第二部分');
  assert.deepEqual(plain(parts[0].chapters.map(chapter => chapter.id)), ['arrays', 'trie']);
  assert.deepEqual(plain(parts[1].chapters.map(chapter => chapter.id)), ['binary-search', 'dp']);
  assert.equal(parts[0].chapters[0], data.chapters[0]);
});

test('part statistics count real distinct problems and accepted progress once per part', () => {
  const parts = buildLearningParts(catalog());
  assert.deepEqual(plain(parts[0].problemIds), ['shared', 'array', 'trie']);
  assert.deepEqual(plain(parts[1].problemIds), ['shared', 'search', 'dp']);
  assert.equal(parts[0].completed, 1);
  assert.equal(parts[1].completed, 2);
  assert.equal(parts[0].problemIds.includes('missing'), false);
});

test('an empty part is omitted without moving the other part into its place', () => {
  const data = catalog();
  data.chapters = data.chapters.filter(chapter => chapter.group === '算法');
  const parts = buildLearningParts(data);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].id, '算法');
  assert.equal(parts[0].number, '02');
  assert.equal(buildLearningParts({ ...data, chapters: [] }).length, 0);
});

test('topic pages resolve their containing major part without changing route identifiers', () => {
  const data = catalog();
  assert.equal(learningPartForChapter(data.chapters[2]).id, '数据结构');
  assert.equal(activeLearningPart(data, { kind: 'chapter', id: 'dp' }).id, '算法');
  assert.equal(activeLearningPart(data, { kind: 'chapter', id: 'unknown' }), undefined);
  assert.equal(activeLearningPart(data, { kind: 'notes' }), undefined);
});

test('shared-problem routes retain valid topic context and reject unrelated topic context', () => {
  const data = catalog();
  assert.equal(activeLearningPart(data, { kind: 'problem', id: 'shared', chapterId: 'dp' }).id, '算法');
  assert.equal(activeLearningPart(data, { kind: 'problem', id: 'shared' }).id, '数据结构');
  assert.equal(activeLearningPart(data, { kind: 'problem', id: 'trie', chapterId: 'dp' }).id, '数据结构');
  assert.equal(activeLearningPart(data, { kind: 'problem', id: 'search', chapterId: 'removed' }).id, '算法');
  assert.equal(activeLearningPart(data, { kind: 'problem', id: 'unknown' }), undefined);
});

test('navigation expands the active part while preserving the other part and manual choices', () => {
  const closed = { 数据结构: false, 算法: false };
  const opened = expandActivePart(closed, '算法');
  assert.deepEqual(plain(opened), { 数据结构: false, 算法: true });
  assert.deepEqual(closed, { 数据结构: false, 算法: false });
  assert.equal(expandActivePart(opened, '算法'), opened);
  assert.equal(expandActivePart(opened, undefined), opened);
  assert.equal(expandActivePart(opened, 'unknown'), opened);
});
