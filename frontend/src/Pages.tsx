import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  ExternalLink,
  FileText,
  FolderOpen,
  GraduationCap,
  Layers3,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import type { Catalog, Chapter, Note, Problem, Progress } from "./types";
import { go } from "./router";
import { Difficulty, Empty, ErrorBox, IconTile, ProgressRing } from "./ui";
import Markdown from "./Markdown";
export function Dashboard({
  catalog,
  completed,
  resume,
}: {
  catalog: Catalog;
  completed: number;
  resume: string | null;
}) {
  const resumeProblem = catalog.problems.find((p) => p.id === resume);
  const nextChapter =
    catalog.chapters.find((c) =>
      c.problemIds.some((id) => !catalog.progress[id]?.accepted),
    ) ?? catalog.chapters[0];
  const [group, setGroup] = useState("全部章节");
  const groups = ["全部章节", ...new Set(catalog.chapters.map((c) => c.group))];
  const chapters =
    group === "全部章节"
      ? catalog.chapters
      : catalog.chapters.filter((c) => c.group === group);
  return (
    <div className="page-content dashboard">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-sparkle">✦</span> BUILD UNDERSTANDING, ONE
            PROBLEM AT A TIME
          </div>
          <h1>
            温故，知新<span className="heading-dot">.</span>
          </h1>
          <p>把零散的解题记忆，连成自己的知识地图。</p>
        </div>
        <span className="quiet-chip">
          <span className="status-dot" />
          个人学习空间
        </span>
      </div>
      <section className="welcome-card">
        <div className="welcome-copy">
          <span className="pill">
            <Sparkles size={13} />
            为理解而练习
          </span>
          <h2>
            每一道题，
            <br />
            都是一次新的连接。
          </h2>
          <p>
            读懂一个专题，亲手写下答案。
            <br />
            用自己的节奏，把知识留在脑海里。
          </p>
          <button
            className="button primary"
            onClick={() =>
              resumeProblem
                ? go("problem", resumeProblem.id)
                : nextChapter && go("chapter", nextChapter.id)
            }
          >
            {resumeProblem ? "继续上次学习" : "开启学习旅程"}
            <ArrowRight size={16} />
          </button>
          {resumeProblem && (
            <span className="resume-caption">
              上次停在 {resumeProblem.number}. {resumeProblem.title}
            </span>
          )}
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orb orb-one" />
          <div className="orb orb-two" />
          <div className="art-grid" />
          <div className="floating-note note-back">
            <span className="mini-icon">
              <Layers3 size={22} />
            </span>
            <strong>理解 · 连接 · 复习</strong>
            <div className="mini-lines">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="floating-code">
            <div className="code-top">
              <span />
              <span />
              <span />
              <b>solution.py</b>
            </div>
            <code>
              <span className="purple-text">def</span>{" "}
              <span className="blue-text">learn</span>(today):
              <br />
              &nbsp;&nbsp;practice = <span className="green-text">True</span>
              <br />
              &nbsp;&nbsp;<span className="purple-text">return</span> today +{" "}
              <span className="orange-text">1</span>
            </code>
            <div className="code-success">
              <CheckCircle2 size={15} />
              每天进步一点点
            </div>
          </div>
          <span className="floating-check">
            <Check size={25} />
          </span>
          <span className="art-star">✦</span>
        </div>
      </section>
      <div className="stat-grid">
        <Stat
          icon={<CheckCircle2 size={20} />}
          label="已掌握题目"
          value={completed}
          suffix={`/ ${catalog.problems.length}`}
          tone="green"
          detail="每一次通过，都是积累"
        />
        <Stat
          icon={<Layers3 size={20} />}
          label="学习章节"
          value={catalog.chapters.length}
          suffix="章"
          tone="blue"
          detail="沿着清晰的路径前进"
        />
        <Stat
          icon={<BookOpen size={20} />}
          label="专题笔记"
          value={catalog.notes.length}
          suffix="篇"
          tone="purple"
          detail="你的知识，随时回顾"
        />
        <Stat
          icon={<Bookmark size={20} />}
          label="待复习"
          value={Object.values(catalog.progress).filter((p) => p.review).length}
          suffix="题"
          tone="orange"
          detail="把还不熟悉的，再练一遍"
          onClick={() => go("review")}
        />
      </div>
      <section className="path-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR LEARNING PATH</span>
            <h2>循序渐进，构建知识体系</h2>
          </div>
          <div className="path-summary">
            <ProgressRing
              value={
                catalog.problems.length
                  ? completed / catalog.problems.length
                  : 0
              }
              size={35}
            />
            <span>整体完成度</span>
          </div>
        </div>
        <div className="filter-tabs">
          {groups.map((g) => (
            <button
              key={g}
              className={group === g ? "active" : ""}
              onClick={() => setGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="chapter-grid">
          {chapters.map((chapter) => {
            const index = catalog.chapters.indexOf(chapter);
            const count = chapter.problemIds.length;
            const done = chapter.problemIds.filter(
              (id) => catalog.progress[id]?.accepted,
            ).length;
            return (
              <button
                className="chapter-card"
                onClick={() => go("chapter", chapter.id)}
                key={chapter.id}
              >
                <div className="chapter-card-top">
                  <IconTile index={index} />
                  <span className="chapter-number">
                    CHAPTER {String(index + 1).padStart(2, "0")}
                  </span>
                  <ArrowUpRight size={17} className="card-arrow" />
                </div>
                <h3>{chapter.title}</h3>
                <p>
                  {chapter.subtitle ||
                    "从核心思路到动手实现，逐步掌握这个专题。"}
                </p>
                <div className="chapter-card-bottom">
                  <span>
                    <Code2 size={14} />
                    {count} 道练习
                  </span>
                  <span>
                    <FileText size={14} />
                    {chapter.noteIds.length} 篇笔记
                  </span>
                  <span
                    className={
                      done > 0 ? "progress-label started" : "progress-label"
                    }
                  >
                    {done === count && count > 0
                      ? "已完成"
                      : done > 0
                        ? `${done}/${count} 已通过`
                        : "未开始"}
                  </span>
                </div>
                <div className="thin-progress">
                  <i
                    style={{ width: `${count ? (done / count) * 100 : 0}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </section>
      <footer className="page-footer">
        <span className="brand-footer">
          <Layers3 size={15} />
          recap
        </span>
        <span>让每一次练习，都成为长久的理解。</span>
        <span>本地运行 · 进度私有</span>
      </footer>
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  suffix,
  tone,
  detail,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  suffix: string;
  tone: string;
  detail: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`stat-card ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className={`stat-icon ${tone}`}>{icon}</span>
      <div>
        <span className="stat-label">{label}</span>
        <div className="stat-value">
          {value}
          <small>{suffix}</small>
        </div>
        <span className="stat-detail">{detail}</span>
      </div>
    </button>
  );
}
export function SearchResults({
  query,
  catalog,
}: {
  query: string;
  catalog: Catalog;
}) {
  const normalized = query.trim().toLowerCase();
  const problems = catalog.problems.filter((p) =>
    `${p.number} ${p.title} ${p.tags.join(" ")}`
      .toLowerCase()
      .includes(normalized),
  );
  const chapters = catalog.chapters.filter((c) =>
    `${c.title} ${c.subtitle}`.toLowerCase().includes(normalized),
  );
  const notes = catalog.notes.filter((n) =>
    n.title.toLowerCase().includes(normalized),
  );
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEARCH RESULTS</span>
          <h1>搜索「{query}」</h1>
          <p>
            {problems.length} 道题目 · {chapters.length} 个章节 · {notes.length}{" "}
            篇笔记
          </p>
        </div>
      </div>
      {chapters.length > 0 && (
        <div className="search-chapters">
          {chapters.map((c) => (
            <button
              className="button secondary"
              key={c.id}
              onClick={() => go("chapter", c.id)}
            >
              <FolderOpen size={16} />
              {c.title}
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      )}
      {problems.length > 0 && (
        <ProblemTable problems={problems} progress={catalog.progress} />
      )}
      <div className="search-notes">
        {notes.map((note) => (
          <button
            className="note-mini"
            key={note.id}
            onClick={() => go("notes", note.id)}
          >
            <FileText size={19} />
            <strong>{note.title}</strong>
            <ArrowRight size={15} />
          </button>
        ))}
      </div>
      {!problems.length && !chapters.length && !notes.length && (
        <Empty
          title="没有找到相关内容"
          description="试试题目编号、中文标题或算法标签。"
        />
      )}
    </div>
  );
}
function ProblemTable({
  problems,
  progress,
  onReview,
  chapterId,
}: {
  problems: Problem[];
  progress: Record<string, Progress>;
  chapterId?: string;
  onReview?: (id: string, review: boolean) => Promise<void>;
}) {
  const [error, setError] = useState("");
  return (
    <div className="problem-table panel">
      <div className="table-head">
        <span>状态</span>
        <span>题目</span>
        <span>难度</span>
        <span>知识点</span>
        <span />
      </div>
      {problems.map((p) => (
        <div className="problem-row" key={p.id}>
          <span
            className={
              progress[p.id]?.accepted
                ? "problem-status accepted"
                : "problem-status"
            }
          >
            {progress[p.id]?.accepted ? (
              <CheckCircle2 size={19} />
            ) : progress[p.id]?.attempts ? (
              <Clock3 size={18} />
            ) : (
              <Circle size={18} />
            )}
          </span>
          <button
            className="problem-title"
            onClick={() => go("problem", p.id, chapterId)}
          >
            <span>{p.number}.</span>
            {p.title}
          </button>
          <Difficulty value={p.difficulty} />
          <div className="tag-list">
            {p.tags.slice(0, 2).map((t) => (
              <span className="tag" key={t}>
                {t}
              </span>
            ))}
          </div>
          {onReview ? (
            <button
              className={`icon-button review-icon ${progress[p.id]?.review ? "marked" : ""}`}
              aria-label={`将 ${p.title} 移出待复习`}
              onClick={() =>
                void onReview(p.id, false).catch((e) =>
                  setError((e as Error).message),
                )
              }
            >
              <Bookmark size={17} fill="currentColor" />
            </button>
          ) : (
            <button
              className="row-open icon-button"
              title="开始练习"
              aria-label={`练习 ${p.title}`}
              onClick={() => go("problem", p.id, chapterId)}
            >
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      ))}
      {error && <p className="inline-error">{error}</p>}
    </div>
  );
}
export function ReviewPage({
  catalog,
  onReview,
}: {
  catalog: Catalog;
  onReview: (id: string, review: boolean) => Promise<void>;
}) {
  const problems = catalog.problems.filter(
    (p) => catalog.progress[p.id]?.review,
  );
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE IT STICK</span>
          <h1>值得再想一遍</h1>
          <p>把还没完全掌握的题目留下，下次再与它相遇。</p>
        </div>
        <span className="quiet-chip">
          <Bookmark size={14} />
          {problems.length} 道待复习
        </span>
      </div>
      {problems.length ? (
        <ProblemTable
          problems={problems}
          progress={catalog.progress}
          onReview={onReview}
        />
      ) : (
        <div className="panel">
          <Empty
            title="复习清单很轻盈"
            description="在做题页点击「待复习」，把想回头思考的题目收在这里。"
            icon="check"
          />
        </div>
      )}
    </div>
  );
}
export function ChapterPage({
  chapter,
  catalog,
}: {
  chapter?: Chapter;
  catalog: Catalog;
}) {
  const [tab, setTab] = useState<"practice" | "notes">("practice");
  if (!chapter)
    return (
      <div className="page-content">
        <Empty title="没有找到这个章节" />
      </div>
    );
  const index = catalog.chapters.indexOf(chapter);
  const problems = chapter.problemIds
    .map((id) => catalog.problems.find((p) => p.id === id))
    .filter((p): p is Problem => Boolean(p));
  const notes = chapter.noteIds
    .map((id) => catalog.notes.find((n) => n.id === id))
    .filter((n): n is Note => Boolean(n));
  const done = problems.filter((p) => catalog.progress[p.id]?.accepted).length;
  const next =
    problems.find((p) => !catalog.progress[p.id]?.accepted) ?? problems[0];
  return (
    <div className="page-content chapter-page">
      <button className="back-link" onClick={() => go("home")}>
        <ArrowLeft size={15} />
        学习总览
      </button>
      <section className="chapter-banner">
        <IconTile index={index} />
        <div className="chapter-heading">
          <span className="eyebrow">
            CHAPTER {String(index + 1).padStart(2, "0")} · {chapter.group}
          </span>
          <h1>{chapter.title}</h1>
          <p>{chapter.subtitle}</p>
        </div>
        <div className="chapter-overview">
          <ProgressRing
            value={problems.length ? done / problems.length : 0}
            size={56}
          />
          <span>
            {done} / {problems.length} 已通过
          </span>
        </div>
      </section>
      <div className="chapter-tip">
        <span className="tip-icon">
          <GraduationCap size={22} />
        </span>
        <p>
          <strong>先理解，再动手。</strong>
          从专题笔记开始梳理思路，再通过练习建立直觉。
        </p>
        {next && (
          <button
            className="button primary small"
            onClick={() => go("problem", next.id, chapter.id)}
          >
            开始练习
            <ArrowRight size={14} />
          </button>
        )}
      </div>
      <div className="content-tabs">
        <button
          className={tab === "practice" ? "active" : ""}
          onClick={() => setTab("practice")}
        >
          <Code2 size={16} />
          章节练习<span>{problems.length}</span>
        </button>
        <button
          className={tab === "notes" ? "active" : ""}
          onClick={() => setTab("notes")}
        >
          <BookOpen size={16} />
          导读与笔记<span>{notes.length || 1}</span>
        </button>
      </div>
      {tab === "practice" ? (
        <>
          <ProblemTable
            problems={problems}
            progress={catalog.progress}
            chapterId={chapter.id}
          />
          <div className="chapter-source">
            <FileText size={15} />
            <span>题目测试由本项目维护，提交通过表示通过本地测试集。</span>
            {chapter.referenceUrls?.map((url, i) => (
              <a href={url} key={url} target="_blank" rel="noreferrer">
                {i === 0 ? "参考学习路径" : `参考 ${i + 1}`}
                <ExternalLink size={12} />
              </a>
            ))}
          </div>
        </>
      ) : (
        <>
          {chapter.overview && (
            <article className="panel chapter-guide">
              <span className="quiet-chip">
                <GraduationCap size={14} />
                章节导读
              </span>
              <Markdown text={chapter.overview} />
              {chapter.referenceUrls?.map((url) => (
                <a
                  className="source-link"
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  参考资料
                  <ExternalLink size={12} />
                </a>
              ))}
            </article>
          )}
          {notes.length > 0 && (
            <NoteReader notes={notes} problems={catalog.problems} />
          )}
        </>
      )}
    </div>
  );
}
export function NotesPage({
  catalog,
  initial,
}: {
  catalog: Catalog;
  initial?: string;
}) {
  return (
    <div className="page-content notes-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR KNOWLEDGE LIBRARY</span>
          <h1>知识，随手翻阅</h1>
          <p>保留原始专题与插图，沿着自己的思考路径继续探索。</p>
        </div>
        <span className="quiet-chip">
          <BookOpen size={14} />
          {catalog.notes.length} 篇专题
        </span>
      </div>
      <NoteReader
        notes={catalog.notes}
        initial={initial}
        problems={catalog.problems}
      />
    </div>
  );
}
export function NoteReader({
  notes,
  initial,
  problems = [],
}: {
  notes: Note[];
  initial?: string;
  problems?: Problem[];
}) {
  const [selected, setSelected] = useState(
    initial && notes.some((n) => n.id === initial)
      ? initial
      : (notes[0]?.id ?? ""),
  );
  const note = notes.find((n) => n.id === selected);
  if (!notes.length)
    return (
      <div className="panel">
        <Empty
          title="从动手实践开始"
          description="参考思路与 Python 解法收录在每道题的题解中。"
        />
      </div>
    );
  return (
    <div className="note-reader panel">
      <aside className="note-toc">
        <span className="small-label">专题目录</span>
        {notes.map((n) => (
          <button
            className={n.id === selected ? "active" : ""}
            key={n.id}
            onClick={() => setSelected(n.id)}
          >
            <FileText size={15} />
            <span>{n.title}</span>
            <ChevronRight size={13} />
          </button>
        ))}
      </aside>
      <article className="note-article">
        {note && (
          <>
            <div className="note-article-heading">
              <span className="quiet-chip">
                <BookOpen size={13} />
                原始专题笔记
              </span>
              <h2>{note.title}</h2>
              <span className="note-source" title={note.sourcePath}>
                来源：{note.sourcePath.split("/").pop()}
              </span>
            </div>
            <ReadingLinks note={note} problems={problems} />
            <NoteContent note={note} />
          </>
        )}
      </article>
    </div>
  );
}
function NoteContent({ note }: { note: Note }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setText("");
    setError("");
    const path = note.path.startsWith("/")
      ? note.path
      : `/${note.path.replace(/^data\//, "")}`;
    fetch(path)
      .then(async (r) => {
        if (!r.ok) throw new Error("笔记加载失败，请检查内容是否已导入。");
        return r.text();
      })
      .then((v) => {
        if (!cancelled) setText(v);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [note.path]);
  if (error) return <ErrorBox message={error} />;
  return text ? (
    <Markdown text={text} />
  ) : (
    <div className="loading-block">
      <LoaderCircle size={20} className="spin" />
      正在加载笔记…
    </div>
  );
}

function ReadingLinks({ note, problems }: { note: Note; problems: Problem[] }) {
  const slug = (url: string) => url.match(/\/problems\/([^/#?]+)/)?.[1];
  return (
    <div className="reading-links">
      <p>
        <BookOpen size={13} />
        <span>
          原文中的题目链接用于延伸阅读；仅章节练习中的精选题支持本地判题。
        </span>
      </p>
      {Boolean(note.problemLinks?.length) && (
        <details>
          <summary>
            原文题目索引<span>{note.problemLinks?.length} 题</span>
            <ChevronRight size={12} />
          </summary>
          <div className="reading-link-list">
            {note.problemLinks?.map((link, i) => {
              const local = problems.find(
                (p) =>
                  slug(p.sourceUrl) && slug(p.sourceUrl) === slug(link.url),
              );
              return (
                <div className="reading-link-row" key={`${link.url}-${i}`}>
                  <a
                    href={
                      local
                        ? `#/problem/${encodeURIComponent(local.id)}`
                        : link.url
                    }
                    target={local ? undefined : "_blank"}
                    rel={local ? undefined : "noreferrer"}
                  >
                    {link.title}
                    {local ? (
                      <ArrowRight size={12} />
                    ) : (
                      <ExternalLink size={11} />
                    )}
                  </a>
                  <span className={local ? "local-exercise" : "reading-only"}>
                    {local ? "本地练习" : "阅读入口 · 尚未支持本地判题"}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
