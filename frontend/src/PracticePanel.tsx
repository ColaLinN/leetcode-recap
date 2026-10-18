import { useEffect, useRef, useState } from "react";
import { ArrowRight, Archive, Check, ChevronLeft, ChevronRight, Clock3, LoaderCircle, Plus, RotateCcw, X } from "lucide-react";
import type { Catalog, PracticeGroup, PracticeSession } from "./types";
import { api, jsonBody } from "./api";
import { fullPracticeTime, practiceTime } from "./practice";
import { ErrorBox } from "./ui";

export type PracticePanelMode = "groups" | "create" | "restart" | "records";
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
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [renamed, setRenamed] = useState("");
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
  const toggleChapter = (id: string) => setChapters(value => value.includes(id) ? value.filter(c => c !== id) : [...value, id]);
  const selectedCount = new Set(catalog.allChapters.filter(c => chapters.includes(c.id)).flatMap(c => c.problemIds)).size;
  const titles = { groups: "我的练习组", create: "新建练习组", restart: "开始新一轮", records: "练习记录" };
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
        {mode === "create" || mode === "restart" ? <form onSubmit={e => {
          e.preventDefault();
          void perform(async () => {
            const group = await api<PracticeGroup>("/api/practice-groups", jsonBody({ name,
              ...(mode === "restart" ? { restartFrom: catalog.practiceGroup.id } : all ? {} : { chapterIds: chapters }) }));
            await onSelect(group.id);
            onClose();
          });
        }}>
          <p className="practice-help">{mode === "restart" ? `沿用「${catalog.practiceGroup.name}」的 ${catalog.practiceGroup.total} 道题，从初始代码开始。旧组的草稿、进度和历史全部保留。` : "每组独立保存草稿和进度，随时切换，接着上次继续。"}</p>
          <label className="practice-field">练习组名称<input autoComplete="off" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={`第 ${groups.length + 1} 轮复习`} /></label>
          {mode === "create" && <>
            <fieldset className="practice-scope"><legend>选择题单</legend>
              <label><input type="radio" checked={all} onChange={() => setAll(true)} />全部题目 <span>默认</span></label>
              <label><input type="radio" checked={!all} onChange={() => setAll(false)} />自选章节 <span>{selectedCount} 道题 · 自动去重</span></label>
            </fieldset>
            {!all && <div className="practice-chapters">{["数据结构", "算法"].map(part => <section key={part}>
              <header><strong>{part}</strong><button type="button" onClick={() => {
                const ids = catalog.allChapters.filter(c => c.group === part).map(c => c.id);
                setChapters(value => ids.every(id => value.includes(id)) ? value.filter(id => !ids.includes(id)) : [...new Set([...value, ...ids])]);
              }}>全选 / 取消</button></header>
              {catalog.allChapters.filter(c => c.group === part).map(chapter => <label key={chapter.id}><input type="checkbox" checked={chapters.includes(chapter.id)} onChange={() => toggleChapter(chapter.id)} /><span>{chapter.title}</span><small>{chapter.problemIds.length} 题</small></label>)}
            </section>)}</div>}
          </>}
          <button className="button primary practice-create" disabled={busy || (mode === "create" && !all && !selectedCount)} type="submit">{busy ? <LoaderCircle className="spin" size={16} /> : mode === "restart" ? <RotateCcw size={16} /> : <Plus size={16} />}{mode === "restart" ? "新建一轮，保留旧组" : "创建并切换"}</button>
        </form> : mode === "groups" ? <>
          <div className="practice-list-toolbar"><span>{groups.length} 个练习组</span><label><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />显示归档</label></div>
          <div className="practice-group-list">{groups.filter(group => showArchived || !group.archivedAt).map(group => <article className={`practice-group-row ${group.id === catalog.practiceGroup.id ? "current" : ""}`} key={group.id}>
            <div className="practice-group-title">{editing === group.id ? <form onSubmit={e => { e.preventDefault(); void perform(async () => {
              await api(`/api/practice-groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ name: renamed }) });
              setEditing(null); await onRefresh();
            }); }}><input aria-label="练习组新名称" value={renamed} onChange={e => setRenamed(e.target.value)} maxLength={80} autoFocus /><button className="icon-button" disabled={busy} aria-label="保存名称"><Check size={16} /></button><button type="button" className="icon-button" onClick={() => setEditing(null)} aria-label="取消改名"><X size={16} /></button></form> : <><strong>{group.name}</strong>{group.id === catalog.practiceGroup.id && <span className="practice-current">当前</span>}{group.archivedAt && <small>已归档</small>}</>}
            </div>
            <div className="practice-group-progress"><span>{group.completed}<small> / {group.total} 已通过</small></span><span className="practice-mini-track"><i style={{ width: `${group.total ? group.completed / group.total * 100 : 0}%` }} /></span></div>
            <div className="practice-group-dates"><span title={fullPracticeTime(group.createdAt)}>{group.legacyImported ? "导入" : "创建"} {practiceTime(group.createdAt)}</span><span title={group.lastPracticedAt ? fullPracticeTime(group.lastPracticedAt) : "尚未练习"}>最近 {practiceTime(group.lastPracticedAt)}</span></div>
            <footer><button onClick={() => { setEditing(group.id); setRenamed(group.name); }}>改名</button><button disabled={busy} onClick={() => void perform(async () => { await api(`/api/practice-groups/${group.id}`, { method: "PATCH", body: JSON.stringify({ archived: !group.archivedAt }) }); await onRefresh(); })}><Archive size={13} />{group.archivedAt ? "恢复" : "归档"}</button><button className="practice-continue" disabled={busy} onClick={() => void perform(async () => { await onSelect(group.id, group.lastProblemId ?? undefined); onClose(); })}>继续练习<ArrowRight size={14} /></button></footer>
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
