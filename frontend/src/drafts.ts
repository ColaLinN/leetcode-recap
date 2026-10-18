import { api } from "./api";
const queues = new Map<string, Promise<unknown>>();
const key = (id: string) => `recap:recovery:${id}`;
export function recoverDraft(id: string): string | null {
  try {
    return localStorage.getItem(key(id));
  } catch {
    return null;
  }
}
export function rememberDraft(id: string, code: string) {
  try {
    localStorage.setItem(key(id), code);
  } catch {
    /* Storage may be unavailable; backend persistence still works. */
  }
}
export function saveDraft(id: string, code: string): Promise<unknown> {
  const previous = queues.get(id) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() =>
      api(`/api/problems/${id}/draft`, {
        method: "PUT",
        body: JSON.stringify({ code }),
      }),
    )
    .then((result) => {
      try {
        if (recoverDraft(id) === code) localStorage.removeItem(key(id));
      } catch {
        /* Keep editing if storage is restricted. */
      }
      window.dispatchEvent(new Event("recap-draft-saved"));
      return result;
    });
  queues.set(id, next);
  void next
    .finally(() => {
      if (queues.get(id) === next) queues.delete(id);
    })
    .catch(() => undefined);
  return next;
}
