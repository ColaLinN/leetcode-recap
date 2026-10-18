import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const plain = value => JSON.parse(JSON.stringify(value));

function harness() {
  const requests = [];
  const providers = {};
  const removed = [];
  const monaco = {
    languages: {
      CompletionItemKind: { Function: 1, Class: 2, Module: 3, Keyword: 4, Property: 5, Variable: 6 },
      registerCompletionItemProvider(language, provider) {
        assert.equal(language, 'python');
        providers.completion = provider;
        return { dispose: () => removed.push('completion') };
      },
      registerSignatureHelpProvider(language, provider) {
        assert.equal(language, 'python');
        providers.signature = provider;
        return { dispose: () => removed.push('signature') };
      },
    },
  };
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(new URL('../src/pythonCompletion.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    exports: module.exports, module, AbortController, setTimeout, clearTimeout,
    fetch: (url, options) => new Promise((resolve, reject) => {
      requests.push({
        url,
        body: JSON.parse(options.body),
        signal: options.signal,
        succeed: value => resolve({ ok: true, json: async () => value }),
        fail: reject,
      });
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }),
  });
  const registration = module.exports.registerPythonLanguageFeatures(monaco);
  return { requests, providers, removed, monaco, registration };
}

function model(code) {
  return {
    version: 1,
    disposed: false,
    getValue: () => code,
    getLineContent: line => code.split(/\r\n|\n|\r/)[line - 1],
    getVersionId() { return this.version; },
    isDisposed() { return this.disposed; },
  };
}

function token() {
  const listeners = new Set();
  return {
    isCancellationRequested: false,
    disposedListeners: 0,
    onCancellationRequested(listener) {
      listeners.add(listener);
      return { dispose: () => { listeners.delete(listener); this.disposedListeners++; } };
    },
    cancel() {
      this.isCancellationRequested = true;
      for (const listener of listeners) listener();
    },
  };
}

const suggestion = {
  label: 'append', insertText: 'append', type: 'function', detail: 'def append', startColumn: 1, endColumn: 3,
};

test('completion preserves API UTF-16 ranges for Unicode and a cursor inside a word', async () => {
  const h = harness();
  const line = '"😀"; 数据.append';
  const document = model(`数据 = []\r\n${line}`);
  const position = { lineNumber: 2, column: line.indexOf('append') + 3 };
  const cancellation = token();
  const pending = h.providers.completion.provideCompletionItems(document, position, {}, cancellation);
  const range = { startColumn: line.indexOf('append') + 1, endColumn: line.length + 1 };
  assert.equal(h.requests[0].url, '/api/editor/completions');
  assert.deepEqual(h.requests[0].body, { code: document.getValue(), line: 2, column: position.column });
  h.requests[0].succeed({ suggestions: [{ ...suggestion, ...range }] });
  const result = await pending;
  assert.equal(result.incomplete, true);
  const item = result.suggestions[0];
  assert.equal(item.kind, h.monaco.languages.CompletionItemKind.Function);
  assert.equal(item.detail, 'def append');
  assert.deepEqual(plain(item.range), { startLineNumber: 2, endLineNumber: 2, ...range });
  assert.equal(line.slice(0, item.range.startColumn - 1) + item.insertText + line.slice(item.range.endColumn - 1), line);
  assert.equal(cancellation.disposedListeners, 1);
  h.registration.dispose();
});

test('completion discards responses after document edits, document disposal, or provider disposal', async t => {
  for (const change of ['edit', 'document disposal', 'provider disposal']) {
    await t.test(change, async () => {
      const h = harness();
      const document = model('append\nap');
      const pending = h.providers.completion.provideCompletionItems(document, { lineNumber: 2, column: 3 }, {}, token());
      if (change === 'edit') document.version++;
      if (change === 'document disposal') document.disposed = true;
      if (change === 'provider disposal') h.registration.dispose();
      h.requests[0].succeed({ suggestions: [suggestion] });
      assert.deepEqual(plain(await pending), { suggestions: [] });
      if (change !== 'provider disposal') h.registration.dispose();
      assert.deepEqual(h.removed, ['completion', 'signature']);
    });
  }
});

test('cancellation aborts fetch and suppresses document-word fallback', async () => {
  const h = harness();
  const cancellation = token();
  const pending = h.providers.completion.provideCompletionItems(model('append\nap'), { lineNumber: 2, column: 3 }, {}, cancellation);
  assert.equal(h.requests[0].signal.aborted, false);
  cancellation.cancel();
  assert.equal(h.requests[0].signal.aborted, true);
  assert.deepEqual(plain(await pending), { suggestions: [] });
  assert.equal(cancellation.disposedListeners, 1);
  h.registration.dispose();
});

test('an already canceled request never fetches or falls back', async () => {
  const h = harness();
  const cancellation = token();
  cancellation.cancel();
  const result = await h.providers.completion.provideCompletionItems(model('append\nap'), { lineNumber: 2, column: 3 }, {}, cancellation);
  assert.deepEqual(plain(result), { suggestions: [] });
  assert.equal(h.requests.length, 0);
  assert.equal(cancellation.disposedListeners, 1);
  h.registration.dispose();
});

test('offline fallback replaces the whole Unicode identifier and deduplicates document names', async () => {
  const h = harness();
  const line = '"😀"; 数据列表';
  const document = model(`数据集合 = []\n数据集合\n${line}`);
  const pending = h.providers.completion.provideCompletionItems(document, { lineNumber: 3, column: line.indexOf('数据') + 3 }, {}, token());
  h.requests[0].fail(new Error('offline'));
  const result = await pending;
  const candidates = result.suggestions.filter(item => item.label === '数据集合');
  assert.equal(candidates.length, 1);
  const item = candidates[0];
  assert.equal(item.kind, h.monaco.languages.CompletionItemKind.Variable);
  assert.deepEqual(plain(item.range), { startLineNumber: 3, endLineNumber: 3, startColumn: line.indexOf('数据') + 1, endColumn: line.length + 1 });
  assert.equal(line.slice(0, item.range.startColumn - 1) + item.insertText + line.slice(item.range.endColumn - 1), '"😀"; 数据集合');
  h.registration.dispose();
});

test('signature provider forwards signature and active parameter data', async () => {
  const h = harness();
  assert.deepEqual(plain(h.providers.completion.triggerCharacters), ['.']);
  assert.deepEqual(plain(h.providers.signature.signatureHelpTriggerCharacters), ['(', ',']);
  const document = model('max(1, ');
  const cancellation = token();
  const pending = h.providers.signature.provideSignatureHelp(document, { lineNumber: 1, column: 8 }, cancellation);
  assert.equal(h.requests[0].url, '/api/editor/signatures');
  const value = { signatures: [{ label: 'max(a, b)', parameters: [{ label: 'a' }, { label: 'b' }] }], activeSignature: 0, activeParameter: 1 };
  h.requests[0].succeed(value);
  const result = await pending;
  assert.deepEqual(plain(result.value), value);
  assert.equal(typeof result.dispose, 'function');
  result.dispose();
  assert.equal(cancellation.disposedListeners, 1);
  h.registration.dispose();
});

test('signature help ignores empty, stale, and canceled responses', async t => {
  for (const change of ['empty', 'edit', 'disposal', 'cancel']) {
    await t.test(change, async () => {
      const h = harness();
      const document = model('max(');
      const cancellation = token();
      const pending = h.providers.signature.provideSignatureHelp(document, { lineNumber: 1, column: 5 }, cancellation);
      if (change === 'edit') document.version++;
      if (change === 'disposal') document.disposed = true;
      if (change === 'cancel') cancellation.cancel();
      h.requests[0].succeed({ signatures: change === 'empty' ? [] : [{ label: 'max(a, b)', parameters: [] }], activeSignature: 0, activeParameter: 0 });
      assert.equal(await pending, null);
      h.registration.dispose();
    });
  }
});
