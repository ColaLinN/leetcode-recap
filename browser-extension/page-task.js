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
  if (!['prepare', 'submit', 'check'].includes(input.action)) return failed('不支持的扩展操作。');
  if (input.action === 'submit' && (typeof input.code !== 'string' || !input.code.trim()
      || input.code.length > 100000 || !safeId(input.questionId))) return failed('提交参数无效。');
  if (input.action === 'check' && !safeId(input.submissionId)) return failed('提交编号无效。');
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
