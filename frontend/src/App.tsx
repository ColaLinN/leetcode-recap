import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Home,
  Layers3,
  LoaderCircle,
  Menu,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { api } from "./api";
import type { Catalog, Health } from "./types";
import { go, parseRoute } from "./router";
import type { Route } from "./router";
import { ErrorBox } from "./ui";
import {
  Dashboard,
  ChapterPage,
  NotesPage,
  ReviewPage,
  SearchResults,
} from "./Pages";
import Workspace from "./Workspace";
import { activeLearningPart, buildLearningParts, expandActivePart } from "./learningPath";
export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [resume, setResume] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedParts, setExpandedParts] = useState<Record<string, boolean>>({ 数据结构: false, 算法: false });
  const searchRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    setError("");
    try {
      const [data, resumeData, healthData] = await Promise.all([
        api<Catalog>("/api/catalog"),
        api<{ problemId: string | null }>("/api/resume"),
        api<Health>("/api/health"),
      ]);
      setCatalog({ ...data, progress: data.progress ?? {} });
      setResume(resumeData.problemId);
      setHealth(healthData);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const onHash = () => {
      setRoute(parseRoute());
      setSearch("");
      setMenuOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [load]);
  useEffect(() => {
    const updateResume = () => {
      void api<{ problemId: string | null }>("/api/resume")
        .then((v) => setResume(v.problemId))
        .catch(() => undefined);
    };
    window.addEventListener("recap-draft-saved", updateResume);
    window.addEventListener("hashchange", updateResume);
    return () => {
      window.removeEventListener("recap-draft-saved", updateResume);
      window.removeEventListener("hashchange", updateResume);
    };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const refreshProgress = useCallback(async () => {
    const [data, resumeData] = await Promise.all([
      api<Catalog>("/api/catalog"),
      api<{ problemId: string | null }>("/api/resume"),
    ]);
    setCatalog({ ...data, progress: data.progress ?? {} });
    setResume(resumeData.problemId);
  }, []);
  const workspace = route.kind === "problem";
  const activeChapter = catalog?.chapters.find(
    (chapter) => chapter.id === route.id,
  );
  const learningParts = catalog ? buildLearningParts(catalog) : [];
  const activePart = catalog ? activeLearningPart(catalog, route) : undefined;
  useEffect(() => {
    setExpandedParts((expanded) => activePart ? expandActivePart(expanded, activePart.id) : { 数据结构: false, 算法: false });
  }, [activePart?.id, route.kind, route.id, route.chapterId]);
  const updateReview = async (id: string, review: boolean) => {
    await api(`/api/problems/${id}/review`, {
      method: "PUT",
      body: JSON.stringify({ review }),
    });
    await refreshProgress();
  };
  const completed = catalog
    ? Object.values(catalog.progress).filter((p) => p.accepted).length
    : 0;
  const reviewCount = catalog
    ? Object.values(catalog.progress).filter((p) => p.review).length
    : 0;
  return (
    <div className={`app-shell ${workspace ? "workspace-mode" : ""}`}>
      <aside className={`sidebar ${menuOpen ? "mobile-open" : ""}`}>
        <button
          className="brand"
          onClick={() => go("home")}
          aria-label="Recap 首页"
        >
          <span className="brand-mark">
            <Layers3 size={25} strokeWidth={2.2} />
          </span>
          <span className="brand-name">
            recap<span>算法，温故而知新</span>
          </span>
        </button>
        <div className="sidebar-label">个人学习空间</div>
        <nav className="primary-nav">
          <button
            className={route.kind === "home" ? "active" : ""}
            onClick={() => go("home")}
            title="学习总览"
          >
            <Home size={19} />
            <span>学习总览</span>
          </button>
          <button
            className={route.kind === "review" ? "active" : ""}
            onClick={() => go("review")}
            title="待复习"
          >
            <Bookmark size={19} />
            <span>待复习</span>
            {reviewCount > 0 && <b>{reviewCount}</b>}
          </button>
          <button
            className={route.kind === "notes" ? "active" : ""}
            onClick={() => go("notes")}
            title="专题笔记"
          >
            <BookOpen size={19} />
            <span>专题笔记</span>
          </button>
        </nav>
        <div className="sidebar-label chapter-label">
          学习路径 <span>{learningParts.length || "—"} 大章节 · {catalog?.chapters.length ?? "—"} 专题</span>
        </div>
        <nav className="chapter-nav" aria-label="章节学习路径">
          {learningParts.map((part) => (
            <div className="learning-nav-part" key={part.id}>
              <button
                className={`learning-nav-toggle ${activePart?.id === part.id ? "current" : ""}`}
                aria-expanded={Boolean(expandedParts[part.id])}
                aria-controls={`nav-${part.key}`}
                onClick={() => setExpandedParts((expanded) => ({ ...expanded, [part.id]: !expanded[part.id] }))}
              >
                <span className="learning-nav-number">{part.number}</span>
                <span className="learning-nav-title"><small>{part.label}</small><strong>{part.id}</strong></span>
                <span className="learning-nav-count">{part.chapters.length} 专题</span>
                <ChevronDown size={14} className={expandedParts[part.id] ? "" : "is-collapsed"} />
              </button>
              <div className="learning-nav-topics" id={`nav-${part.key}`} hidden={!expandedParts[part.id]}>
                {part.chapters.map((chapter) => {
                  const index = catalog!.chapters.indexOf(chapter);
                  const total = chapter.problemIds.length;
                  const done = chapter.problemIds.filter(
                    (id) => catalog!.progress[id]?.accepted,
                  ).length;
                  return (
                    <button
                      aria-current={route.kind === "chapter" && route.id === chapter.id ? "page" : undefined}
                      className={
                        route.kind === "chapter" && route.id === chapter.id
                          ? "active"
                          : ""
                      }
                      onClick={() => go("chapter", chapter.id)}
                      key={chapter.id}
                      title={chapter.title}
                    >
                      <span
                        className={`chapter-dot ${done === total && total > 0 ? "done" : ""}`}
                      >
                        {done === total && total > 0 ? (
                          <Check size={11} />
                        ) : (
                          String(index + 1).padStart(2, "0")
                        )}
                      </span>
                      <span>{chapter.title}</span>
                      {done > 0 && (
                        <i>
                          {done}/{total}
                        </i>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <span className="status-dot" />
            <span>本地工作台</span>
            <span className="keycap">Python</span>
          </div>
          <div className="user-avatar">F</div>
          <div className="user-info">
            <strong>我的算法旅程</strong>
            <span>每天一点，离熟练更近</span>
          </div>
          <Settings2 size={16} className="user-settings" />
        </div>
      </aside>
      {menuOpen && (
        <button
          aria-label="关闭导航"
          className="mobile-backdrop"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <main className="main-shell">
        {!workspace && (
          <header className="topbar">
            <div className="topbar-breadcrumb">
              <button
                className="mobile-menu icon-button"
                aria-label="打开导航"
                onClick={() => setMenuOpen(true)}
              >
                <Menu size={21} />
              </button>
              <span>我的工作台</span>
              <ChevronRight size={13} />
              {route.kind === "chapter" && activePart && (
                <><span>{activePart.id}</span><ChevronRight size={13} /></>
              )}
              <strong>
                {route.kind === "chapter"
                  ? activeChapter?.title
                  : route.kind === "review"
                    ? "待复习"
                    : route.kind === "notes"
                      ? "专题笔记"
                      : "学习总览"}
              </strong>
            </div>
            <label className="search-box">
              <Search size={16} />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索题目、知识点…"
                aria-label="搜索题目和知识点"
              />
              <kbd>⌘ K</kbd>
              {search && (
                <button
                  className="icon-button"
                  aria-label="清除搜索"
                  onClick={() => setSearch("")}
                >
                  <X size={13} />
                </button>
              )}
            </label>
            <span className="topbar-python">
              <span
                className={`status-dot ${health?.judge.available ? "" : "warning"}`}
              />
              {health?.judge.available ? "Python 判题已就绪" : "Python 工作台"}
            </span>
          </header>
        )}
        {error ? (
          <div className="page-content">
            <ErrorBox
              message={`无法连接本地服务：${error}`}
              retry={() => void load()}
            />
          </div>
        ) : !catalog ? (
          <div className="app-loading">
            <LoaderCircle className="spin" size={30} />
            <p>正在打开你的算法工作台…</p>
          </div>
        ) : workspace ? (
          <Workspace
            key={route.id}
            id={route.id ?? ""}
            catalog={catalog}
            health={health}
            chapterId={route.chapterId}
            onRefresh={refreshProgress}
            onReview={updateReview}
          />
        ) : search.trim() ? (
          <SearchResults query={search} catalog={catalog} />
        ) : route.kind === "chapter" ? (
          <ChapterPage
            key={route.id}
            chapter={activeChapter}
            catalog={catalog}
          />
        ) : route.kind === "review" ? (
          <ReviewPage catalog={catalog} onReview={updateReview} />
        ) : route.kind === "notes" ? (
          <NotesPage key={route.id} catalog={catalog} initial={route.id} />
        ) : (
          <Dashboard catalog={catalog} completed={completed} resume={resume} />
        )}
      </main>
    </div>
  );
}
