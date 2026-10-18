import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  ExternalLink,
  FileText,
  FolderOpen,
  GraduationCap,
  LoaderCircle,
} from "lucide-react";
import type { Catalog, Chapter, Note, Problem, Progress } from "./types";
import { go } from "./router";
import { Difficulty, Empty, ErrorBox, IconTile, ProgressRing } from "./ui";
import Markdown from "./Markdown";
import { buildLearningParts, learningPartForChapter } from "./learningPath";
export function Dashboard({
  catalog,
  completed,
  resume,
}: {
  catalog: Catalog;
  completed: number;
  resume: string | null;
}) {
  const resumeProblem = catalog.problems.find((problem) => problem.id === resume);
  const [group, setGroup] = useState("全部");
  const learningParts = buildLearningParts(catalog);
  const groups = ["全部", ...learningParts.map((part) => part.id)];
  return (
    <div className="page-content dashboard">
      <header className="dashboard-heading">
        <h1>学习进度</h1>
        <div className="dashboard-actions">
          <span className="dashboard-progress">已通过 <strong>{completed} / {catalog.problems.length}</strong></span>
          {resumeProblem && (
            <button
              className="button primary small"
              onClick={() => go("problem", resumeProblem.id)}
              title={`继续 ${resumeProblem.number}. ${resumeProblem.title}`}
            >
              继续学习 <ArrowRight size={14} />
            </button>
          )}
        </div>
      </header>
      <div className="dashboard-pathbar">
        <span>{learningParts.length} 大章节 · {catalog.chapters.length} 专题</span>
        <div className="filter-tabs" aria-label="筛选学习大章节">
          {groups.map((part) => (
            <button
              key={part}
              className={group === part ? "active" : ""}
              aria-pressed={group === part}
              onClick={() => setGroup(part)}
            >
              {part}
            </button>
          ))}
        </div>
      </div>
      {learningParts.filter((part) => group === "全部" || group === part.id).map((part) => (
        <section className="learning-part" key={part.id} aria-labelledby={`heading-${part.key}`}>
          <header className="learning-part-heading">
            <span className="learning-part-label">{part.label}</span>
            <h2 id={`heading-${part.key}`}>{part.id}</h2>
            <span className="learning-part-count">{part.chapters.length} 专题 · {part.problemIds.length} 题</span>
          </header>
          <div className="chapter-grid">
            {part.chapters.map((chapter) => {
              const index = catalog.chapters.indexOf(chapter);
              const count = chapter.problemIds.length;
              const done = chapter.problemIds.filter((id) => catalog.progress[id]?.accepted).length;
              return (
                <button
                  className="chapter-card"
                  onClick={() => go("chapter", chapter.id)}
                  title={chapter.title}
                  key={chapter.id}
                >
                  <span className="chapter-number">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{chapter.title}</h3>
                  <p>{chapter.subtitle}</p>
                  <div className="chapter-card-progress">
                    <span
                      className="chapter-progress-segments"
                      role="progressbar"
                      aria-label={`${chapter.title}完成进度`}
                      aria-valuemin={0}
                      aria-valuemax={count}
                      aria-valuenow={done}
                    >
                      {[0, 1, 2].map((segment) => (
                        <i key={segment}>
                          <span style={{ width: `${Math.max(0, Math.min(1, (count ? done / count : 0) * 3 - segment)) * 100}%` }} />
                        </i>
                      ))}
                    </span>
                    <span>{done}/{count}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
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
            {problems.length} 道题目 · {chapters.length} 个专题 · {notes.length}{" "}
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
        <Empty title="没有找到这个专题" />
      </div>
    );
  const index = catalog.chapters.indexOf(chapter);
  const learningPart = learningPartForChapter(chapter);
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
      <div className="chapter-page-breadcrumb">
        <button className="back-link" onClick={() => go("home")}>
          <ArrowLeft size={15} />
          学习总览
        </button>
      {learningPart && <><ChevronRight size={13} /><span>{learningPart.label} · {learningPart.id}</span></>}
      </div>
      <section className="chapter-banner">
        <IconTile index={index} />
        <div className="chapter-heading">
          <span className="eyebrow">
            {chapter.group} / 专题 {String(index + 1).padStart(2, "0")}
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
          专题练习<span>{problems.length}</span>
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
                专题导读
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
  const [showOriginal, setShowOriginal] = useState(false);
  const translated = Boolean(note?.chinesePath) && !showOriginal;
  const visibleNote = note
    ? {
        ...note,
        path: translated ? note.chinesePath! : note.path,
        title: showOriginal ? (note.originalTitle ?? note.title) : note.title,
        problemLinks: showOriginal
          ? (note.originalProblemLinks ?? note.problemLinks)
          : note.problemLinks,
      }
    : undefined;
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
        {visibleNote && (
          <>
            <div className="note-article-heading">
              <div className="note-reading-tools">
                <span className="quiet-chip">
                  <BookOpen size={13} />
                  {translated ? "中文专题笔记" : "原始专题笔记"}
                </span>
                {note?.chinesePath && (
                  <div className="note-language-toggle" role="group" aria-label="笔记语言">
                    <button aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>中文</button>
                    <button aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>原文</button>
                  </div>
                )}
              </div>
              <h2>{visibleNote.title}</h2>
              {translated && visibleNote.translationStale && (
                <p className="translation-notice">
                  原文已有更新，中文译文待同步。
                  <button onClick={() => setShowOriginal(true)}>查看最新原文</button>
                </p>
              )}
              <span className="note-source" title={visibleNote.sourcePath}>
                来源：{visibleNote.sourcePath.split("/").pop()}
              </span>
            </div>
            <ReadingLinks note={visibleNote} problems={problems} />
            <NoteContent key={visibleNote.path} note={visibleNote} />
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
          笔记中的题目链接用于延伸阅读；仅专题练习中的精选题支持本地判题。
        </span>
      </p>
      {Boolean(note.problemLinks?.length) && (
        <details>
          <summary>
            相关题目索引<span>{note.problemLinks?.length} 题</span>
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
