/* Shared by the isolated content script and the extension service worker. */
(() => {
  const APP = 'leetcode-recap-app';
  const EXTENSION = 'leetcode-recap-extension';
  const VERSION = 1;
  const statuses = new Set(['submitting', 'pending', 'accepted', 'rejected', 'failed', 'canceled']);
  const terminal = new Set(['accepted', 'rejected', 'failed', 'canceled']);
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value);
  const validSlug = value => typeof value === 'string' && value.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  function localOrigin(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
        && ['8765', '8766', '5173'].includes(url.port) && !url.username && !url.password ? url.origin : null;
    } catch { return null; }
  }
  function validRequest(message) {
    if (!isRecord(message) || message.source !== APP || message.version !== VERSION || !validId(message.requestId)) return false;
    if (!Object.keys(message).every(key => ['source', 'version', 'type', 'requestId', 'payload', 'openId'].includes(key))) return false;
    if (message.type === 'LEETCODE_OPEN_EDITOR') return message.payload === undefined && validId(message.openId);
    if (message.openId !== undefined) return false;
    if (['LEETCODE_PING', 'LEETCODE_CANCEL'].includes(message.type)) return message.payload === undefined;
    const payload = message.payload;
    return message.type === 'LEETCODE_SUBMIT' && isRecord(payload) && validSlug(payload.slug)
      && payload.language === 'python3' && typeof payload.code === 'string'
      && payload.code.trim().length > 0 && payload.code.length <= 100000
      && Object.keys(payload).every(key => ['slug', 'code', 'language'].includes(key));
  }
  function submissionId(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
    return typeof value === 'string' && /^[1-9][0-9]{0,29}$/.test(value) ? value : null;
  }
  const problemUrl = slug => `https://leetcode.cn/problems/${slug}/`;
  const resultUrl = id => `https://leetcode.cn/submissions/detail/${id}/`;
  function publicStatus(requestId, slug, status, extra = {}) {
    const result = { source: EXTENSION, version: VERSION, type: 'LEETCODE_STATUS', requestId, status,
      url: problemUrl(slug) };
    const id = submissionId(extra.submissionId);
    if (id) Object.assign(result, { submissionId: id, url: resultUrl(id) });
    if (typeof extra.error === 'string') result.error = extra.error.slice(0, 500);
    if (typeof extra.statusDisplay === 'string') result.statusDisplay = extra.statusDisplay.slice(0, 80);
    if (extra.editorSynced === true) Object.assign(result, { editorSynced: true, editorUrl: `${problemUrl(slug)}description/` });
    return result;
  }
  function validResponse(message) {
    if (!isRecord(message) || message.source !== EXTENSION || message.version !== VERSION || !validId(message.requestId)) return false;
    if (message.type === 'LEETCODE_PONG') return message.status === 'ready' && message.browser === 'chrome' && message.editorSync === true;
    if (message.type === 'LEETCODE_EDITOR_OPENED') return validId(message.openId) && typeof message.opened === 'boolean'
      && (message.error === undefined || (typeof message.error === 'string' && message.error.length <= 1000));
    if (message.type !== 'LEETCODE_STATUS' || !statuses.has(message.status)) return false;
    if (message.submissionId !== undefined && !submissionId(message.submissionId)) return false;
    if (message.error !== undefined && (typeof message.error !== 'string' || message.error.length > 1000)) return false;
    if (message.editorSynced !== undefined && typeof message.editorSynced !== 'boolean') return false;
    if (message.editorUrl !== undefined && (message.editorSynced !== true
        || !/^https:\/\/leetcode\.cn\/problems\/[a-z0-9]+(?:-[a-z0-9]+)*\/description\/$/.test(message.editorUrl))) return false;
    if (message.url !== undefined && !/^https:\/\/leetcode\.cn\/(?:problems\/[a-z0-9]+(?:-[a-z0-9]+)*\/|submissions\/detail\/[1-9][0-9]{0,29}\/)$/u.test(message.url)) return false;
    return true;
  }
  // No credentials, source code, or raw server responses can cross this boundary.
  function publicResponse(message) {
    if (!validResponse(message)) return null;
    const result = {};
    for (const key of ['source', 'version', 'type', 'requestId', 'status', 'browser', 'extensionVersion',
      'submissionId', 'url', 'error', 'statusDisplay', 'editorSync', 'editorSynced', 'editorUrl', 'opened', 'openId']) {
      if (message[key] !== undefined) result[key] = message[key];
    }
    return result;
  }
  globalThis.RecapLeetCodeProtocol = Object.freeze({ APP, EXTENSION, VERSION, localOrigin, validRequest,
    validResponse, publicResponse, publicStatus, validSlug, validId, submissionId, problemUrl, resultUrl,
    isTerminal: status => terminal.has(status) });
})();
