import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const module = { exports: {} };
const source = ts.transpileModule(fs.readFileSync(new URL('../src/errorDiagnostics.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, { exports: module.exports, module });
const { caseDiagnostic, createErrorDiagnostics, executionDiagnostics } = module.exports;
const plain = value => JSON.parse(JSON.stringify(value));

function harness(code) {
  const markers = [];
  const decorations = [];
  const navigations = [];
  let contentListener;
  let modelListener;
  const model = {
    code,
    getValue() { return this.code; },
    getLineCount() { return this.code.split('\n').length; },
    getLineMaxColumn(line) { return this.code.split('\n')[line - 1].length + 1; },
    getLineFirstNonWhitespaceColumn(line) { return this.code.split('\n')[line - 1].search(/\S/) + 1; },
    isDisposed: () => false,
  };
  const editor = {
    getModel: () => model,
    createDecorationsCollection: () => ({
      clear: () => decorations.push([]),
      set: value => decorations.push(value),
    }),
    onDidChangeModelContent: listener => {
      contentListener = listener;
      return { dispose() { contentListener = null; } };
    },
    onDidChangeModel: listener => {
      modelListener = listener;
      return { dispose() { modelListener = null; } };
    },
    revealRangeInCenter: (range, scroll) => navigations.push(['reveal', plain(range), scroll]),
    setSelection: range => navigations.push(['selection', plain(range)]),
    focus: () => navigations.push(['focus']),
  };
  const monaco = {
    MarkerSeverity: { Error: 8 },
    editor: { ScrollType: { Smooth: 0 }, setModelMarkers: (model, owner, value) => markers.push({ model, owner, value: plain(value) }) },
  };
  const controller = createErrorDiagnostics(monaco, editor);
  return {
    controller, model, markers, decorations, navigations,
    edit(value) { model.code = value; contentListener?.(); },
    getListeners: () => [contentListener, modelListener],
  };
}

const failingCase = location => ({
  status: 'Runtime Error', error: 'NameError: missing', errorLocation: location,
});
const snapshot = (code, cases) => ({ code, result: { results: cases } });

test('runtime errors become deduplicated markers and a whole error line without taking focus', () => {
  const code = 'class Solution:\n    missing()';
  const h = harness(code);
  const failure = failingCase({ line: 2, column: 5, endColumn: 12 });
  h.controller.update(snapshot(code, [failure, failure]));
  assert.equal(executionDiagnostics(snapshot(code, [failure, failure])).length, 1);
  assert.equal(h.markers.at(-1).owner, 'recap-execution');
  assert.deepEqual(h.markers.at(-1).value, [{
    startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 12,
    message: 'NameError: missing', severity: 8, source: 'Python 运行',
  }]);
  assert.equal(h.decorations.at(-1)[0].options.isWholeLine, true);
  assert.equal(h.navigations.length, 0);
});

test('editing after execution immediately clears markers and blocks stale navigation', () => {
  const code = 'value = missing';
  const h = harness(code);
  const failure = failingCase({ line: 1 });
  h.controller.update(snapshot(code, [failure]));
  assert.equal(h.markers.at(-1).value.length, 1);
  h.edit('value = 1');
  assert.deepEqual(h.markers.at(-1).value, []);
  assert.deepEqual(h.decorations.at(-1), []);
  assert.equal(h.controller.navigate(caseDiagnostic(failure), code), false);
  assert.equal(h.navigations.length, 0);
});

test('an execution response arriving after an edit cannot mark the new source', () => {
  const sent = 'return 1 / 0';
  const h = harness(sent);
  h.edit('return 1');
  h.controller.update(snapshot(sent, [failingCase({ line: 1, column: 8 })]));
  assert.equal(h.markers.some(call => call.value.length > 0), false);
  assert.equal(h.decorations.flat().length, 0);
});

test('restoring matching source permits navigation with UTF-16 columns and no source rewrite', () => {
  const code = '"😀"; missing';
  const h = harness(code);
  const diagnostic = caseDiagnostic(failingCase({ line: 1, column: 7, endColumn: 14 }));
  assert.equal(h.controller.navigate(diagnostic, code), true);
  const range = { startLineNumber: 1, startColumn: 7, endLineNumber: 1, endColumn: 14 };
  assert.deepEqual(h.navigations, [['reveal', range, 0], ['selection', range], ['focus']]);
  assert.equal(h.model.code, code);
});

test('wrong answers and unavailable positions do not get invented error locations', () => {
  assert.equal(caseDiagnostic({ ...failingCase({ line: 1 }), status: 'Wrong Answer' }), null);
  assert.equal(caseDiagnostic({ status: 'Runtime Error', error: 'internal error' }), null);
  for (const line of [0, -1, 1.5, NaN]) assert.equal(caseDiagnostic(failingCase({ line })), null);
  const h = harness('x = 1');
  h.controller.update(snapshot('x = 1', [failingCase({ line: 99 })]));
  assert.deepEqual(h.markers.at(-1).value, []);
  assert.equal(h.controller.navigate(caseDiagnostic(failingCase({ line: 99 })), 'x = 1'), false);
});

test('output-limit errors with a user-code location can mark and navigate to the printing line', () => {
  const code = 'print("too much output")';
  const h = harness(code);
  const failure = { ...failingCase({ line: 1, column: 1, endColumn: 6 }), status: 'Output Limit Exceeded', error: 'stdout limit exceeded' };
  h.controller.update(snapshot(code, [failure]));
  assert.equal(h.markers.at(-1).value.length, 1);
  assert.equal(h.markers.at(-1).value[0].message, 'stdout limit exceeded');
  assert.equal(h.controller.navigate(caseDiagnostic(failure), code), true);
  assert.equal(h.navigations.at(-1)[0], 'focus');
  for (const status of ['Output Limit Exceeded', 'Time Limit Exceeded', 'Wrong Answer']) {
    assert.equal(caseDiagnostic({ status, error: 'limit exceeded' }), null);
  }
});

test('missing columns highlight the source line while overlong ranges stay inside the model', () => {
  const code = 'def solve():\n    missing';
  const h = harness(code);
  h.controller.update(snapshot(code, [failingCase({ line: 2 })]));
  assert.deepEqual(h.markers.at(-1).value[0], {
    startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 12,
    message: 'NameError: missing', severity: 8, source: 'Python 运行',
  });
  h.controller.update(snapshot(code, [failingCase({ line: 2, column: 99, endLine: 99, endColumn: 999 })]));
  const range = h.markers.at(-1).value[0];
  assert.equal(range.startColumn, 12);
  assert.equal(range.endColumn, 12);
  assert.equal(range.endLineNumber, 2);
  h.controller.dispose();
  assert.deepEqual(h.markers.at(-1).value, []);
  assert.deepEqual(h.decorations.at(-1), []);
  assert.deepEqual(h.getListeners(), [null, null]);
});
