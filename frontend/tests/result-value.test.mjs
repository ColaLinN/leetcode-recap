import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function loadModule(file, imports = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    exports: module.exports, module,
    require: name => name.endsWith('.css') ? {} : imports[name] ?? require(name),
  });
  return module.exports;
}
const formatter = loadModule('../src/resultValueFormatting.ts');
const { RESULT_PREVIEW_CHARACTERS, presentResultValue, copyResultValue } = formatter;
const { default: ResultValue } = loadModule('../src/ResultValue.tsx', { './resultValueFormatting': formatter });

function subsets(values) {
  return values.reduce((result, value) => [...result, ...result.map(previous => [...previous, value])], [[]]);
}

test('nested small arrays stay compact, preserving values and order', () => {
  const value = [[], [-1], [3, -1], [10, 3, -1]];
  const result = presentResultValue(value);
  assert.equal(result.text, '[[], [-1], [3, -1], [10, 3, -1]]');
  assert.equal(result.preview, result.text);
  assert.equal(result.truncated, false);
  assert.deepEqual(JSON.parse(result.text), value);
});

test('medium outputs no longer switch to one number per indented line', () => {
  const value = Array.from({ length: 80 }, (_, index) => index);
  const result = presentResultValue(value);
  assert.ok(result.text.length > 160);
  assert.equal(result.text.includes('\n'), false);
  assert.equal(result.truncated, false);
  assert.deepEqual(JSON.parse(result.text), value);
});

test('64 subsets get an explicit bounded preview without mutating source data', () => {
  const value = subsets([-1, 3, 10, 2, 8, -7]);
  const before = JSON.stringify(value);
  const result = presentResultValue(value);
  assert.equal(value.length, 64);
  assert.equal(result.summary, '64 项');
  assert.equal(result.truncated, true);
  assert.ok(result.preview.length <= RESULT_PREVIEW_CHARACTERS + 2);
  assert.equal(result.preview.endsWith('\n…'), true);
  assert.equal(result.text.includes('\n'), false);
  assert.deepEqual(JSON.parse(result.text), value);
  assert.equal(JSON.stringify(value), before);
});

test('copying a collapsed value writes complete valid JSON rather than a preview', async () => {
  const value = subsets([-1, 3, 10, 2, 8, -7]);
  const presentation = presentResultValue(value);
  const writes = [];
  assert.equal(await copyResultValue(presentation, async text => writes.push(text)), true);
  assert.deepEqual(writes, [JSON.stringify(value)]);
  assert.deepEqual(JSON.parse(writes[0]), value);
  assert.notEqual(writes[0], presentation.preview);
  assert.equal(writes[0].includes('…'), false);
});

test('objects, punctuation inside strings, escapes, null and unavailable values remain correct', async () => {
  const value = { 'quoted:key': ['comma, colon: "quotes" and \\ escapes', null], empty: {}, bool: false };
  const result = presentResultValue(value);
  assert.deepEqual(JSON.parse(result.text), value);
  assert.equal(result.text.includes('comma, colon: "quotes"'), false); // JSON quotes remain escaped.
  assert.equal(result.summary, '3 个字段');
  assert.equal(presentResultValue('a,b:c').text, '"a,b:c"');
  assert.equal(presentResultValue(null).text, 'null');
  const absent = presentResultValue(undefined);
  assert.equal(absent.text, '—');
  assert.equal(absent.copyText, null);
  assert.equal(await copyResultValue(absent, async () => assert.fail('missing data must not be copied')), false);
  await assert.rejects(copyResultValue(result, async () => { throw new Error('clipboard denied'); }), /clipboard denied/);
});

test('the preview boundary does not leave a broken surrogate pair', () => {
  const result = presentResultValue('ab😀tail', 4);
  assert.equal(result.preview, '"ab\n…');
  assert.equal(JSON.parse(result.copyText), 'ab😀tail');
});

test('rendered long output starts collapsed and advertises full copy and expansion', () => {
  const value = subsets([-1, 3, 10, 2, 8, -7]);
  const html = renderToStaticMarkup(React.createElement(ResultValue, { value, label: '实际输出' }));
  assert.match(html, /预览 · 64 项/);
  assert.match(html, /aria-label="复制实际输出的完整 JSON"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /展开全部/);
  assert.match(html, /result-value-code preview/);
  assert.equal(html.includes('[-1, 3, 10, 2, 8, -7]]'), false); // The final subset is outside the rendered preview.
});

test('small values have no expansion control and wrong answers retain error styling', () => {
  const html = renderToStaticMarkup(React.createElement(ResultValue, { value: [1, 2], label: '实际输出', error: true }));
  assert.match(html, /value-error/);
  assert.match(html, /\[1, 2\]/);
  assert.equal(html.includes('展开全部'), false);
  assert.equal(html.includes('result-value-preview-label'), false);
});
