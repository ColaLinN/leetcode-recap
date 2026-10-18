export type LeetCodeRemoteStatus = "submitting" | "pending" | "accepted" | "rejected" | "failed" | "canceled";
export type LeetCodeSubmission = {
  requestId: string;
  slug: string;
  status: LeetCodeRemoteStatus;
  submissionId?: string;
  url?: string;
  error?: string;
  statusDisplay?: string;
};
export type LeetCodeBridgeState = {
  connection: "checking" | "ready" | "unavailable";
  submission: LeetCodeSubmission | null;
};
export type LeetCodeSubmitPayload = { slug: string; code: string; language: "python3" };
type BridgeHost = {
  location: { origin: string };
  postMessage(message: unknown, targetOrigin: string): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
};
type BridgeOptions = {
  requestId?: () => string;
  probeTimeoutMs?: number;
  submitTimeoutMs?: number;
};
export const emptyLeetCodeBridgeState: LeetCodeBridgeState = { connection: "checking", submission: null };
const terminalStatuses = new Set<LeetCodeRemoteStatus>(["accepted", "rejected", "failed", "canceled"]);
const validStatuses = new Set<LeetCodeRemoteStatus>(["submitting", "pending", ...terminalStatuses]);
export const isLeetCodePending = (submission: LeetCodeSubmission | null) => Boolean(submission && !terminalStatuses.has(submission.status));

export function leetCodeSlug(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    if (!['leetcode.cn', 'leetcode.com'].includes(url.hostname) || url.protocol !== 'https:') return null;
    return /^\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

function safeResultUrl(value: unknown, slug: string, submissionId?: string): string | undefined {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      if (url.origin === "https://leetcode.cn" && !url.username && !url.password &&
          (url.pathname.startsWith(`/problems/${slug}/`) || /^\/submissions\/detail\/\d+\/?$/.test(url.pathname))) return url.href;
    } catch { /* Only link to a known LeetCode origin and route. */ }
  }
  return submissionId ? `https://leetcode.cn/submissions/detail/${submissionId}/` : undefined;
}

export function createLeetCodeBridge(host: BridgeHost, onChange: (state: LeetCodeBridgeState) => void, options: BridgeOptions = {}) {
  const requestId = options.requestId ?? (() => crypto.randomUUID());
  let state: LeetCodeBridgeState = { ...emptyLeetCodeBridgeState };
  let disposed = false;
  let probeId: string | null = null;
  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  let submitTimer: ReturnType<typeof setTimeout> | undefined;
  function update(next: LeetCodeBridgeState) {
    if (disposed) return;
    state = next;
    onChange(state);
  }
  function send(type: string, id: string, payload?: LeetCodeSubmitPayload) {
    host.postMessage({ source: "leetcode-recap-app", version: 1, type, requestId: id, ...(payload ? { payload } : {}) }, host.location.origin);
  }
  function cancelWaiting() {
    if (!isLeetCodePending(state.submission) || !state.submission) return;
    clearTimeout(submitTimer);
    const submission = state.submission;
    update({ ...state, submission: { ...submission, status: "canceled" } });
    try { send("LEETCODE_CANCEL", submission.requestId); } catch { /* Waiting has already stopped locally. */ }
  }
  function receive(event: MessageEvent) {
    if (disposed || event.source !== (host as unknown) || event.origin !== host.location.origin) return;
    const data: unknown = event.data;
    if (!data || typeof data !== "object") return;
    const message = data as Record<string, unknown>;
    if (message.source !== "leetcode-recap-extension" || message.version !== 1 || typeof message.requestId !== "string") return;
    if (message.type === "LEETCODE_PONG" && message.requestId === probeId && message.status === "ready" && message.browser === "chrome") {
      clearTimeout(probeTimer);
      probeId = null;
      update({ ...state, connection: "ready" });
      return;
    }
    const current = state.submission;
    if (message.type !== "LEETCODE_STATUS" || !current || message.requestId !== current.requestId || !isLeetCodePending(current)) return;
    if (typeof message.status !== "string" || !validStatuses.has(message.status as LeetCodeRemoteStatus)) return;
    const status = message.status as LeetCodeRemoteStatus;
    // Once judging starts, a late acknowledgement must not move it back to submitting.
    if (current.status === "pending" && status === "submitting") return;
    const submissionId = typeof message.submissionId === "number" && Number.isSafeInteger(message.submissionId) && message.submissionId > 0
      ? String(message.submissionId)
      : typeof message.submissionId === "string" && /^\d{1,30}$/.test(message.submissionId) ? message.submissionId : current.submissionId;
    const url = safeResultUrl(message.url, current.slug, submissionId) ?? current.url;
    const error = typeof message.error === "string" ? message.error.slice(0, 1000) : undefined;
    const statusDisplay = typeof message.statusDisplay === "string" ? message.statusDisplay.slice(0, 100) : undefined;
    if (terminalStatuses.has(status)) clearTimeout(submitTimer);
    update({ ...state, submission: { ...current, status, statusDisplay, ...(submissionId ? { submissionId } : {}), ...(url ? { url } : {}), ...(error ? { error } : {}) } });
  }
  host.addEventListener("message", receive);
  return {
    getState: () => state,
    probe() {
      if (disposed) return;
      clearTimeout(probeTimer);
      probeId = requestId();
      update({ ...state, connection: "checking" });
      probeTimer = setTimeout(() => {
        probeId = null;
        update({ ...state, connection: "unavailable" });
      }, options.probeTimeoutMs ?? 1800);
      try { send("LEETCODE_PING", probeId); }
      catch {
        clearTimeout(probeTimer);
        probeId = null;
        update({ ...state, connection: "unavailable" });
      }
    },
    submit(payload: LeetCodeSubmitPayload): boolean {
      if (disposed || isLeetCodePending(state.submission)) return false;
      const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug) && payload.language === "python3" && typeof payload.code === "string" && payload.code.length > 0 && payload.code.length <= 100_000;
      const id = requestId();
      if (state.connection !== "ready" || !valid) {
        update({ ...state, submission: { requestId: id, slug: payload.slug, status: "failed", error: valid ? "Chrome 联动未连接，本地提交仍会继续。" : "无法同步这份代码或题目，本地提交仍会继续。" } });
        return false;
      }
      update({ ...state, submission: { requestId: id, slug: payload.slug, status: "submitting" } });
      submitTimer = setTimeout(() => {
        const current = state.submission;
        if (!current || current.requestId !== id || !isLeetCodePending(current)) return;
        update({ connection: "unavailable", submission: { ...current, status: "failed", error: "未收到 LeetCode 结果，请前往原题核对提交记录；不会自动重试。" } });
        try { send("LEETCODE_CANCEL", id); } catch { /* There is no automatic retry. */ }
      }, options.submitTimeoutMs ?? 120_000);
      try {
        send("LEETCODE_SUBMIT", id, { ...payload });
        return true;
      } catch {
        clearTimeout(submitTimer);
        update({ connection: "unavailable", submission: { requestId: id, slug: payload.slug, status: "failed", error: "无法发送到 Chrome；本地提交仍会继续。" } });
        return false;
      }
    },
    cancelWaiting,
    dispose() {
      if (disposed) return;
      cancelWaiting();
      disposed = true;
      probeId = null;
      clearTimeout(probeTimer);
      clearTimeout(submitTimer);
      host.removeEventListener("message", receive);
    },
  };
}

// Both destinations receive this immutable string from the same explicit submit action.
export function submitWithSnapshot<T>(code: string, submitLocal: (snapshot: string) => Promise<T>, submitRemote?: (snapshot: string) => void, onRemoteError?: (error: unknown) => void): Promise<T> {
  const local = Promise.resolve().then(() => submitLocal(code));
  try { submitRemote?.(code); }
  catch (error) { onRemoteError?.(error); }
  return local;
}
