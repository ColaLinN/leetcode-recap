import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { copyResultValue, presentResultValue } from "./resultValueFormatting";
import "./ResultValue.css";

export default function ResultValue({ value, label, error = false }: {
  value: unknown;
  label: string;
  error?: boolean;
}) {
  const presentation = useMemo(() => presentResultValue(value), [value]);
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const valueId = useId();
  useEffect(() => {
    setExpanded(false);
    setCopyState("idle");
    return () => clearTimeout(copyTimer.current);
  }, [presentation.copyText]);

  async function copy() {
    clearTimeout(copyTimer.current);
    try {
      const copied = await copyResultValue(presentation, text => navigator.clipboard.writeText(text));
      if (copied) setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    copyTimer.current = setTimeout(() => setCopyState("idle"), 2200);
  }

  return (
    <div className={`case-value result-value${error ? " result-value-error" : ""}`}>
      <div className="result-value-heading">
        <span id={`${valueId}-label`}>{label}</span>
        <div className="result-value-tools">
          {presentation.truncated && (
            <span className="result-value-preview-label">
              {expanded ? "完整" : "预览"}{presentation.summary && ` · ${presentation.summary}`}
            </span>
          )}
          <button
            type="button"
            onClick={copy}
            disabled={presentation.copyText === null}
            aria-label={`复制${label}的完整 JSON`}
            title="复制完整 JSON，包括预览中省略的内容"
          >
            {copyState === "copied" ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
            <span aria-live="polite">{copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}</span>
          </button>
        </div>
      </div>
      <pre
        id={valueId}
        aria-labelledby={`${valueId}-label`}
        className={`result-value-code${expanded ? " expanded" : ""}${presentation.truncated && !expanded ? " preview" : ""}${error ? " value-error" : ""}`}
        tabIndex={expanded ? 0 : undefined}
      >{expanded ? presentation.text : presentation.preview}</pre>
      {presentation.truncated && (
        <button
          type="button"
          className="result-value-toggle"
          aria-controls={valueId}
          aria-expanded={expanded}
          onClick={() => setExpanded(previous => !previous)}
        >
          {expanded ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
          {expanded ? "收起" : "展开全部"}
        </button>
      )}
    </div>
  );
}
