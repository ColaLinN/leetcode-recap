import { useEffect, useRef } from "react";
import { CheckCircle2, ExternalLink, LoaderCircle, Unplug, X } from "lucide-react";
import { isLeetCodePending } from "./leetcodeBridge";
import type { LeetCodeBridgeState, LeetCodeSubmission } from "./leetcodeBridge";
import "./LeetCodeSync.css";

export function LeetCodeSyncControl({ state, enabled, onEnabled, onConnect, busy, available }: {
  state: LeetCodeBridgeState;
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
  onConnect: () => void;
  busy: boolean;
  available: boolean;
}) {
  const ready = state.connection === "ready";
  return (
    <div className="leetcode-sync-control">
      <label title={!available ? "这道题暂无可同步的 LeetCode 链接" : ready ? "先更新同题的 Python3 编辑器，再提交到你的 LeetCode.cn 账号" : state.connectionError ?? "连接 Chrome 联动扩展后可启用"}>
        <input type="checkbox" checked={enabled} disabled={!ready || busy || !available} onChange={event => onEnabled(event.target.checked)} />
        <span>同步到 LeetCode.cn</span>
      </label>
      {!ready ? (
        <button type="button" className="leetcode-connect-button" onClick={onConnect}>
          {state.connection === "checking" ? "检测连接…" : state.connectionError ? "更新 Chrome 联动" : "连接 Chrome"}
        </button>
      ) : (
        <span className="leetcode-connected"><CheckCircle2 size={11} aria-hidden="true" />Chrome 已连接</span>
      )}
    </div>
  );
}

export function LeetCodeSyncResult({ submission, onCancel, onOpenEditor }: { submission: LeetCodeSubmission | null; onCancel: () => void; onOpenEditor: () => void }) {
  if (!submission) return null;
  const pending = isLeetCodePending(submission);
  const labels = {
    submitting: submission.editorSynced ? "正在提交代码…" : "正在同步编辑器…",
    pending: "正在判题…",
    accepted: "已通过",
    rejected: "未通过",
    failed: "结果未确认",
    canceled: "已停止等待，提交状态未确认",
  };
  const rejectionDetail = submission.status === "rejected" && submission.statusDisplay ? ` · ${submission.statusDisplay}` : "";
  return (
    <section className={`leetcode-sync-result leetcode-result-${submission.status}`} aria-label="LeetCode.cn 提交结果" aria-live="polite">
      <div className="leetcode-result-heading">
        <strong>{pending && <LoaderCircle size={13} className="spin" aria-hidden="true" />}LeetCode.cn · {labels[submission.status]}{rejectionDetail}</strong>
        {pending && <button type="button" onClick={onCancel}>停止等待</button>}
      </div>
      {submission.error && <p>{submission.error}</p>}
      {submission.editorSynced === true && <p className="leetcode-editor-synced"><CheckCircle2 size={12} aria-hidden="true" />编辑器已同步 · Python3</p>}
      {submission.editorOpenError && <p className="leetcode-editor-open-error">{submission.editorOpenError}</p>}
      {submission.editorOpenState === "opened" && <p>已切换到本次代码同步的原题编辑器。</p>}
      {submission.status === "canceled" && <p>已派发的编辑器写入仍可能完成；已发出的提交可能继续判题。请到原站检查，不会自动重试。</p>}
      <div className="leetcode-result-links">
        {submission.editorSynced === true && <button type="button" onClick={onOpenEditor} disabled={submission.editorOpenState === "opening"} title="切换到本次代码实际同步的 Chrome 标签页">{submission.editorOpenState === "opening" ? "正在打开…" : "打开力扣编辑器"}<ExternalLink size={11} aria-hidden="true" /></button>}
        <a href={`https://leetcode.cn/problems/${submission.slug}/submissions/`} target="_blank" rel="noopener noreferrer">原站提交记录<ExternalLink size={11} aria-hidden="true" /></a>
        {submission.url && <a href={submission.url} target="_blank" rel="noopener noreferrer">{submission.submissionId ? `提交 #${submission.submissionId}` : "查看原题"}<ExternalLink size={11} aria-hidden="true" /></a>}
      </div>
    </section>
  );
}

export function LeetCodeConnectPanel({ connection, connectionError, onProbe, onClose }: {
  connection: LeetCodeBridgeState["connection"];
  connectionError?: string;
  onProbe: () => void;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);
  return (
    <div className="leetcode-connect-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="leetcode-connect-panel" role="dialog" aria-modal="true" aria-labelledby="leetcode-connect-title" onKeyDown={event => {
        if (event.key !== "Tab") return;
        const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]')];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
        <header><h2 id="leetcode-connect-title"><Unplug size={18} aria-hidden="true" />连接 Chrome</h2><button type="button" ref={close} onClick={onClose} aria-label="关闭连接说明"><X size={18} /></button></header>
        <p>使用项目的 Chrome 联动扩展，先更新同题的 Python3 编辑器，再提交当前代码到你已登录的 LeetCode.cn 账号。</p>
        <ol>
          <li>在 Chrome 地址栏打开 <code>chrome://extensions</code>，开启「开发者模式」。</li>
          <li>选择「加载已解压的扩展程序」，选择本项目中的 <code>browser-extension</code> 文件夹；已安装时点击扩展的「重新加载」。</li>
          <li>用 Chrome 打开当前本地练习页，登录 <a href="https://leetcode.cn/" target="_blank" rel="noopener noreferrer">LeetCode.cn</a>，刷新练习页后检测连接。</li>
        </ol>
        <p className="leetcode-connect-note">连接后仍需勾选「同步到 LeetCode.cn」并点击「提交」，会覆盖原题编辑器的 Python3 代码。运行测试不会写入原站编辑器或提交。停止等待不能撤回已派发的编辑器写入或已发出的提交。</p>
        <footer><span role="status">{connection === "ready" ? "Chrome 联动已连接" : connection === "checking" ? "正在检测项目扩展…" : connectionError ?? "尚未检测到项目扩展"}</span><button className="button primary small" type="button" onClick={onProbe} disabled={connection === "checking"}>检测连接</button></footer>
      </section>
    </div>
  );
}
