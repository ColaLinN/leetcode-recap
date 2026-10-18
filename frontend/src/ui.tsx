import type { CSSProperties } from "react";
import {
  BookOpen,
  CheckCheck,
  Code2,
  Command,
  Flame,
  Layers3,
  ListChecks,
  RefreshCcw,
} from "lucide-react";
const chapterIcons = [Layers3, Code2, ListChecks, Flame, BookOpen, Command];
const palette = ["blue", "purple", "green", "orange", "pink", "teal"];
export const formatValue = (value: unknown): string => {
  if (value === undefined) return "—";
  const compact = JSON.stringify(value);
  return compact.length <= 160 ? compact : JSON.stringify(value, null, 2);
};
export const statusLabel = (status: string) =>
  ({
    Accepted: "全部通过",
    "Wrong Answer": "答案错误",
    "Runtime Error": "运行错误",
    "Time Limit Exceeded": "运行超时",
    "Memory Limit Exceeded": "内存超限",
    "Output Limit Exceeded": "输出超限",
    "Judge Unavailable": "判题服务未就绪",
  })[status] ?? status;
export function IconTile({
  index,
  size = "normal",
}: {
  index: number;
  size?: string;
}) {
  const Icon = chapterIcons[index % chapterIcons.length];
  return (
    <span className={`icon-tile ${palette[index % palette.length]} ${size}`}>
      <Icon size={size === "small" ? 17 : 23} strokeWidth={1.8} />
    </span>
  );
}
export function Difficulty({ value }: { value: string }) {
  const label =
    {
      Easy: "简单",
      Medium: "中等",
      Hard: "困难",
      easy: "简单",
      medium: "中等",
      hard: "困难",
    }[value] ?? value;
  const color = ["Easy", "easy", "简单"].includes(value)
    ? "easy"
    : ["Hard", "hard", "困难"].includes(value)
      ? "hard"
      : "medium";
  return <span className={`difficulty ${color}`}>{label}</span>;
}
export function ProgressRing({
  value,
  size = 42,
}: {
  value: number;
  size?: number;
}) {
  return (
    <span
      className="progress-ring"
      style={
        {
          "--progress": `${Math.round(value * 100)}%`,
          width: size,
          height: size,
        } as CSSProperties
      }
    >
      <span>
        {Math.round(value * 100)}
        <small>%</small>
      </span>
    </span>
  );
}
export function Empty({
  title,
  description,
  icon = "book",
}: {
  title: string;
  description?: string;
  icon?: "book" | "check";
}) {
  const Icon = icon === "check" ? CheckCheck : BookOpen;
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={30} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-box">
      <p>{message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          <RefreshCcw size={15} />
          重新加载
        </button>
      )}
    </div>
  );
}
