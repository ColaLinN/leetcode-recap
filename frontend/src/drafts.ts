import { api } from "./api";
const queues = new Map<string, Promise<unknown>>();
const key = (id: string, groupId: string) => `recap:recovery:${groupId}:${id}`;
export function recoverDraft(id: string, groupId = "original"): string | null {
  try {
    const value = localStorage.getItem(key(id, groupId));
    if (value !== null) return value;
    if (groupId === "original") {
      const legacy = localStorage.getItem(`recap:recovery:${id}`);
      if (legacy !== null) {
        localStorage.setItem(key(id, groupId), legacy);
        localStorage.removeItem(`recap:recovery:${id}`);
      }
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}
export function rememberDraft(id: string, code: string, groupId = "original") {
  try {
    localStorage.setItem(key(id, groupId), code);
  } catch {
    /* Storage may be unavailable; backend persistence still works. */
  }
}
export function saveDraft(id: string, code: string, groupId = "original", sessionId?: string, keepalive = false): Promise<unknown> {
  const queueKey = key(id, groupId);
  const previous = queues.get(queueKey) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() =>
      api(`/api/problems/${id}/draft?group_id=${encodeURIComponent(groupId)}`, {
        method: "PUT",
        body: JSON.stringify({ code, sessionId }),
        keepalive: keepalive && new TextEncoder().encode(JSON.stringify({ code, sessionId })).byteLength < 60000,
      }),
    )
    .then((result) => {
      try {
        if (recoverDraft(id, groupId) === code) localStorage.removeItem(queueKey);
      } catch {
        /* Keep editing if storage is restricted. */
      }
      window.dispatchEvent(new Event("recap-draft-saved"));
      return result;
    });
  queues.set(queueKey, next);
  void next
    .finally(() => {
      if (queues.get(queueKey) === next) queues.delete(queueKey);
    })
    .catch(() => undefined);
  return next;
}
