import { useEffect, useRef, useState } from "react";
import { ArrowRight, Archive, ChevronLeft, ChevronRight, Clock3, Copy, LoaderCircle, Pencil, Plus, RotateCcw, X } from "lucide-react";
import type { Catalog, PracticeGroup, PracticeSession, Progress } from "./types";
import { api, jsonBody } from "./api";
import { fullPracticeTime, practiceTime } from "./practice";
import { ErrorBox } from "./ui";

export type PracticePanelMode = "groups" | "create" | "restart" | "records" | "edit";
type GroupDetail = PracticeGroup & { problemIds: string[]; completionOverrides: Record<string, boolean>; progress: Record<string, Progress> };
export default function PracticePanel({ mode: initialMode, catalog, groups, onClose, onSelect, onRefresh }: {
  mode: PracticePanelMode;
  catalog: Catalog;
  groups: PracticeGroup[];
  onClose: () => void;
  onSelect: (id: string, problemId?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [all, setAll] = useState(true);
  const [chapters, setChapters] = useState<string[]>([]);
  const [copyProgress, setCopyProgress] = useState(false);
  const [copySource, setCopySource] = useState(catalog.practiceGroup.id);
  const [showArchived, setShowArchived] = useState(false);
  const [editTarget, setEditTarget] = useState<GroupDetail | null>(null);
  const [completionUpdates, setCompletionUpdates] = useState<Record<string, boolean | null>>({});
  const [selectedProblems, setSelectedProblems] = useState<string[]>([]);
  const [problemSearch, setProblemSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recordGroup, setRecordGroup] = useState(catalog.practiceGroup.id);
  const [offset, setOffset] = useState(0);
  const [records, setRecords] = useState<{ sessions: PracticeSession[]; total: number } | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    if (mode !== "records") return;
    let cancelled = false;
    setRecords(null);
    setError("");
    api<{ sessions: PracticeSession[]; total: number }>(`/api/practice-groups/${recordGroup}/sessions?offset=${offset}`)
      .then(value => { if (!cancelled) setRecords(value); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [mode, recordGroup, offset]);
  const perform = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const eligibleFor = (whole: boolean, ids: string[]) => whole ? catalog.allProblems.map(p => p.id) : [...new Set(catalog.allChapters.filter(c => ids.includes(c.id)).flatMap(c => c.problemIds))];
  const changeScope = (whole: boolean, ids: string[]) => {
    if (mode === "edit") {
      const before = new Set(eligibleFor(all, chapters));
      const after = eligibleFor(whole, ids);
      setSelectedProblems(value => [...new Set([...value.filter(id => after.includes(id)), ...after.filter(id => !before.has(id))])]);
    }
    setAll(whole); setChapters(ids);
  };
  const toggleChapter = (id: string) => changeScope(all, chapters.includes(id) ? chapters.filter(c => c !== id) : [...chapters, id]);
  const selectedCount = new Set(catalog.allChapters.filter(c => chapters.includes(c.id)).flatMap(c => c.problemIds)).size;
  const eligible = new Set(eligibleFor(all, chapters));
  const editProblems = catalog.allProblems.filter(p => eligible.has(p.id));
  const titles = { groups: "我的练习组", create: "新建练习组", restart: "开始新一轮", records: "练习记录", edit: "编辑练习组" };
  return <dialog className="practice-dialog" ref={dialog} onCancel={onClose} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <div className="practice-panel">
      <header className="practice-panel-heading">
        <div><span>RECAP · 每一轮都有迹可循</span><h2>{titles[mode]}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="关闭练习管理"><X size={20} /></button>
      </header>
      <nav className="practice-panel-tabs" aria-label="练习管理">
        {(["groups", "create", "records"] as const).map(tab => <button key={tab} className={mode === tab ? "active" : ""} onClick={() => { setMode(tab); setError(""); }}>{titles[tab]}</button>)}
      </nav>
      <div className="practice-panel-content">
        {error && <ErrorBox message={error} />}
        {mode === "create" || mode === "restart" || mode === "edit" ? <form onSubmit={e => {
          e.preventDefault();
          void perform(async () => {
            if (mode === "edit" && editTarget) {
              await api(`/api/practice-groups/${editTarget.id}`, { method: "PATCH", body: JSON.stringify({
                name: name.trim() || editTarget.name, chapterIds: all ? null : chapters,
                problemIds: selectedProblems, expectedUpdatedAt: editTarget.updatedAt,
                completionUpdates: Object.fromEntries(Object.entries(completionUpdates).filter(([id]) => selectedProblems.includes(id))),
              }) });
              await onRefresh(); setMode("groups"); return;
            }
            const group = await api<PracticeGroup>("/api/practice-groups", jsonBody({ name,
              ...(mode === "restart" ? { restartFrom: catalog.practiceGroup.id } : copyProgress ? { copyFrom: copySource } : all ? {} : { chapterIds: chapters }) }));
            await onSelect(group.id);
            onClose();
          });
        }}>
          <p className="practice-help">{mode === "edit" ? `原地修改「${editTarget?.name}」的题单与完成标记。移出题目后不计入进度，重新加入可恢复草稿和历史。手动标记保留原提交记录；再次提交通过会重新完成。` : mode === "restart" ? `沿用「${catalog.practiceGroup.name}」的 ${catalog.practiceGroup.total} 道题，从初始代码开始。旧组的草稿、进度和历史全部保留。` : "每组独立保存草稿和进度，随时切换，接着上次继续。"}</p>
          <label className="practice-field">练习组名称<input autoComplete="off" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={`第 ${groups.length + 1} 轮复习`} /></label>
          {mode === "create" && <div className="practice-copy-option">
            <label><input type="checkbox" checked={copyProgress} onChange={e => setCopyProgress(e.target.checked)} /><span>从已有练习组复制进度</span></label>
            {copyProgress && <>
              <label className="practice-field">来源练习组<select value={copySource} onChange={e => setCopySource(e.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{group.name} · {group.completed}/{group.total}</option>)}</select></label>
              <p className="practice-help">沿用来源题单，复制草稿、通过状态与复习标记。两组此后独立；练习次数从新组开始，原提交历史可到来源组查看。</p>
            </>}
          </div>}
          {((mode === "create" && !copyProgress) || mode === "edit") && <>
            <fieldset className="practice-scope"><legend>选择题单</legend>
              <label><input type="radio" checked={all} onChange={() => changeScope(true, chapters)} />全部题目 <span>{mode === "edit" ? "可逐题调整" : "默认"}</span></label>
              <label><input type="radio" checked={!all} onChange={() => changeScope(false, chapters)} />自选章节 <span>{selectedCount} 道题 · 自动去重</span></label>
            </fieldset>
            {!all && <div className="practice-chapters">{["数据结构", "算法"].map(part => <section key={part}>
              <header><strong>{part}</strong><button type="button" onClick={() => {
                const ids = catalog.allChapters.filter(c => c.group === part).map(c => c.id);
                changeScope(all, ids.every(id => chapters.includes(id)) ? chapters.filter(id => !ids.includes(id)) : [...new Set([...chapters, ...ids])]);
              }}>全选 / 取消</button></header>
              {catalog.allChapters.filter(c => c.group === part).map(chapter => <label key={chapter.id}><input type="checkbox" checked={chapters.includes(chapter.id)} onChange={() => toggleChapter(chapter.id)} /><span>{chapter.title}</span><small>{chapter.problemIds.length} 题</small></label>)}
            </section>)}</div>}
          </>}
          {mode === "edit" && <section className="practice-problem-picker">
            <header><strong>组内题目</strong><span>已选 {selectedProblems.length} / {editProblems.length}</span></header>
            <input aria-label="筛选组内题目" placeholder="搜索题号或题目…" value={problemSearch} onChange={e => setProblemSearch(e.target.value)} />
            <label className="practice-pick-all"><input type="checkbox" checked={editProblems.length > 0 && editProblems.every(p => selectedProblems.includes(p.id))} onChange={e => setSelectedProblems(e.target.checked ? editProblems.map(p => p.id) : [])} />全选范围内题目</label>
            <div>{editProblems.filter(p => `${p.number} ${p.title}`.includes(problemSearch.trim())).map(problem => {
              const override = problem.id in completionUpdates ? completionUpdates[problem.id] : editTarget?.completionOverrides[problem.id] ?? null;
              return <div className="practice-edit-problem" key={problem.id}>
                <label><input type="checkbox" checked={selectedProblems.includes(problem.id)} onChange={e => setSelectedProblems(value => e.target.checked ? [...value, problem.id] : value.filter(id => id !== problem.id))} /><span>{problem.number}. {problem.title}</span></label>
                <select aria-label={`${problem.title}的完成状态`} disabled={!selectedProblems.includes(problem.id)} value={override === null ? "auto" : override ? "done" : "todo"} onChange={e => setCompletionUpdates(value => ({ ...value, [problem.id]: e.target.value === "auto" ? null : e.target.value === "done" }))}>
                  <option value="auto">{editTarget?.completionOverrides[problem.id] !== undefined ? "恢复自动判断" : editTarget?.progress[problem.id]?.accepted ? "自动 · 已完成" : "自动 · 未完成"}</option><option value="done">标记完成</option><option value="todo">标记未完成</option>
                </select>
              </div>;
            })}</div>
            <p className="practice-edit-hint">自动判断沿用原进度。手动标记用于个人复习，不生成新的判题通过记录。</p>
          </section>}
          <button className="button primary practice-create" disabled={busy || (mode === "edit" && !selectedProblems.length) || (mode === "create" && !copyProgress && !all && !selectedCount)} type="submit">{busy ? <LoaderCircle className="spin" size={16} /> : mode === "edit" ? <Pencil size={16} /> : mode === "restart" ? <RotateCcw size={16} /> : copyProgress ? <Copy size={16} /> : <Plus size={16} />}{mode === "edit" ? "保存修改" : mode === "restart" ? "新建一轮，保留旧组" : copyProgress ? "复制进度并创建" : "创建并切换"}</button>
        </form> : mode === "groups" ? <>
          <div className="practice-list-toolbar"><span>{groups.length} 个练习组</span><label><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />显示归档</label></div>
          <div className="practice-group-list">{groups.filter(group => showArchived || !group.archivedAt).map(group => <article className={`practice-group-row ${group.id === catalog.practiceGroup.id ? "current" : ""}`} key={group.id}>
            <div className="practice-group-title"><strong>{group.name}</strong>{group.id === catalog.practiceGroup.id && <span className="practice-current">当前</span>}{group.archivedAt && <small>已归档</small>}
            </div>
            <div className="practice-group-progress"><span>{group.completed}<small> / {group.total} {group.manualCount ? "已完成 · 含手动" : "已通过"}</small></span><span className="practice-mini-track"><i style={{ width: `${group.total ? group.completed / group.total * 100 : 0}%` }} /></span></div>
            <div className="practice-group-dates"><span title={fullPracticeTime(group.createdAt)}>{group.legacyImported ? "导入" : "创建"} {practiceTime(group.createdAt)}</span><span title={group.lastPracticedAt ? fullPracticeTime(group.lastPracticedAt) : "尚未练习"}>最近 {practiceTime(group.lastPracticedAt)}</span></div>
            {group.copiedProgress && <p className="practice-copy-source">进度复制自 {groups.find(source => source.id === group.sourceGroupId)?.name ?? "来源组"}</p>}
            <footer><button disabled={busy} onClick={() => void perform(async () => {
              const detail = await api<GroupDetail>(`/api/practice-groups/${group.id}`);
              setEditTarget(detail); setName(detail.name); setAll(detail.chapterIds === null); setChapters(detail.chapterIds ?? []);
              setSelectedProblems(detail.problemIds); setCompletionUpdates({}); setProblemSearch(""); setMode("edit");
            })}><Pencil size={12} />编辑</button><button onClick={() => { setMode("create"); setCopyProgress(true); setCopySource(group.id); setName(`${group.name} · 副本`.slice(0, 80)); }}><Copy size={12} />复制进度</button><button disabled={busy} onClick={() => void perform(async () => { await api(`/api/practice-groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ archived: !group.archivedAt }) }); await onRefresh(); })}><Archive size={13} />{group.archivedAt ? "恢复" : "归档"}</button><button className="practice-continue" disabled={busy} onClick={() => void perform(async () => { await onSelect(group.id, group.lastProblemId ?? undefined); onClose(); })}>继续练习<ArrowRight size={14} /></button></footer>
          </article>)}</div>
          <p className="practice-help">归档只收起列表中的练习组，记录仍然保留，随时可恢复。</p>
        </> : <>
          <label className="practice-record-filter">练习组<select aria-label="筛选练习记录的组" value={recordGroup} onChange={e => { setRecordGroup(e.target.value); setOffset(0); }}>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <p className="practice-help">每次进入题目都有时间记录。刷新继续同一次；修改代码、运行或提交后计为一次练习。时间为新加坡时间（UTC+8）。</p>
          {!records && !error ? <div className="loading-block"><LoaderCircle className="spin" size={18} />正在读取…</div> : records && <>
            {!records.sessions.length && <div className="practice-empty"><Clock3 size={28} /><strong>这一轮，还没有练习记录</strong><span>从一道题开始，时间与代码会自动保存。</span></div>}
            {records.sessions.map(session => <article className="practice-session" key={session.id}>
              <header><strong>{session.problemTitle}</strong><span>{session.active ? "已练习" : "已浏览"}</span></header>
              <time title={fullPracticeTime(session.startedAt)}>{fullPracticeTime(session.startedAt)}</time>
              <p>{session.lastActiveAt ? `最后活动 ${fullPracticeTime(session.lastActiveAt)}` : "尚未编辑或执行"}{session.endedAt ? " · 已离开" : ""}</p>
              <footer><span>运行 {session.runs} 次 · 提交 {session.submits} 次</span><button onClick={() => void perform(async () => { await onSelect(recordGroup, session.problemId); onClose(); })}>打开题目与代码记录<ArrowRight size={13} /></button></footer>
            </article>)}
            {records.total > 30 && <div className="practice-pagination"><button disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 30))}><ChevronLeft size={16} />上一页</button><span>{offset + 1}–{Math.min(offset + 30, records.total)} / {records.total}</span><button disabled={offset + 30 >= records.total} onClick={() => setOffset(value => value + 30)}>下一页<ChevronRight size={16} /></button></div>}
          </>}
          {groups.find(group => group.id === recordGroup)?.legacyImported && <p className="practice-help">原有提交时间与代码已保留在题目历史里；旧版没有记录逐次练习，因此这里只统计升级后的练习。</p>}
        </>}
      </div>
    </div>
  </dialog>;
}
