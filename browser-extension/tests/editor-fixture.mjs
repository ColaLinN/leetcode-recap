export function editorFixture({ code = '# original', language = 'python3', label = 'Python3', readOnly = false } = {}) {
  let menuOpen = false;
  const state = { value: code, version: 1, writes: 0, cookieReads: 0, languageClicks: 0 };
  const element = (properties = {}) => ({ isConnected: true, children: [], textContent: '',
    closest: () => null, getBoundingClientRect: () => ({ width: 500, height: 300 }), ...properties });
  const textarea = element({ readOnly, disabled: false, getAttribute: () => null });
  const root = element({ querySelector: () => textarea });
  const hidden = element({ closest: () => ({ hidden: true }) });
  const control = element({ textContent: label, getAttribute: name => name === 'aria-controls' ? 'language-dialog' : null,
    click: () => { menuOpen = true; } });
  const python = element({ textContent: 'Python3', click: () => {
    state.languageClicks++; control.textContent = 'Python3'; model.language = 'python3'; state.version++; menuOpen = false;
  } });
  const dialog = element({ getBoundingClientRect: () => ({ width: menuOpen ? 300 : 0, height: 200 }),
    querySelectorAll: () => [python] });
  const model = { language, uri: { toString: () => 'inmemory://leetcode/two-sum/code' }, isDisposed: () => false,
    getLanguageId() { return this.language; }, getVersionId: () => state.version,
    getValue: () => state.value, getFullModelRange: () => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 }),
    getEOL: () => '\n', pushEOL: () => {} };
  const editor = { getDomNode: () => root, getModel: () => model, getRawOptions: () => ({ readOnly }),
    pushUndoStop: () => true, executeEdits: (_source, edits) => { state.writes++; state.value = edits[0].text; state.version++; return true; } };
  const document = { querySelectorAll: selector => selector === '.monaco-editor' ? [root, hidden] : [control],
    getElementById: id => id === 'language-dialog' ? dialog : null };
  Object.defineProperty(document, 'cookie', { get() { state.cookieReads++; return 'csrftoken=browser_only_secret'; } });
  const monaco = { editor: { getEditors: () => [editor], EndOfLineSequence: { LF: 0, CRLF: 1 } } };
  return { state, model, editor, root, hidden, control, python, dialog, document, monaco,
    context: { document, monaco, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } };
}
