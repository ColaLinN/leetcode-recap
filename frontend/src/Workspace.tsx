import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  FileText,
  ExternalLink,
  History,
  ListChecks,
  LoaderCircle,
  Maximize2,
  PanelLeftClose,
  Play,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Terminal,
} from "lucide-react";
import { api, jsonBody } from "./api";
import type {
  Catalog,
  ExecutionResult,
  Health,
  Note,
  Problem,
  Submission,
} from "./types";
import { go } from "./router";
import { recoverDraft, rememberDraft, saveDraft } from "./drafts";
import { Difficulty, Empty, ErrorBox, formatValue, statusLabel } from "./ui";
import Markdown from "./Markdown";
import { NoteReader } from "./Pages";
import ResultView from "./ResultView";
import type { ErrorDiagnostic, ErrorNavigation, ExecutionSnapshot } from "./errorDiagnostics";
import { createLeetCodeBridge, emptyLeetCodeBridgeState, isLeetCodePending, leetCodeSlug, submitWithSnapshot } from "./leetcodeBridge";
import type { LeetCodeBridgeState } from "./leetcodeBridge";
import { LeetCodeConnectPanel, LeetCodeSyncControl, LeetCodeSyncResult } from "./LeetCodeSync";
const CodeEditor = lazy(() => import("./CodeEditor"));
export default function Workspace({
  id,
  catalog,
  health,
  chapterId,
  onRefresh,
  onReview,
}: {
  id: string;
  catalog: Catalog;
  health: Health | null;
  chapterId?: string;
  onRefresh: () => Promise<void>;
  onReview: (id: string, review: boolean) => Promise<void>;
}) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    api<Problem>(`/api/problems/${id}`)
      .then((data) => {
        if (!cancelled) setProblem(data);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  if (error)
    return (
      <div className="page-content">
        <ErrorBox message={error} />
        <button className="button secondary" onClick={() => go("home")}>
          返回学习总览
        </button>
      </div>
    );
  if (!problem)
    return (
      <div className="app-loading">
        <LoaderCircle size={25} className="spin" />
        <p>正在准备练习…</p>
      </div>
    );
  return (
    <WorkspaceReady
      key={id}
      problem={problem}
      catalog={catalog}
      health={health}
      chapterId={chapterId}
      onRefresh={onRefresh}
      onReview={onReview}
    />
  );
}
function WorkspaceReady({
  problem,
  catalog,
  health,
  chapterId,
  onRefresh,
  onReview,
}: {
  problem: Problem;
  catalog: Catalog;
  health: Health | null;
  chapterId?: string;
  onRefresh: () => Promise<void>;
  onReview: (id: string, review: boolean) => Promise<void>;
}) {
  const id = problem.id;
  const originalProblemPath = new URL(problem.sourceUrl).pathname;
  const [code, setCode] = useState(
    () => recoverDraft(problem.id) ?? problem.draft ?? problem.starter,
  );
  const [saveState, setSaveState] = useState(
    code !== (problem.draft ?? problem.starter) ? "正在保存…" : "已保存",
  );
  const [tab, setTab] = useState<
    "description" | "notes" | "solution" | "history"
  >("description");
  const [review, setReview] = useState(
    problem.review ?? catalog.progress[id]?.review ?? false,
  );
  const [accepted, setAccepted] = useState(
    problem.accepted ?? catalog.progress[id]?.accepted ?? false,
  );
  const [pendingReview, setPendingReview] = useState(false);
  const [execution, setExecution] = useState<ExecutionSnapshot | null>(null);
  const result = execution?.result ?? null;
  const [errorNavigation, setErrorNavigation] = useState<ErrorNavigation | null>(null);
  const navigationSequence = useRef(0);
  const [running, setRunning] = useState<"run" | "submit" | null>(null);
  const executionBusy = useRef(false);
  const mounted = useRef(true);
  const [leetCodeState, setLeetCodeState] = useState<LeetCodeBridgeState>(emptyLeetCodeBridgeState);
  const leetCodeBridge = useRef<ReturnType<typeof createLeetCodeBridge> | null>(null);
  const [syncToLeetCode, setSyncToLeetCode] = useState(false);
  const [showConnectPanel, setShowConnectPanel] = useState(false);
  const closeConnectPanel = useCallback(() => setShowConnectPanel(false), []);
  const slug = leetCodeSlug(problem.sourceUrl);
  const remotePending = isLeetCodePending(leetCodeState.submission);
  const [runError, setRunError] = useState("");
  const [custom, setCustom] = useState(false);
  const [customArgs, setCustomArgs] = useState(
    JSON.stringify(problem.examples[0]?.args ?? [], null, 2),
  );
  const [resultTab, setResultTab] = useState<"results" | "input">("results");
  const [width, setWidth] = useState(45);
  const [fontSize, setFontSize] = useState(14);
  const [editorFullscreen, setEditorFullscreen] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const latestCode = useRef(code);
  const dirty = useRef(code !== (problem.draft ?? problem.starter));
  const revision = useRef(0);
  const chapter =
    catalog.chapters.find(
      (c) => c.id === chapterId && c.problemIds.includes(id),
    ) ?? catalog.chapters.find((c) => c.problemIds.includes(id));
  const sequence = chapter?.problemIds ?? catalog.problems.map((p) => p.id);
  const index = sequence.indexOf(id);
  const sourceNotes = problem.sourceNoteIds
    .map((noteId) => catalog.notes.find((n) => n.id === noteId))
    .filter((n): n is Note => Boolean(n));
  const notes = sourceNotes.length
    ? sourceNotes
    : (chapter?.noteIds
        .map((n) => catalog.notes.find((note) => note.id === n))
        .filter((n): n is Note => Boolean(n)) ?? []);
  useEffect(() => {
    mounted.current = true;
    const bridge = createLeetCodeBridge(window, state => {
      if (!mounted.current) return;
      setLeetCodeState(state);
      if (state.connection !== "ready") setSyncToLeetCode(false);
    });
    leetCodeBridge.current = bridge;
    bridge.probe();
    return () => {
      mounted.current = false;
      bridge.dispose();
      leetCodeBridge.current = null;
    };
  }, [id]);
  useEffect(() => {
    void api(`/api/problems/${id}/visit`, { method: "POST" })
      .then(() => window.dispatchEvent(new Event("recap-draft-saved")))
      .catch(() => undefined);
  }, [id]);
  const changeCode = (value: string) => {
    if (value === latestCode.current) return;
    revision.current++;
    rememberDraft(id, value);
    latestCode.current = value;
    dirty.current = true;
    setCode(value);
    setSaveState("正在保存…");
  };
  useEffect(() => {
    if (!dirty.current) return;
    const version = revision.current;
    const timer = window.setTimeout(() => {
      saveDraft(id, code)
        .then(() => {
          if (version === revision.current) {
            dirty.current = latestCode.current !== code;
            setSaveState(dirty.current ? "正在保存…" : "已保存");
          }
        })
        .catch(() => {
          if (version === revision.current) setSaveState("保存失败，点击重试");
        });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [code, id]);
  useEffect(() => {
    const flush = () => {
      if (dirty.current) {
        rememberDraft(id, latestCode.current);
        void saveDraft(id, latestCode.current).catch(() => undefined);
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [id]);
  const retrySave = async () => {
    setSaveState("正在保存…");
    const value = latestCode.current;
    const version = revision.current;
    try {
      await saveDraft(id, value);
      if (version === revision.current) {
        dirty.current = latestCode.current !== value;
        setSaveState(dirty.current ? "正在保存…" : "已保存");
      }
    } catch {
      if (version === revision.current) setSaveState("保存失败，点击重试");
    }
  };
  const drag = (event: ReactPointerEvent) => {
    event.preventDefault();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (rect)
        setWidth(
          Math.min(
            65,
            Math.max(28, ((moveEvent.clientX - rect.left) / rect.width) * 100),
          ),
        );
    };
    const stop = () => {
      element.removeEventListener("pointermove", move as EventListener);
      element.removeEventListener("pointerup", stop);
      element.removeEventListener("pointercancel", stop);
      document.body.classList.remove("resizing");
    };
    element.addEventListener("pointermove", move as EventListener);
    element.addEventListener("pointerup", stop, { once: true });
    element.addEventListener("pointercancel", stop, { once: true });
    document.body.classList.add("resizing");
  };
  const execute = async (kind: "run" | "submit") => {
    if (executionBusy.current || (kind === "submit" && isLeetCodePending(leetCodeBridge.current?.getState().submission ?? null))) return;
    setRunError("");
    let args: unknown[] | undefined;
    if (kind === "run" && custom) {
      try {
        const parsed: unknown = JSON.parse(customArgs);
        if (!Array.isArray(parsed))
          throw new Error(
            "自定义输入必须是 JSON 参数数组，例如 [[2,7,11,15],9]。",
          );
        args = parsed;
      } catch (e) {
        setRunError((e as Error).message);
        setResultTab("input");
        return;
      }
    }
    executionBusy.current = true;
    setRunning(kind);
    setResultTab("results");
    const executedCode = latestCode.current;
    try {
      const submitLocal = (snapshot: string) => api<ExecutionResult>(
        `/api/problems/${id}/${kind}`,
        jsonBody({ code: snapshot, ...(args ? { customArgs: args } : {}) }),
      );
      const output = await (kind === "submit"
        ? submitWithSnapshot(executedCode, submitLocal, syncToLeetCode && slug ? snapshot => {
            const bridge = leetCodeBridge.current;
            if (!bridge) throw new Error("Chrome 联动未连接");
            bridge.submit({ slug, code: snapshot, language: "python3" });
          } : undefined, () => {
            if (mounted.current && slug) setLeetCodeState(previous => ({ ...previous, connection: "unavailable", submission: { requestId: "unavailable", slug, status: "failed", error: "未能发送到 Chrome；本地提交仍会继续。" } }));
          })
        : submitLocal(executedCode));
      if (!mounted.current) return;
      setExecution({ result: output, code: executedCode });
      if (kind === "submit") {
        if (output.status === "Accepted") setAccepted(true);
        await onRefresh();
      }
    } catch (e) {
      if (mounted.current) setRunError((e as Error).message);
    } finally {
      executionBusy.current = false;
      if (mounted.current) setRunning(null);
    }
  };
  const navigateToError = (diagnostic: ErrorDiagnostic, sourceCode: string) => {
    if (latestCode.current !== sourceCode) return;
    setErrorNavigation({ ...diagnostic, code: sourceCode, requestId: ++navigationSequence.current });
  };
  const markReview = async () => {
    setPendingReview(true);
    try {
      await onReview(id, !review);
      setReview(!review);
    } catch (e) {
      setRunError((e as Error).message);
    } finally {
      setPendingReview(false);
    }
  };
  return (
    <div className={`workspace ${editorFullscreen ? "editor-fullscreen" : ""}`}>
      <header className="workspace-header">
        <button
          className="back-link"
          onClick={() => (chapter ? go("chapter", chapter.id) : go("home"))}
        >
          <ArrowLeft size={16} />
          <span>{chapter?.title ?? "学习路径"}</span>
        </button>
        <ChevronRight size={13} className="muted" />
        <span className="workspace-current">
          {problem.number}. {problem.title}
        </span>
        <div className="workspace-nav">
          <button
            className="icon-button"
            disabled={index <= 0}
            title="上一题"
            aria-label="上一题"
            onClick={() => go("problem", sequence[index - 1], chapter?.id)}
          >
            <ArrowLeft size={16} />
          </button>
          <span>
            {index + 1} / {sequence.length}
          </span>
          <button
            className="icon-button"
            disabled={index >= sequence.length - 1}
            title="下一题"
            aria-label="下一题"
            onClick={() => go("problem", sequence[index + 1], chapter?.id)}
          >
            <ArrowRight size={16} />
          </button>
        </div>
        <button
          className={`button small review-button ${review ? "is-marked" : ""}`}
          onClick={() => void markReview()}
          disabled={pendingReview}
        >
          <Bookmark size={15} fill={review ? "currentColor" : "none"} />
          <span>{review ? "已加入复习" : "待复习"}</span>
        </button>
      </header>
      <div
        className="workspace-body"
        ref={splitRef}
        style={{ "--left-width": `${width}%` } as CSSProperties}
      >
        <section className="problem-panel workspace-panel">
          <div className="workspace-tabs">
            {(
              [
                { id: "description", label: "题目", icon: FileText },
                { id: "notes", label: "笔记", icon: BookOpen },
                { id: "solution", label: "题解", icon: Code2 },
                { id: "history", label: "提交记录", icon: History },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "active" : ""}
                onClick={() => setTab(t.id)}
              >
                <t.icon size={15} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <div className="problem-scroll">
            {tab === "description" ? (
              <div className="problem-description">
                <div className="problem-heading">
                  <span className="eyebrow">
                    PRACTICE / {String(problem.number).padStart(4, "0")}
                  </span>
                  <h1>
                    {problem.number}. {problem.title}
                  </h1>
                  <div className="problem-meta">
                    <Difficulty value={problem.difficulty} />
                    {accepted && (
                      <span className="accepted-label">
                        <CheckCircle2 size={14} />
                        已通过
                      </span>
                    )}
                    {problem.tags.map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <nav className="problem-source-links" aria-label="原题链接">
                    <span>查看原题</span>
                    {["leetcode.cn", "leetcode.com"].map((site) => (
                      <a
                        key={site}
                        href={`https://${site}${originalProblemPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`在新标签页打开 ${site} 的原题`}
                      >
                        {site}
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    ))}
                  </nav>
                </div>
                <Markdown text={problem.statement} />
                <div className="examples">
                  {problem.examples.map((example, i) => (
                    <div className="example" key={i}>
                      <h3>示例 {i + 1}</h3>
                      <div className="example-values">
                        <span>输入</span>
                        <pre>{formatValue(example.args)}</pre>
                        <span>输出</span>
                        <pre>{formatValue(example.expected)}</pre>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="constraints">
                  <h3>提示与约束</h3>
                  <ul>
                    {problem.constraints.map((v, i) => (
                      <li key={i}>
                        <Markdown text={v} />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="problem-footnote">
                  <span>
                    <ListChecks size={14} />
                    {problem.testCount} 组本地测试
                  </span>
                </div>
                {problem.kind === "design" && (
                  <div className="input-help">
                    设计题输入为 [操作名称数组,
                    参数数组]，系统会按顺序调用类方法。
                  </div>
                )}
                {problem.argTypes?.some((type) => type !== "raw") && (
                  <div className="input-help">
                    链表使用数组，树使用层序数组（空节点写 null）；带环链表使用{" "}
                    {`{"values": [...], "pos": 环入口索引}`}。系统自动转换节点。
                  </div>
                )}
              </div>
            ) : tab === "notes" ? (
              <div className="workspace-notes">
                {chapter?.overview && (
                  <div className="workspace-guide">
                    <span className="quiet-chip">
                      <BookOpen size={13} />
                      专题导读
                    </span>
                    <Markdown text={chapter.overview} />
                  </div>
                )}
                {notes.length > 0 ? (
                  <NoteReader notes={notes} problems={catalog.problems} />
                ) : (
                  !chapter?.overview && (
                    <Empty
                      title="从动手实践开始"
                      description="参考思路与 Python 解法收录在题解中。"
                    />
                  )
                )}
              </div>
            ) : tab === "solution" ? (
              <Solution id={id} />
            ) : (
              <SubmissionHistory
                id={id}
                refreshKey={result?.submissionId}
                currentCode={code}
                onNavigateError={navigateToError}
                onRestore={(restored) => {
                  changeCode(restored);
                  setRunError("");
                }}
              />
            )}
          </div>
        </section>
        <div
          className="split-handle"
          role="separator"
          aria-label="拖动调整题目与编辑器宽度"
          aria-orientation="vertical"
          aria-valuemin={28}
          aria-valuemax={65}
          aria-valuenow={Math.round(width)}
          tabIndex={0}
          onPointerDown={drag}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setWidth((w) => Math.max(28, w - 2));
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              setWidth((w) => Math.min(65, w + 2));
            }
          }}
        >
          <i />
          <i />
          <i />
        </div>
        <section className="editor-column">
          <div className="editor-panel workspace-panel">
            <div className="editor-toolbar">
              <span className="editor-filename">
                <span className="python-icon">Py</span>solution.py
              </span>
              <span className="language-select">
                Python 3<ChevronDown size={12} />
              </span>
              <div className="editor-tools">
                <button
                  className="icon-button"
                  onClick={() =>
                    setFontSize((s) => (s === 14 ? 16 : s === 16 ? 12 : 14))
                  }
                  title={`字号 ${fontSize}px，点击调整`}
                  aria-label="调整编辑器字号"
                >
                  <Settings2 size={15} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "将代码恢复为初始模板？已提交的代码仍可从提交记录恢复。",
                      )
                    )
                      changeCode(problem.starter);
                  }}
                  title="恢复初始模板"
                  aria-label="恢复初始模板"
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setEditorFullscreen((v) => !v)}
                  title="展开编辑器"
                  aria-label={editorFullscreen ? "收起编辑器" : "展开编辑器"}
                >
                  {editorFullscreen ? (
                    <PanelLeftClose size={16} />
                  ) : (
                    <Maximize2 size={15} />
                  )}
                </button>
              </div>
            </div>
            <div className="code-editor">
              <Suspense
                fallback={<div className="loading-block">正在准备编辑器…</div>}
              >
                <CodeEditor
                  code={code}
                  onChange={changeCode}
                  fontSize={fontSize}
                  execution={execution}
                  errorNavigation={errorNavigation}
                />
              </Suspense>
            </div>
            <div className="editor-status">
              <button
                className={saveState.includes("失败") ? "save-failed" : ""}
                onClick={() => {
                  if (saveState.includes("失败")) void retrySave();
                }}
                title={saveState}
              >
                <span
                  className={`status-dot ${saveState.includes("失败") ? "warning" : ""}`}
                />
                {saveState}
              </button>
              <span>
                UTF-8 <span className="status-divider">|</span>4 个空格
              </span>
            </div>
          </div>
          <section className="result-panel workspace-panel">
            <div className="result-tabs">
              <button
                className={resultTab === "results" ? "active" : ""}
                onClick={() => setResultTab("results")}
              >
                <Terminal size={15} />
                运行结果
              </button>
              <button
                className={resultTab === "input" ? "active" : ""}
                onClick={() => setResultTab("input")}
              >
                <Code2 size={15} />
                测试用例
              </button>
              {result && (
                <span
                  className={`result-count ${result.status === "Accepted" ? "success" : ""}`}
                >
                  {result.passed}/{result.total} 通过
                </span>
              )}
            </div>
            <div className="result-scroll">
              <LeetCodeSyncResult submission={leetCodeState.submission} onCancel={() => leetCodeBridge.current?.cancelWaiting()} onOpenEditor={() => leetCodeBridge.current?.openEditor()} />
              {runError && <div className="inline-error">{runError}</div>}
              {resultTab === "input" ? (
                <div className="custom-input">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={custom}
                      onChange={(e) => setCustom(e.target.checked)}
                    />
                    <span>使用自定义输入</span>
                  </label>
                  <p>
                    输入方法参数的 JSON 数组；「运行」会用参考解生成预期输出。
                  </p>
                  <textarea
                    aria-label="自定义 JSON 输入"
                    spellCheck={false}
                    value={customArgs}
                    onChange={(e) => {
                      setCustomArgs(e.target.value);
                      setCustom(true);
                    }}
                  />
                  <span className="input-caption">
                    提交时始终运行完整的本地测试集。
                  </span>
                </div>
              ) : running ? (
                <div className="judge-loading">
                  <LoaderCircle size={25} className="spin" />
                  <strong>
                    {running === "submit"
                      ? "正在检查完整测试集…"
                      : "正在运行代码…"}
                  </strong>
                  <span>Python 正在独立容器中执行</span>
                </div>
              ) : result ? (
                <ResultView
                  result={result}
                  codeMatches={execution?.code === code}
                  onNavigateError={(diagnostic) => {
                    if (execution) navigateToError(diagnostic, execution.code);
                  }}
                />
              ) : (
                <div className="result-placeholder">
                  <span className="terminal-icon">
                    <Terminal size={24} />
                  </span>
                  <strong>思考之后，运行一下</strong>
                  <p>运行样例检验思路，准备好后提交全部测试。</p>
                  {health && !health.judge.available && (
                    <span className="judge-warning">
                      判题容器暂未就绪，启动后即可运行。
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>
          <footer className="run-bar leetcode-run-bar">
            <span className="local-test-label">
              <span
                className={`status-dot ${health?.judge.available ? "" : "warning"}`}
              />
              本地测试集 · {problem.testCount} 组
            </span>
            <LeetCodeSyncControl
              state={leetCodeState}
              enabled={syncToLeetCode}
              onEnabled={setSyncToLeetCode}
              onConnect={() => setShowConnectPanel(true)}
              busy={Boolean(running) || remotePending}
              available={Boolean(slug)}
            />
            <button
              className="button secondary"
              disabled={Boolean(running)}
              onClick={() => void execute("run")}
            >
              {running === "run" ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Play size={15} />
              )}
              运行
            </button>
            <button
              className="button primary submit-button"
              disabled={Boolean(running) || remotePending}
              onClick={() => void execute("submit")}
            >
              {running === "submit" ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Send size={15} />
              )}
              提交
            </button>
          </footer>
        </section>
      </div>
      {showConnectPanel && <LeetCodeConnectPanel connection={leetCodeState.connection} connectionError={leetCodeState.connectionError} onProbe={() => leetCodeBridge.current?.probe()} onClose={closeConnectPanel} />}
    </div>
  );
}
function Solution({ id }: { id: string }) {
  const [data, setData] = useState<{
    solution: string;
    explanation: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    api<{ solution: string; explanation: string }>(
      `/api/problems/${id}/solution`,
    )
      .then((v) => {
        if (!cancelled) setData(v);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return (
    <div className="solution-content">
      <span className="quiet-chip">
        <Sparkles size={13} />
        换个角度理解
      </span>
      <h2>参考思路与解法</h2>
      {error ? (
        <ErrorBox message={error} />
      ) : data ? (
        <>
          <Markdown text={data.explanation} />
          <h3>Python 参考解</h3>
          <Markdown text={`\`\`\`python\n${data.solution}\n\`\`\``} />
          <p className="solution-reminder">
            理解之后，试着合上题解，用自己的方式再写一遍。
          </p>
        </>
      ) : (
        <div className="loading-block">
          <LoaderCircle className="spin" size={20} />
          正在加载题解…
        </div>
      )}
    </div>
  );
}
function SubmissionHistory({
  id,
  refreshKey,
  onRestore,
  currentCode,
  onNavigateError,
}: {
  id: string;
  refreshKey?: number;
  onRestore: (code: string) => void;
  currentCode: string;
  onNavigateError: (diagnostic: ErrorDiagnostic, sourceCode: string) => void;
}) {
  const [items, setItems] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [restored, setRestored] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<{ submissions: Submission[] }>(`/api/problems/${id}/submissions`)
      .then((v) => {
        if (!cancelled) {
          setItems(v.submissions);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, refreshKey]);
  return (
    <div className="history-content">
      <span className="eyebrow">EVERY ATTEMPT COUNTS</span>
      <h2>每一次尝试，都有记录</h2>
      <p className="muted">代码和结果会保存在本地，随时可以重新查看。</p>
      {error ? (
        <ErrorBox message={error} />
      ) : loading ? (
        <div className="loading-block">
          <LoaderCircle className="spin" size={20} />
          正在读取记录…
        </div>
      ) : !items.length ? (
        <Empty
          title="从第一次提交开始"
          description="提交代码后，这里会留下你的解题足迹。"
        />
      ) : (
        items.map((item) => (
          <div className="submission" key={item.id}>
            <button
              className="submission-summary"
              onClick={() => setExpanded(expanded === item.id ? null : item.id)}
            >
              <span
                className={
                  item.status === "Accepted"
                    ? "submission-icon accepted"
                    : "submission-icon"
                }
              >
                {item.status === "Accepted" ? (
                  <CheckCircle2 size={19} />
                ) : (
                  <Clock3 size={19} />
                )}
              </span>
              <span>
                <strong
                  className={item.status === "Accepted" ? "accepted-label" : ""}
                >
                  {statusLabel(item.status)}
                </strong>
                <small>
                  {new Date(
                    /Z$|[+-]\d\d:\d\d$/.test(item.createdAt)
                      ? item.createdAt
                      : `${item.createdAt}Z`,
                  ).toLocaleString("zh-CN", {
                    timeZone: "Asia/Singapore",
                    hour12: false,
                  })}
                </small>
              </span>
              <span className="submission-score">
                {item.passed}/{item.total}
                <small>{Math.round(item.elapsedMs)} ms</small>
              </span>
              <ChevronDown size={15} />
            </button>
            {expanded === item.id && (
              <div className="submission-detail">
                <button
                  className="button secondary small"
                  onClick={() => {
                    onRestore(item.code);
                    setRestored(item.id);
                  }}
                >
                  <RotateCcw size={13} />
                  {restored === item.id ? "已恢复到编辑器" : "恢复这份代码"}
                </button>
                <Markdown text={`\`\`\`python\n${item.code}\n\`\`\``} />
                {item.results && (
                  <ResultView
                    result={item}
                    codeMatches={item.code === currentCode}
                    onNavigateError={(diagnostic) => onNavigateError(diagnostic, item.code)}
                    isHistory
                  />
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
