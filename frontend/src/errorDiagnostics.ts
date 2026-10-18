import type * as Monaco from "monaco-editor";
import type { ErrorLocation, ExecutionResult, TestResult } from "./types";

export interface ExecutionSnapshot {
  code: string;
  result: ExecutionResult;
}
export interface ErrorDiagnostic {
  location: ErrorLocation;
  message: string;
}
export interface ErrorNavigation extends ErrorDiagnostic {
  code: string;
  requestId: number;
}

export function caseDiagnostic(result: TestResult): ErrorDiagnostic | null {
  const location = result.errorLocation;
  if (
    !["Runtime Error", "Syntax Error", "Compilation Error", "Output Limit Exceeded"].includes(result.status) ||
    !result.error ||
    !location ||
    !Number.isInteger(location.line) ||
    location.line < 1
  ) return null;
  return { location, message: result.error };
}

export function executionDiagnostics(snapshot: ExecutionSnapshot): ErrorDiagnostic[] {
  const seen = new Set<string>();
  return snapshot.result.results.flatMap((result) => {
    const diagnostic = caseDiagnostic(result);
    if (!diagnostic) return [];
    const key = JSON.stringify(diagnostic);
    if (seen.has(key)) return [];
    seen.add(key);
    return [diagnostic];
  });
}

function errorRange(
  location: ErrorLocation,
  model: Monaco.editor.ITextModel,
): Monaco.IRange | null {
  const startLineNumber = location.line;
  if (!Number.isInteger(startLineNumber) || startLineNumber < 1 || startLineNumber > model.getLineCount()) return null;
  const endLineNumber = Number.isInteger(location.endLine)
    ? Math.min(model.getLineCount(), Math.max(startLineNumber, location.endLine!))
    : startLineNumber;
  const clampColumn = (value: number | undefined, line: number, fallback: number) =>
    Number.isInteger(value) ? Math.max(1, Math.min(model.getLineMaxColumn(line), value!)) : fallback;
  const startColumn = clampColumn(location.column, startLineNumber, model.getLineFirstNonWhitespaceColumn(startLineNumber) || 1);
  const endColumn = clampColumn(location.endColumn, endLineNumber, model.getLineMaxColumn(endLineNumber));
  return {
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn: endLineNumber === startLineNumber ? Math.max(startColumn, endColumn) : endColumn,
  };
}

/** Owns markers for one editor and clears them synchronously when its source changes. */
export function createErrorDiagnostics(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
) {
  const owner = "recap-execution";
  const decorations = editor.createDecorationsCollection();
  let snapshot: ExecutionSnapshot | null = null;
  let markedModel: Monaco.editor.ITextModel | null = null;
  const clear = () => {
    if (markedModel && !markedModel.isDisposed()) monaco.editor.setModelMarkers(markedModel, owner, []);
    markedModel = null;
    decorations.clear();
  };
  const refresh = () => {
    clear();
    const model = editor.getModel();
    if (!model || !snapshot || model.getValue() !== snapshot.code) return;
    const diagnostics = executionDiagnostics(snapshot).flatMap((diagnostic) => {
      const range = errorRange(diagnostic.location, model);
      return range ? [{ diagnostic, range }] : [];
    });
    monaco.editor.setModelMarkers(model, owner, diagnostics.map(({ diagnostic, range }) => ({
      ...range,
      message: diagnostic.message,
      severity: monaco.MarkerSeverity.Error,
      source: "Python 运行",
    })));
    markedModel = model;
    const markedLines = new Set<number>();
    decorations.set(diagnostics.flatMap(({ range }) => {
      if (markedLines.has(range.startLineNumber)) return [];
      markedLines.add(range.startLineNumber);
      return [{
        range,
        options: {
          isWholeLine: true,
          className: "recap-error-line",
          linesDecorationsClassName: "recap-error-gutter",
        },
      }];
    }));
  };
  const contentListener = editor.onDidChangeModelContent(refresh);
  const modelListener = editor.onDidChangeModel(refresh);
  return {
    update(value: ExecutionSnapshot | null) {
      snapshot = value;
      refresh();
    },
    navigate(diagnostic: ErrorDiagnostic, code: string): boolean {
      const model = editor.getModel();
      if (!model || model.getValue() !== code) return false;
      const range = errorRange(diagnostic.location, model);
      if (!range) return false;
      editor.revealRangeInCenter(range, monaco.editor.ScrollType.Smooth);
      editor.setSelection(range);
      editor.focus();
      return true;
    },
    dispose() {
      contentListener.dispose();
      modelListener.dispose();
      clear();
    },
  };
}
