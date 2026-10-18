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
  problemLinks?: { title: string; url: string }[];
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
}
export interface TestResult {
  index: number;
  status: string;
  input: unknown;
  expected: unknown;
  actual: unknown;
  stdout?: string;
  error?: string;
  elapsedMs: number;
}
export interface ExecutionResult {
  status: string;
  passed: number;
  total: number;
  elapsedMs: number;
  results: TestResult[];
  submissionId?: number;
  detail?: string;
}
export interface Submission extends ExecutionResult {
  id: number;
  createdAt: string;
  code: string;
}
export interface Health {
  ok: boolean;
  judge: { available: boolean; detail: string };
}
