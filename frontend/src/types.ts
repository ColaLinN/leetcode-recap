export interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  group: string;
  problemIds: string[];
  noteIds: string[];
  order: number;
  referenceUrls?: string[];
  overview?: string;
}
export interface Note {
  id: string;
  title: string;
  path: string;
  sourcePath: string;
  chinesePath?: string;
  originalTitle?: string;
  translationStale?: boolean;
  problemLinks?: { title: string; url: string }[];
  originalProblemLinks?: { title: string; url: string }[];
}
export interface Problem {
  id: string;
  number: number;
  title: string;
  difficulty: string;
  tags: string[];
  statement: string;
  examples: { args: unknown[]; expected: unknown }[];
  constraints: string[];
  starter: string;
  method: string;
  kind: "solution" | "design";
  testCount: number;
  sourceUrl: string;
  sourceNoteIds: string[];
  draft?: string | null;
  review?: boolean;
  accepted?: boolean;
  argTypes?: string[];
  className?: string;
}
export interface Progress {
  accepted: boolean;
  review: boolean;
  attempts: number;
}
export interface Catalog {
  chapters: Chapter[];
  notes: Note[];
  problems: Problem[];
  progress: Record<string, Progress>;
  practiceGroup: PracticeGroup;
  allChapters: Chapter[];
  allProblems: Pick<Problem, "id" | "number" | "title" | "difficulty">[];
}
export interface PracticeGroup {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastPracticedAt: string | null;
  lastProblemId: string | null;
  archivedAt: string | null;
  sourceGroupId: string | null;
  copiedProgress: boolean;
  manualCount: number;
  chapterIds: string[] | null;
  legacyImported: boolean;
  total: number;
  completed: number;
  practiceCount: number;
  weeklyCount: number;
  streak: number;
}
export interface PracticeSession {
  id: string;
  problemId: string;
  problemTitle: string;
  startedAt: string;
  lastActiveAt: string | null;
  endedAt: string | null;
  active: boolean;
  runs: number;
  submits: number;
}
export interface TestResult {
  index: number;
  status: string;
  input: unknown;
  expected: unknown;
  actual: unknown;
  stdout?: string;
  error?: string;
  errorLocation?: ErrorLocation;
  elapsedMs: number;
}
export interface ErrorLocation {
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}
export interface ExecutionResult {
  status: string;
  passed: number;
  total: number;
  elapsedMs: number;
  results: TestResult[];
  submissionId?: number;
  detail?: string;
  executionId?: number;
  createdAt?: string;
  finishedAt?: string;
}
export interface Submission extends ExecutionResult {
  id: number;
  createdAt: string;
  code: string;
  kind?: "run" | "submit";
  sessionId?: string;
}
export interface Health {
  ok: boolean;
  judge: { available: boolean; detail: string };
}
