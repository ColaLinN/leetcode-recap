import type { Catalog, Chapter } from "./types";
import type { Route } from "./router";

export const LEARNING_PARTS = [
  {
    id: "数据结构",
    key: "data-structures",
    label: "第一部分",
    number: "01",
    description: "从数组与链表出发，理解树、堆与图，建立组织和操作数据的基础。",
  },
  {
    id: "算法",
    key: "algorithms",
    label: "第二部分",
    number: "02",
    description: "从双指针与二分查找开始，逐步掌握搜索、动态规划与更多解题方法。",
  },
] as const;

export function buildLearningParts(catalog: Catalog) {
  const availableProblems = new Set(catalog.problems.map((problem) => problem.id));
  return LEARNING_PARTS.map((part) => {
    const chapters = catalog.chapters.filter((chapter) => chapter.group === part.id);
    const problemIds = [...new Set(chapters.flatMap((chapter) => chapter.problemIds))]
      .filter((id) => availableProblems.has(id));
    return {
      ...part,
      chapters,
      problemIds,
      completed: problemIds.filter((id) => catalog.progress[id]?.accepted).length,
    };
  }).filter((part) => part.chapters.length > 0);
}

export function learningPartForChapter(chapter: Chapter | undefined) {
  return LEARNING_PARTS.find((part) => part.id === chapter?.group);
}

export function activeLearningPart(catalog: Catalog, route: Route) {
  const chapter = route.kind === "chapter"
    ? catalog.chapters.find((item) => item.id === route.id)
    : route.kind === "problem"
      ? catalog.chapters.find((item) => item.id === route.chapterId && item.problemIds.includes(route.id ?? ""))
        ?? catalog.chapters.find((item) => item.problemIds.includes(route.id ?? ""))
      : undefined;
  return learningPartForChapter(chapter);
}

export function expandActivePart(expanded: Record<string, boolean>, partId: string | undefined) {
  return partId && LEARNING_PARTS.some((part) => part.id === partId) && !expanded[partId]
    ? { ...expanded, [partId]: true }
    : expanded;
}
