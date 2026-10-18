import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api";

type Position = Monaco.Position;
type Model = Monaco.editor.ITextModel;
type Token = Monaco.CancellationToken;
type Suggestion = {
  label: string;
  insertText: string;
  type: string;
  detail: string;
  startColumn: number;
  endColumn: number;
};
type Completions = { suggestions: Suggestion[] };

const identifier = /[_\p{ID_Start}][_\p{ID_Continue}]*/gu;

function currentWord(model: Model, position: Position) {
  const offset = position.column - 1;
  for (const match of model.getLineContent(position.lineNumber).matchAll(identifier)) {
    const start = match.index;
    const end = start + match[0].length;
    if (start <= offset && offset <= end) {
      return {
        prefix: match[0].slice(0, offset - start),
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: start + 1,
          endColumn: end + 1,
        },
      };
    }
  }
  return null;
}

function wordSuggestions(monaco: typeof Monaco, model: Model, position: Position) {
  const word = currentWord(model, position);
  if (!word?.prefix) return [];
  const names = new Set<string>();
  for (const match of model.getValue().matchAll(identifier)) {
    const name = match[0];
    if (name !== word.prefix && name.toLowerCase().startsWith(word.prefix.toLowerCase())) {
      names.add(name);
      if (names.size === 80) break;
    }
  }
  return [...names].map((name): Monaco.languages.CompletionItem => ({
    label: name,
    insertText: name,
    kind: monaco.languages.CompletionItemKind.Variable,
    detail: "当前代码中的名称",
    range: word.range,
  }));
}

async function analyze<T>(
  endpoint: string,
  model: Model,
  position: Position,
  token: Token,
): Promise<T | null> {
  const controller = new AbortController();
  const cancellation = token.onCancellationRequested(() => controller.abort());
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    if (token.isCancellationRequested) return null;
    const response = await fetch(`/api/editor/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: model.getValue(),
        line: position.lineNumber,
        column: position.column,
      }),
      signal: controller.signal,
    });
    return response.ok ? await response.json() as T : null;
  } catch {
    // A canceled request, restarting backend, or offline editor should not
    // interrupt typing. Completion can fall back to this document's words.
    return null;
  } finally {
    clearTimeout(timeout);
    cancellation.dispose();
  }
}

export function registerPythonLanguageFeatures(monaco: typeof Monaco): Monaco.IDisposable {
  let disposed = false;
  const kinds: Record<string, Monaco.languages.CompletionItemKind> = {
    function: monaco.languages.CompletionItemKind.Function,
    class: monaco.languages.CompletionItemKind.Class,
    module: monaco.languages.CompletionItemKind.Module,
    keyword: monaco.languages.CompletionItemKind.Keyword,
    property: monaco.languages.CompletionItemKind.Property,
    param: monaco.languages.CompletionItemKind.Variable,
  };
  const completion = monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: ["."],
    async provideCompletionItems(model, position, _context, token) {
      const version = model.getVersionId();
      const data = await analyze<Completions>("completions", model, position, token);
      if (disposed || token.isCancellationRequested || model.isDisposed() || model.getVersionId() !== version) {
        return { suggestions: [] };
      }
      return {
        // Re-query as the prefix grows instead of filtering a capped response.
        incomplete: true,
        suggestions: data ? data.suggestions.map((item, index) => ({
          label: item.label,
          insertText: item.insertText,
          detail: item.detail,
          kind: kinds[item.type] ?? monaco.languages.CompletionItemKind.Variable,
          sortText: String(index).padStart(3, "0"),
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: item.startColumn,
            endColumn: item.endColumn,
          },
        })) : wordSuggestions(monaco, model, position),
      };
    },
  });
  const signature = monaco.languages.registerSignatureHelpProvider("python", {
    signatureHelpTriggerCharacters: ["(", ","],
    signatureHelpRetriggerCharacters: [")"],
    async provideSignatureHelp(model, position, token) {
      const version = model.getVersionId();
      const data = await analyze<Monaco.languages.SignatureHelp>("signatures", model, position, token);
      if (disposed || token.isCancellationRequested || model.isDisposed() || model.getVersionId() !== version || !data?.signatures.length) {
        return null;
      }
      return { value: data, dispose() {} };
    },
  });
  return { dispose() {
    disposed = true;
    completion.dispose();
    signature.dispose();
  } };
}
