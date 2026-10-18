import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/editor.all";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
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
}: {
  code: string;
  onChange: (v: string) => void;
  fontSize: number;
}) {
  return (
    <Editor
      height="100%"
      language="python"
      theme="recap-light"
      value={code}
      onChange={(v) => onChange(v ?? "")}
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
        quickSuggestions: false,
        parameterHints: { enabled: false },
        suggestOnTriggerCharacters: false,
      }}
    />
  );
}
