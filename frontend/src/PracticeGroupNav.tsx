import { useState } from "react";
import { Archive, FolderOpen, Folders, LoaderCircle, Plus, Settings2 } from "lucide-react";
import type { PracticeGroup } from "./types";
import type { PracticePanelMode } from "./PracticePanel";
import "./PracticeGroupNav.css";

export default function PracticeGroupNav({ groups, currentId, onSelect, onManage }: {
  groups: PracticeGroup[];
  currentId: string;
  onSelect: (id: string) => Promise<void>;
  onManage: (mode: PracticePanelMode) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const archivedCount = groups.filter(group => group.archivedAt).length;
  const visibleGroups = groups.filter(group => !group.archivedAt || group.id === currentId);
  const select = async (id: string) => {
    if (pending) return;
    setPending(id);
    setError("");
    try { await onSelect(id); } catch (e) { setError((e as Error).message); } finally { setPending(null); }
  };
  return <section className="practice-nav" aria-label="练习组导航">
    <div className="practice-nav-full">
      <header><span>练习组</span><button aria-label="新建练习组" title="新建练习组" onClick={() => onManage("create")}><Plus size={15} /></button></header>
      <nav className="practice-nav-list" aria-label="我的练习组">
        {visibleGroups.map(group => <button key={group.id} className={group.id === currentId ? "active" : ""}
          aria-current={group.id === currentId ? "true" : undefined}
          title={`${group.name} · ${group.completed}/${group.total}${group.archivedAt ? " · 已归档" : ""}`}
          disabled={pending !== null} onClick={() => void select(group.id)}>
          {pending === group.id ? <LoaderCircle size={15} className="spin" /> : <FolderOpen size={15} />}
          <span>{group.name}{group.archivedAt && <small>已归档</small>}</span>
          <b>{group.completed}/{group.total}</b>
        </button>)}
      </nav>
      <div className="practice-nav-actions">
        <button onClick={() => onManage("archived")} aria-label={`查看已归档练习组，共 ${archivedCount} 组`}><Archive size={13} /><span>已归档</span><b>{archivedCount}</b></button>
        <button onClick={() => onManage("groups")} aria-label="管理练习组" title="管理练习组"><Settings2 size={14} /></button>
      </div>
      {error && <p className="practice-nav-error" role="alert">{error}</p>}
    </div>
    <div className="practice-nav-compact">
      <button aria-label="管理练习组" title="练习组与归档恢复" onClick={() => onManage("groups")}><Folders size={19} /></button>
      <button aria-label="新建练习组" title="新建练习组" onClick={() => onManage("create")}><Plus size={19} /></button>
    </div>
  </section>;
}
