(() => {
  const protocol = globalThis.RecapLeetCodeProtocol;
  const origin = protocol.localOrigin(location.href);
  if (!origin || window !== window.top) return;
  const pending = new Set();
  const seen = new Set();
  function deliver(message) {
    const response = protocol.publicResponse(message);
    if (!response || !pending.has(response.requestId)) return;
    window.postMessage(response, origin);
    if (response.type === 'LEETCODE_PONG' || protocol.isTerminal(response.status)) pending.delete(response.requestId);
  }
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id && !sender.tab) deliver(message);
  });
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== origin) return;
    if (!protocol.validRequest(event.data)) {
      const invalid = event.data;
      if (invalid?.source === protocol.APP && invalid.version === 1 && invalid.type === 'LEETCODE_SUBMIT' && protocol.validId(invalid.requestId)) {
        window.postMessage({ source: protocol.EXTENSION, version: 1, type: 'LEETCODE_STATUS', requestId: invalid.requestId,
          status: 'failed', error: '联动参数无效，请检查题目、Python 3 代码和代码长度。' }, origin);
      }
      return;
    }
    const message = event.data;
    if (message.type === 'LEETCODE_CANCEL') {
      if (!pending.has(message.requestId)) return;
    } else {
      if (seen.has(message.requestId)) return;
      seen.add(message.requestId);
      pending.add(message.requestId);
    }
    chrome.runtime.sendMessage(message).then(deliver).catch(() => {
      if (message.type === 'LEETCODE_PING') { pending.delete(message.requestId); return; }
      const slug = message.payload?.slug;
      if (slug) deliver(protocol.publicStatus(message.requestId, slug, 'failed', {
        error: '扩展连接中断，提交状态未确认；请到原题检查记录。未自动重试。',
      }));
    });
  });
})();
