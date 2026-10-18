import Editor, { loader } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/editor.all";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { registerPythonLanguageFeatures } from "./pythonCompletion";
import { createErrorDiagnostics } from "./errorDiagnostics";
import type { ErrorNavigation, ExecutionSnapshot } from "./errorDiagnostics";
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
const pythonFeatures = registerPythonLanguageFeatures(monaco);
if (import.meta.hot) import.meta.hot.dispose(() => pythonFeatures.dispose());
monaco.editor.defineTheme("recap-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "62748c", fontStyle: "italic" },
    { token: "keyword", foreground: "7c3aed" },
    { token: "string", foreground: "047857" },
    { token: "number", foreground: "b45309" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#243654",
    "editorLineNumber.foreground": "#788ba8",
    "editorLineNumber.activeForeground": "#1d4ed8",
    "editor.lineHighlightBackground": "#edf3ff",
    "editor.selectionBackground": "#c7dcff",
    "editorIndentGuide.background1": "#d6e1f2",
  },
});
export default function CodeEditor({
  code,
  onChange,
  fontSize,
  execution,
  errorNavigation,
}: {
  code: string;
  onChange: (v: string) => void;
  fontSize: number;
  execution: ExecutionSnapshot | null;
  errorNavigation: ErrorNavigation | null;
}) {
  const diagnostics = useRef<ReturnType<typeof createErrorDiagnostics> | null>(null);
  const latestExecution = useRef(execution);
  const latestNavigation = useRef(errorNavigation);
  latestExecution.current = execution;
  latestNavigation.current = errorNavigation;
  useEffect(() => {
    diagnostics.current?.update(execution);
  }, [execution]);
  useEffect(() => {
    if (errorNavigation) diagnostics.current?.navigate(errorNavigation, errorNavigation.code);
  }, [errorNavigation]);
  useEffect(() => () => diagnostics.current?.dispose(), []);
  return (
    <Editor
      height="100%"
      language="python"
      theme="recap-light"
      value={code}
      onChange={(v) => onChange(v ?? "")}
      onMount={(editor) => {
        diagnostics.current?.dispose();
        diagnostics.current = createErrorDiagnostics(monaco, editor);
        diagnostics.current.update(latestExecution.current);
        const navigation = latestNavigation.current;
        if (navigation) diagnostics.current.navigate(navigation, navigation.code);
      }}
      loading={<div className="loading-block">正在准备编辑器…</div>}
      options={{
        fontSize,
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
        lineHeight: 25,
        minimap: { enabled: false },
        padding: { top: 20, bottom: 20 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: "on",
        tabSize: 4,
        insertSpaces: true,
        renderLineHighlight: "line",
        lineNumbersMinChars: 3,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        fixedOverflowWidgets: true,
        quickSuggestions: { other: true, comments: false, strings: false },
        quickSuggestionsDelay: 180,
        parameterHints: { enabled: true },
        suggestOnTriggerCharacters: true,
        wordBasedSuggestions: "off",
        acceptSuggestionOnEnter: "smart",
      }}
    />
  );
}
