import './protocol.js';
import { pageTask } from './page-task.js';

const protocol = globalThis.RecapLeetCodeProtocol;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export function createBackground(chromeApi, { sleep = wait, now = Date.now, pollMs = 20000, tabMs = 15000 } = {}) {
  const active = new Map();
  function validSender(sender) {
    const origin = protocol.localOrigin(sender?.url);
    return origin && sender.id === chromeApi.runtime.id && sender.frameId === 0
      && Number.isInteger(sender.tab?.id) && protocol.localOrigin(sender.tab.url) === origin
      && sender.origin === origin && typeof sender.documentId === 'string' && sender.documentId.length > 0;
  }
  const keyFor = (sender, requestId) => `request:${sender.tab.id}:${requestId}`;
  const snapshot = (operation, status, extra = {}) => protocol.publicStatus(operation.requestId, operation.slug, status,
    { submissionId: operation.submissionId, editorSynced: operation.editorSynced, ...extra });
  const storedSnapshot = (operation, message) => ({ ...message, _slug: operation.slug,
    _sourceDocumentId: operation.sender.documentId,
    ...(operation.targetId !== undefined ? { _targetTabId: operation.targetId } : {}),
    ...(operation.documentId ? { _targetDocumentId: operation.documentId } : {}) });
  async function publish(operation, status, extra = {}) {
    if (operation.canceled && status !== 'canceled') return;
    const message = snapshot(operation, status, extra);
    operation.latest = message;
    try { await chromeApi.storage.session.set({ [operation.key]: storedSnapshot(operation, message) }); } catch { /* no resubmission on storage errors */ }
    try { await chromeApi.tabs.sendMessage(operation.sender.tab.id, message, { documentId: operation.sender.documentId }); } catch { /* page closed or navigated */ }
  }
  async function inject(operation, action, payload = {}) {
    const target = operation.documentId ? { tabId: operation.targetId, documentIds: [operation.documentId] }
      : { tabId: operation.targetId, frameIds: [0] };
    const results = await chromeApi.scripting.executeScript({ target, world: 'MAIN', func: pageTask,
      args: [{ action, slug: operation.slug, ...payload }] });
    if (!Array.isArray(results) || results.length !== 1 || results[0].frameId !== 0 || !results[0].documentId) {
      throw new Error('Unexpected target document');
    }
    if (operation.documentId && operation.documentId !== results[0].documentId) throw new Error('Target navigated');
    operation.documentId = results[0].documentId;
    return results[0].result;
  }
  async function findTab(operation) {
    const tabs = await chromeApi.tabs.query({ url: 'https://leetcode.cn/problems/*' });
    const prefix = protocol.problemUrl(operation.slug);
    let tab = tabs.find(candidate => typeof candidate.url === 'string' && candidate.url.startsWith(prefix));
    if (!tab) tab = await chromeApi.tabs.create({ url: prefix, active: false });
    operation.targetId = tab.id;
    const deadline = now() + tabMs;
    while (!operation.canceled) {
      tab = await chromeApi.tabs.get(operation.targetId);
      const atProblem = tab.url?.startsWith(prefix);
      // A newly created tab can still report about:blank until its pending
      // navigation commits. Wait only for this exact requested problem URL.
      if (!atProblem && !(tab.status !== 'complete' && tab.pendingUrl === prefix)) throw new Error('Target navigated');
      if (tab.pendingUrl && !tab.pendingUrl.startsWith(prefix)) throw new Error('Target navigated');
      if (atProblem && tab.status === 'complete' && !tab.pendingUrl) return;
      if (now() >= deadline) throw new Error('Target load timeout');
      await sleep(250);
    }
  }
  async function perform(operation, code) {
    try {
      await findTab(operation);
      if (operation.canceled) return;
      let editorState = await inject(operation, 'editor-status');
      for (let checks = 0; !editorState?.ok && editorState?.retryable && checks < 20 && !operation.canceled; checks++) {
        await sleep(250);
        if (operation.canceled) return;
        editorState = await inject(operation, 'editor-status');
      }
      if (operation.canceled) return;
      if (!editorState?.ok) { await publish(operation, 'failed', { error: editorState?.error || '原题编辑器未就绪；未同步或提交。' }); return; }
      if (!editorState.languageSelected) {
        const opened = await inject(operation, 'editor-open-language');
        if (operation.canceled) return;
        if (!opened?.ok) { await publish(operation, 'failed', { error: opened?.error || '无法打开原题语言菜单；未提交。' }); return; }
        await sleep(150);
        if (operation.canceled) return;
        let chosen = await inject(operation, 'editor-choose-python3');
        for (let checks = 0; !chosen?.ok && chosen?.retryable && checks < 20 && !operation.canceled; checks++) {
          await sleep(100);
          if (operation.canceled) return;
          chosen = await inject(operation, 'editor-choose-python3');
        }
        if (operation.canceled) return;
        if (!chosen?.ok) { await publish(operation, 'failed', { error: chosen?.error || '无法切换 Python3；未提交。' }); return; }
      }
      for (let checks = 0; !editorState.python3 && checks < 20 && !operation.canceled; checks++) {
        await sleep(250);
        if (operation.canceled) return;
        editorState = await inject(operation, 'editor-status');
        if (!editorState?.ok && !editorState?.retryable) break;
      }
      if (operation.canceled) return;
      if (!editorState?.ok || !editorState.python3) {
        await publish(operation, 'failed', { error: editorState?.error || '原题未能确认 Python3 编辑器；未写入或提交。' }); return;
      }
      operation.syncStarted = true;
      const synced = await inject(operation, 'editor-sync', { code, editorModelUri: editorState.modelUri, editorModelVersion: editorState.modelVersion });
      if (synced?.ok && synced.editorSynced === true && typeof synced.modelUri === 'string') {
        operation.editorSynced = true;
        operation.editorModelUri = synced.modelUri;
      }
      if (operation.canceled) {
        if (operation.editorSynced) await publish(operation, 'canceled', { error: '已停止等待；代码已同步原题编辑器，尚未开始发送提交。' });
        return;
      }
      if (!operation.editorSynced) { await publish(operation, 'failed', { error: synced?.error || '原题代码写入后无法确认一致；未提交。' }); return; }
      await publish(operation, 'submitting');
      if (operation.canceled) return;
      const prepared = await inject(operation, 'prepare');
      if (operation.canceled) return;
      if (!prepared?.ok || !protocol.submissionId(prepared.questionId)) {
        await publish(operation, 'failed', { error: prepared?.error || '无法确认原站题目信息，请到原题手动提交。' }); return;
      }
      // Persist the attempt before dispatch. A worker restart or repeated page
      // message can never cause this requestId to send a second submission.
      await chromeApi.storage.session.set({ [operation.key]: storedSnapshot(operation, snapshot(operation, 'submitting', {
        error: '已开始发送；结果未确认时请检查原站记录，勿重复提交。',
      })) });
      if (operation.canceled) return;
      operation.sent = true;
      const submitted = await inject(operation, 'submit', { code, questionId: prepared.questionId, editorModelUri: operation.editorModelUri });
      if (submitted?.ok && protocol.submissionId(submitted.submissionId)) operation.submissionId = protocol.submissionId(submitted.submissionId);
      if (operation.canceled) return;
      if (!operation.submissionId) {
        await publish(operation, 'failed', { error: submitted?.error || '提交状态未确认，请检查原站记录。未自动重试。' }); return;
      }
      await publish(operation, 'pending');
      const deadline = now() + pollMs;
      for (let checks = 0; checks < 10 && now() < deadline && !operation.canceled; checks++) {
        await sleep(1500);
        if (operation.canceled) return;
        const checked = await inject(operation, 'check', { submissionId: operation.submissionId, timeoutMs: Math.max(500, deadline - now()) });
        if (operation.canceled) return;
        if (!checked?.ok) { await publish(operation, 'failed', { error: checked?.error || '判题状态未确认，请查看提交详情。' }); return; }
        if (checked.status === 'accepted' || checked.status === 'rejected') {
          await publish(operation, checked.status, { statusDisplay: checked.statusDisplay }); return;
        }
        if (checked.status !== 'pending') { await publish(operation, 'failed', { error: '判题状态无法确认，请查看提交详情。' }); return; }
      }
      if (!operation.canceled) await publish(operation, 'failed', { error: '已停止短暂等待，判题结果尚未确认；请到原站查看提交详情。未自动重试。' });
    } catch {
      await publish(operation, 'failed', { error: operation.sent
        ? '原题页面切换或扩展连接中断，提交状态未确认；请到原站核对记录。未自动重试。'
        : '原题页面未就绪或扩展操作失败，请打开原题检查登录与权限。' });
    } finally {
      if (active.get(operation.sender.tab.id) === operation) active.delete(operation.sender.tab.id);
    }
  }
  async function openEditor(message, sender) {
    const reply = (opened, error) => ({ source: protocol.EXTENSION, version: 1, type: 'LEETCODE_EDITOR_OPENED',
      requestId: message.requestId, openId: message.openId, opened, ...(error ? { error } : {}) });
    try {
      const record = (await chromeApi.storage.session.get(keyFor(sender, message.requestId)))[keyFor(sender, message.requestId)];
      if (!record?.editorSynced || record._sourceDocumentId !== sender.documentId || !protocol.validSlug(record._slug)
          || !Number.isInteger(record._targetTabId) || typeof record._targetDocumentId !== 'string') {
        return reply(false, '没有可确认的已同步编辑器记录，请检查原题。');
      }
      const tab = await chromeApi.tabs.get(record._targetTabId);
      const prefix = protocol.problemUrl(record._slug);
      if (!tab.url?.startsWith(prefix) || tab.pendingUrl) return reply(false, '已同步的原题标签已切换或正在导航，未打开其他标签。');
      const operation = { targetId: record._targetTabId, documentId: record._targetDocumentId, slug: record._slug };
      const state = await inject(operation, 'editor-status');
      if (!state?.ok || !state.python3) return reply(false, '已同步编辑器的页面或语言发生变化，请检查原题。');
      await chromeApi.tabs.update(record._targetTabId, { active: true });
      if (Number.isInteger(tab.windowId)) await chromeApi.windows.update(tab.windowId, { focused: true });
      return reply(true);
    } catch { return reply(false, '已同步的编辑器标签已关闭、导航或无法访问；未新建其他标签。'); }
  }
  async function handle(message, sender) {
    if (!validSender(sender) || !protocol.validRequest(message)) return undefined;
    if (message.type === 'LEETCODE_PING') return { source: protocol.EXTENSION, version: 1, type: 'LEETCODE_PONG',
      requestId: message.requestId, status: 'ready', browser: 'chrome', editorSync: true, extensionVersion: chromeApi.runtime.getManifest().version };
    if (message.type === 'LEETCODE_OPEN_EDITOR') return openEditor(message, sender);
    const current = active.get(sender.tab.id);
    if (message.type === 'LEETCODE_CANCEL') {
      if (!current || current.requestId !== message.requestId || current.sender.documentId !== sender.documentId) return undefined;
      current.canceled = true;
      await publish(current, 'canceled', { error: current.sent
        ? '已停止等待；提交可能已被接收或仍在判题，请到原站核对记录。'
        : current.editorSynced ? '已停止等待；代码已同步原题编辑器，尚未开始发送提交。'
        : current.syncStarted ? '已停止等待；已发起的编辑器写入仍可能完成，请检查原题。尚未开始发送提交。'
        : '已停止等待，尚未开始同步或发送提交。' });
      return current.latest;
    }
    const { slug, code } = message.payload;
    if (current) return current.requestId === message.requestId ? current.latest : protocol.publicStatus(message.requestId, slug, 'failed', {
      error: '此页面已有联动请求，请先等待结果或停止等待。',
    });
    const operation = { key: keyFor(sender, message.requestId), requestId: message.requestId, sender, slug,
      canceled: false, sent: false, latest: protocol.publicStatus(message.requestId, slug, 'submitting') };
    active.set(sender.tab.id, operation);
    try {
      const stored = (await chromeApi.storage.session.get(operation.key))[operation.key];
      if (stored) {
        active.delete(sender.tab.id);
        return protocol.isTerminal(stored.status) && protocol.publicResponse(stored) ? protocol.publicResponse(stored)
          : snapshot(operation, 'failed', { submissionId: stored.submissionId,
            error: '此请求已处理，提交状态未确认；请核对原站记录。未自动重试。' });
      }
      await chromeApi.storage.session.set({ [operation.key]: storedSnapshot(operation, operation.latest) });
    } catch {
      active.delete(sender.tab.id);
      return snapshot(operation, 'failed', { error: '无法保存请求去重标记，未启动联动；请检查扩展状态。' });
    }
    if (!operation.canceled) operation.done = perform(operation, code);
    else if (active.get(sender.tab.id) === operation) active.delete(sender.tab.id);
    return operation.latest;
  }
  return { handle, whenIdle: () => Promise.all([...active.values()].map(operation => operation.done)) };
}
