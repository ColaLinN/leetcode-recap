import { api } from "./api";
import { parseRoute } from "./router";

const sessionKey = "recap:practice-session";
type SessionToken = { id: string; groupId: string; problemId: string };
export const practiceTime = (value?: string | null) => value
  ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Singapore", hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
  : "尚未练习";
export const fullPracticeTime = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Singapore", hour12: false });

// Refresh/StrictMode reuses the same token. Actual navigation ends the visit.
export function practiceSession(groupId: string, problemId: string): SessionToken {
  try {
    const previous: SessionToken | null = JSON.parse(sessionStorage.getItem(sessionKey) ?? "null");
    if (previous?.id && previous.groupId === groupId && previous.problemId === problemId) return previous;
  } catch { /* Private browsing may disable storage. */ }
  const token = { id: crypto.randomUUID(), groupId, problemId };
  try { sessionStorage.setItem(sessionKey, JSON.stringify(token)); } catch { /* In-memory token still works. */ }
  return token;
}

export function endPracticeOnNavigation() {
  try {
    const token: SessionToken | null = JSON.parse(sessionStorage.getItem(sessionKey) ?? "null");
    const route = parseRoute();
    if (!token || (route.kind === "problem" && route.id === token.problemId && route.groupId === token.groupId)) return;
    sessionStorage.removeItem(sessionKey);
    void api(`/api/practice-groups/${token.groupId}/sessions/${token.id}/end`, { method: "POST", keepalive: true }).catch(() => undefined);
  } catch { /* Closing a tab leaves an honestly unknown end time. */ }
}
