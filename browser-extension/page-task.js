/* Serialized into MAIN by chrome.scripting: this function has no closures. */
export async function pageTask(input) {
  const failed = (error, uncertain = false) => ({ ok: false, error, uncertain });
  const safeSlug = value => typeof value === 'string' && value.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  const safeId = value => (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    || (typeof value === 'string' && /^[1-9][0-9]{0,29}$/.test(value));
  if (!input || !safeSlug(input.slug) || location.origin !== 'https://leetcode.cn'
      || !location.pathname.startsWith(`/problems/${input.slug}/`)) {
    return failed('原题页面已切换，提交状态未确认；请到原题检查记录。');
  }
  const editorActions = ['editor-status', 'editor-open-language', 'editor-choose-python3', 'editor-sync', 'editor-verify'];
  if (![...editorActions, 'prepare', 'submit', 'check'].includes(input.action)) return failed('不支持的扩展操作。');
  if (input.action === 'submit' && (typeof input.code !== 'string' || !input.code.trim()
      || input.code.length > 100000 || !safeId(input.questionId))) return failed('提交参数无效。');
  if (input.action === 'check' && !safeId(input.submissionId)) return failed('提交编号无效。');
  const visible = element => {
    if (!element?.isConnected || element.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const text = element => element.textContent.trim().replace(/\s+/g, ' ');
  const isPython3 = value => value === 'Python3' || value === 'Python 3';
  function editorContext() {
    const roots = [...document.querySelectorAll('.monaco-editor')].filter(visible);
    if (roots.length !== 1) return { ...failed(roots.length ? '原题存在多个可见编辑器，无法安全确定目标；未同步或提交。'
      : '原题代码编辑器尚未就绪，请打开原题的代码编辑视图。'), retryable: roots.length === 0 };
    const api = globalThis.monaco?.editor;
    if (typeof api?.getEditors !== 'function') return { ...failed('原题未提供可验证的公开 Monaco 编辑器接口，请在原题手动同步；未提交。'), retryable: true };
    const editors = api.getEditors().filter(candidate => candidate.getDomNode?.() === roots[0]);
    if (editors.length !== 1) return { ...failed('无法将原题可见区域绑定到唯一编辑器；未同步或提交。'), retryable: editors.length === 0 };
    const editor = editors[0], model = editor.getModel?.();
    const textarea = roots[0].querySelector('textarea');
    const options = editor.getRawOptions?.();
    if (!model || model.isDisposed?.() || !textarea) return { ...failed('原题代码模型尚未就绪；未同步或提交。'), retryable: true };
    if (textarea.readOnly || textarea.disabled || !options || options.readOnly || options.domReadOnly || textarea.getAttribute('aria-readonly') === 'true') {
      return failed('原题编辑器只读或不可编辑，无法同步代码；未提交。');
    }
    if (typeof model.getValue !== 'function' || typeof model.getLanguageId !== 'function'
        || typeof model.getVersionId !== 'function' || !model.uri?.toString) return failed('原题编辑器模型接口无法验证；未同步或提交。');
    if (typeof model.uri.toString() !== 'string' || !model.uri.toString() || model.uri.toString().length > 1024
        || !Number.isInteger(model.getVersionId()) || model.getVersionId() < 1) return failed('原题编辑器模型身份或版本无法验证；未同步或提交。');
    const languages = /^(?:Python ?3|Python|C\+\+|Java|JavaScript|TypeScript|C|C#|Go|Ruby|Swift|Kotlin|Rust|PHP|Scala|Dart|Racket|Erlang|Elixir|MySQL|MS SQL Server|Oracle|PostgreSQL)$/;
    const controls = [...document.querySelectorAll('button[aria-haspopup="dialog"][aria-controls]')]
      .filter(button => visible(button) && languages.test(text(button)));
    if (controls.length !== 1) return failed('无法安全确认原题的语言选择控件；未同步或提交。');
    return { ok: true, editor, model, control: controls[0], modelUri: model.uri.toString(), modelVersion: model.getVersionId(),
      // LeetCode registers Python3 as "python3"; stock Monaco uses "python".
      // Both still require the actual language selector to show Python3.
      python3: isPython3(text(controls[0])) && ['python', 'python3'].includes(model.getLanguageId()), languageSelected: isPython3(text(controls[0])) };
  }
  function verifyEditor(context) {
    if (!context.ok) return context;
    if (!context.python3) return failed('原题尚未切换到 Python3，未同步或提交。');
    if (context.modelUri !== input.editorModelUri || context.model.getValue() !== input.code) {
      return failed('原题模型或代码在同步后发生变化，请检查原题；未发送提交。');
    }
    return { ok: true, editorSynced: true, modelUri: context.modelUri, modelVersion: context.modelVersion };
  }
  // Editor operations return before any Cookie access or network request.
  // No await occurs during a write: language readiness is polled by the worker,
  // which checks cancellation before dispatching each operation.
  if (editorActions.includes(input.action)) {
    try {
      const context = editorContext();
      if (!context.ok) return context;
      if (input.action === 'editor-status') return { ok: true, python3: context.python3,
        languageSelected: context.languageSelected, modelUri: context.modelUri, modelVersion: context.modelVersion };
      if (input.action === 'editor-open-language') {
        if (!context.languageSelected) context.control.click();
        return { ok: true };
      }
      if (input.action === 'editor-choose-python3') {
        if (context.languageSelected) return { ok: true };
        const dialog = document.getElementById(context.control.getAttribute('aria-controls'));
        if (!visible(dialog)) return { ...failed('原题语言菜单未打开，无法切换 Python3；未提交。'), retryable: true };
        const matches = [...dialog.querySelectorAll('*')].filter(element => visible(element) && isPython3(text(element))
          && ![...element.children].some(child => isPython3(text(child))));
        if (matches.length !== 1) return failed('原题语言菜单中无法唯一确认 Python3；未提交。');
        matches[0].click();
        return { ok: true };
      }
      if (typeof input.code !== 'string' || !input.code.trim() || input.code.length > 100000) return failed('同步代码无效。');
      if (input.action === 'editor-verify') return verifyEditor(context);
      if (!context.python3) return failed('原题未确认 Python3，未写入代码或提交。');
      if (context.modelUri !== input.editorModelUri || context.modelVersion !== input.editorModelVersion) {
        return failed('原题编辑器在同步前发生变化，为保护新修改未写入或提交。');
      }
      const { editor, model } = context;
      if (typeof editor.executeEdits !== 'function' || typeof model.getFullModelRange !== 'function' || typeof model.getEOL !== 'function') {
        return failed('原题不支持可验证的公开编辑操作；未写入或提交。');
      }
      const withoutCRLF = input.code.replace(/\r\n/g, '');
      if (withoutCRLF.includes('\r') || (input.code.includes('\r\n') && withoutCRLF.includes('\n'))) return failed('代码换行格式不一致，无法保证原题完整同步；未提交。');
      const eol = input.code.includes('\r\n') ? '\r\n' : '\n';
      if (model.getEOL() !== eol && (typeof model.pushEOL !== 'function' || !globalThis.monaco.editor.EndOfLineSequence)) {
        return failed('无法保证原题换行与代码快照一致；未写入或提交。');
      }
      editor.pushUndoStop?.();
      if (editor.executeEdits('leetcode-recap', [{ range: model.getFullModelRange(), text: input.code, forceMoveMarkers: true }]) !== true) {
        return failed('原题拒绝了编辑操作，无法确认同步；未提交。');
      }
      if (model.getEOL() !== eol) model.pushEOL(eol === '\n' ? globalThis.monaco.editor.EndOfLineSequence.LF : globalThis.monaco.editor.EndOfLineSequence.CRLF);
      editor.pushUndoStop?.();
      return verifyEditor(editorContext());
    } catch { return failed('原题编辑操作失败，同步结果未确认；请检查原题，未发送提交。'); }
  }
  // Recheck in the very same task as the POST: a user edit or language/model
  // change after synchronization must not submit a different editor snapshot.
  if (input.action === 'submit') {
    try {
      const verified = verifyEditor(editorContext());
      if (!verified.ok) return verified;
    } catch { return failed('提交前无法重新确认原题编辑器；未发送提交。'); }
  }
  let token;
  try {
    const cookie = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith('csrftoken='));
    token = cookie && decodeURIComponent(cookie.slice('csrftoken='.length));
  } catch { return failed('无法读取原题的验证信息，请在力扣页面重新登录或刷新。'); }
  if (!token || !/^[A-Za-z0-9_-]{1,256}$/.test(token)) return failed('原题缺少验证信息，请在力扣页面登录并刷新。');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(input.timeoutMs || 10000, 500), 10000));
  let response;
  try {
    const common = { credentials: 'include', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token } };
    if (input.action === 'prepare') {
      response = await fetch('/graphql/', { ...common, method: 'POST', body: JSON.stringify({
        operationName: 'recapSubmissionContext',
        query: 'query recapSubmissionContext($titleSlug: String!) { question(titleSlug: $titleSlug) { questionId titleSlug } userStatus { isSignedIn } }',
        variables: { titleSlug: input.slug },
      }) });
    } else if (input.action === 'submit') {
      // This is the only code-submission POST. There is deliberately no retry.
      response = await fetch(`/problems/${input.slug}/submit/`, { ...common, method: 'POST', body: JSON.stringify({
        lang: 'python3', question_id: String(input.questionId), typed_code: input.code,
      }) });
    } else {
      response = await fetch(`/submissions/detail/${input.submissionId}/check/`, { ...common, method: 'GET' });
    }
    if (response.status === 401) return failed('请先在力扣中国登录，再手动发起新的提交。');
    if (response.status === 403) return failed('力扣拒绝请求，可能需要登录、验证码或安全验证；请到原题处理。', input.action === 'submit');
    if (response.status === 429) return failed('力扣限制了请求频率，请到原题检查记录后稍后操作。', input.action === 'submit');
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      return failed('原站返回了非预期响应，可能需要登录或完成验证码；请到原题检查。', input.action === 'submit');
    }
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return failed('原站接口结构无法确认，请到原题检查记录。', input.action === 'submit');
    if (input.action === 'prepare') {
      if (data.errors || !data.data || data.data.userStatus?.isSignedIn !== true) {
        return failed(data.data?.userStatus?.isSignedIn === false ? '请先在力扣中国登录。'
          : '无法确认登录状态或原站接口结构，请到原题检查登录与验证要求。');
      }
      const question = data.data.question;
      if (!question || !safeId(question.questionId) || question.titleSlug !== input.slug) {
        return failed('无法确认原题编号，接口可能已变化；请到原题手动提交。');
      }
      return { ok: true, questionId: String(question.questionId) };
    }
    if (input.action === 'submit') {
      return safeId(data.submission_id) ? { ok: true, submissionId: String(data.submission_id) }
        : failed('未获得可确认的提交编号，提交可能已被接收；请先核对原站记录。未自动重试。', true);
    }
    if (data.submission_id !== undefined && String(data.submission_id) !== String(input.submissionId)) {
      return failed('原站返回的提交编号不匹配，请查看提交详情。');
    }
    if (data.state === 'PENDING' || data.state === 'STARTED') return { ok: true, status: 'pending' };
    if (data.state !== 'SUCCESS' || !Number.isInteger(data.status_code)) return failed('暂时无法确认原站判题结果，请查看提交详情。');
    if (data.status_code === 10 && data.status_msg === 'Accepted') return { ok: true, status: 'accepted', statusDisplay: '通过' };
    const verdicts = { 11: ['Wrong Answer', '答案错误'], 12: ['Memory Limit Exceeded', '超出内存限制'],
      13: ['Output Limit Exceeded', '超出输出限制'], 14: ['Time Limit Exceeded', '超出时间限制'],
      15: ['Runtime Error', '运行错误'], 16: ['Internal Error', '原站内部错误'], 20: ['Compile Error', '编译错误'] };
    const verdict = verdicts[data.status_code];
    if (verdict && verdict[0] === data.status_msg) return { ok: true, status: 'rejected', statusDisplay: verdict[1] };
    return failed('原站判题字段无法确认，请查看提交详情。');
  } catch {
    return failed(input.action === 'submit' ? '提交响应中断或超时，可能已被接收；请先核对原站记录。未自动重试。'
      : '原站连接中断、超时或需要验证，请到原题或提交详情继续查看。', input.action === 'submit');
  } finally { clearTimeout(timeout); }
}
