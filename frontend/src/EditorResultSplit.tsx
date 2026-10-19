import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import "./EditorResultSplit.css";

const DEFAULT_SHARE = 57.5;
const HANDLE_HEIGHT = 14;
const STORAGE_KEY = "recap:layout:editor-share";

function savedShare() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(value) && value > 0 && value < 100) return value;
  } catch { /* Layout preferences are optional when storage is unavailable. */ }
  return DEFAULT_SHARE;
}
function rememberShare(value: number) {
  try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* Resizing still works. */ }
}

export default function EditorResultSplit({ children }: { children: [ReactNode, ReactNode] }) {
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startY: number; startHeight: number; handle: HTMLDivElement } | null>(null);
  const [preferredShare, setPreferredShare] = useState(savedShare);
  const preferred = useRef(preferredShare);
  const [available, setAvailable] = useState(1);
  const minimum = Math.min(200, available * 0.65) / available * 100;
  const maximum = 100 - Math.min(96, available * 0.35) / available * 100;
  const share = Math.max(minimum, Math.min(maximum, preferredShare));
  const update = (value: number, persist = false) => {
    const next = Math.max(minimum, Math.min(maximum, value));
    preferred.current = next;
    setPreferredShare(next);
    if (persist) rememberShare(next);
  };
  const finish = useCallback(() => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    document.body.classList.remove("resizing-results");
    if (active.handle.hasPointerCapture(active.pointerId)) active.handle.releasePointerCapture(active.pointerId);
    rememberShare(preferred.current);
  }, []);
  useLayoutEffect(() => {
    const element = container.current!;
    const measure = () => setAvailable(Math.max(1, element.getBoundingClientRect().height - HANDLE_HEIGHT));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("blur", finish);
    return () => { observer.disconnect(); window.removeEventListener("blur", finish); finish(); };
  }, [finish]);
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || drag.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    drag.current = { pointerId: event.pointerId, startY: event.clientY,
      startHeight: container.current!.firstElementChild!.getBoundingClientRect().height, handle: event.currentTarget };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-results");
  };
  const end = (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.pointerId === event.pointerId) finish(); };
  return <div className="editor-result-stack" ref={container}
    style={{ "--editor-share": share, "--result-share": 100 - share } as CSSProperties}>
    {children[0]}
    <div className="editor-result-handle" role="separator" aria-label="调整编辑器与运行结果高度"
      aria-orientation="horizontal" aria-valuemin={Math.floor(minimum)} aria-valuemax={Math.ceil(maximum)}
      aria-valuenow={Math.round(share)} aria-valuetext={`编辑器 ${Math.round(share)}%，运行结果 ${Math.round(100 - share)}%`}
      tabIndex={0} title="上下拖动调整高度 · 双击恢复默认"
      onPointerDown={start} onPointerMove={event => {
        const active = drag.current;
        if (!active || active.pointerId !== event.pointerId) return;
        event.preventDefault();
        update((active.startHeight + event.clientY - active.startY) / available * 100);
      }} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
      onDoubleClick={() => update(DEFAULT_SHARE, true)}
      onKeyDown={event => {
        const next = event.key === "ArrowDown" ? share + 2 : event.key === "ArrowUp" ? share - 2
          : event.key === "Home" ? minimum : event.key === "End" ? maximum
          : event.key === "Enter" ? DEFAULT_SHARE : null;
        if (next !== null) { event.preventDefault(); update(next, true); }
      }}
    ><span aria-hidden="true" /></div>
    {children[1]}
  </div>;
}
