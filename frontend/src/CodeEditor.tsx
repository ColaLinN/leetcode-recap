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
    { token: "comment", foreground: "9a9eb0", fontStyle: "italic" },
    { token: "keyword", foreground: "8c58ad" },
    { token: "string", foreground: "4d8b77" },
    { token: "number", foreground: "b57845" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#374159",
    "editorLineNumber.foreground": "#bbc2d2",
    "editorLineNumber.activeForeground": "#6b7794",
    "editor.lineHighlightBackground": "#f5f7fc",
    "editor.selectionBackground": "#dce6fb",
    "editorIndentGuide.background1": "#edf0f6",
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
