# Chrome 本机提交联动扩展

这是项目独立的 Chrome Manifest V3 扩展。Codex 的 Chrome 连接不代表此扩展已安装；本地页面只有收到本扩展的 `LEETCODE_PONG` 才显示就绪。就绪只表示桥接正常，不表示力扣已登录或能够提交。

当前交付包含可审阅文件和 mock 测试。**尚未确认扩展已加载，也未使用真实账号向力扣提交。** 已只读查看原站的编辑器与语言菜单结构，尚未实际覆盖原站代码。力扣中国的编辑器集成与页面内部接口可能变化；真实编辑器写入、登录、提交和判题兼容性仍待验证，mock 通过不代表真实联动已通过。

## 安装与使用

扩展需要本机页面和 `https://leetcode.cn` 的站点访问权限。手动加载步骤：

1. 在 Chrome 打开 `chrome://extensions`，启用开发者模式。
2. 选择「加载已解压的扩展程序」，选择本仓库的 **browser-extension** 文件夹。已安装旧版时，点击扩展的「重新加载」。
3. 刷新 Chrome 中的本地练习页。支持 `http://127.0.0.1` 或 `http://localhost`，端口仅限 **8765、8766、5173**。连接探测会有限尝试三次，以等待扩展脚本加载；仍未连接时可点「检测连接」。这只重试连接探测，不会重试代码提交。
4. 在 Chrome 的力扣中国页面自行登录。回到本地练习页，明确勾选同步提交后再点击提交。
5. 提交会覆盖同题的 Python3 编辑器代码；读回一致后才发起力扣提交。本地判题和力扣判题分别显示结果。看到「编辑器已同步」后，可点击「打开力扣编辑器」回到实际写入的同一标签页调试；力扣返回提交编号后也可打开提交详情。

扩展复用同一原题标签页，或在后台创建该原题标签页。它选择 Python3，向唯一可见、可编辑的 Monaco 做题编辑器写入本次提交的代码快照，再读回校验；无法确认编辑器或语言时会停止原站提交。本地后续编辑不会改变已发出的快照。「运行」不写入原站。源码通过编辑器 API 和同源请求数据传递，绝不作为扩展脚本执行。

「停止等待」只停止本地等待和后续查询。已派发的编辑器写入仍可能完成，已经发出的提交可能被力扣接收，无法据此撤销。超时、切页、断连或字段异常均不得视为「未提交」；应先去原站核对记录，再决定是否手动发起新请求。**扩展不会自动重试提交。**

## 权限和数据边界

- `scripting`：只在 `https://leetcode.cn/problems/<受限slug>/…` 的顶层页面执行固定、可审阅的编辑器和请求适配函数。
- `https://leetcode.cn/*`：用于原题编辑器、同源 GraphQL、提交和结果查询；不接受调用方提供的域名、URL、GraphQL 文本或脚本。
- 静态 content script 只匹配两个 loopback 主机；内容脚本和后台都会再次精确校验 HTTP 来源、端口和顶层窗口。省略端口的 manifest 匹配不能代替这些运行时检查。
- `storage`：仅使用浏览器会话存储记录请求 ID、公开状态和内部绑定的标签页／文档编号，供工作线程重启后去重和聚焦实际编辑器。不存源码、账户信息、Cookie 或 CSRF token；会话结束后清除。

没有 `cookies`、广泛 `tabs`、外部网站消息入口、任意网址访问或本机程序权限。不读取 Chrome 配置文件，不把登录 Cookie 导出给本地服务或宿主机。CSRF token 仅在力扣页面 MAIN 世界中读取并作为同源请求头使用，不返回后台、本地页面或日志。

公开响应仅含状态、规范化提交编号、派生的官方链接及简短固定错误/判题文案；不转发完整账户对象、HTML、Cookie、token 或原始服务器错误。

## 实现与兼容性限制

需要 Chrome 106 或更新版本。后台通过 `chrome.scripting.executeScript({ world: 'MAIN', … })` 执行自包含函数，固定目标 document，导航后不改向其他页面。流程依次为：

1. 等待原题编辑器，必要时通过其语言菜单选择 Python3。只接受 DOM 与公开 Monaco `editor.getEditors()` API 能唯一对应的可见编辑器，写入快照并读回完全相同的内容。隐藏、只读、多个候选或 API 不兼容时明确失败。
2. `POST /graphql/` 查询 `question(titleSlug) { questionId titleSlug }` 和 `userStatus { isSignedIn }`，必须严格确认登录和题目。编辑器同步在此之前完成，因此登录失败时仍可保留已确认写入的代码用于调试。
3. 再次确认原题、Python3 和编辑器代码后，对同一个显式请求 ID 最多一次 `POST /problems/<slug>/submit/`，固定 `lang: "python3"`、`question_id`、`typed_code`。
4. 若收到正整数 `submission_id`，立即返回提交详情链接，仅在约 20 秒内有限查询 `/submissions/detail/<id>/check/`。超时保留编号和链接，由用户到原站查看。

编辑器同步在后台执行，不会主动切走本地页面。点击「打开力扣编辑器」才聚焦内部绑定的同一标签页；标签页关闭或文档导航后明确提示，不新开空白草稿冒充原先同步的编辑器。同步成功标记只证明当时已读回一致，不表示之后手动修改或刷新也会保留该代码。

上述力扣字段是待验证的兼容性假设。缺字段、错误 JSON、重定向、HTML 验证页、401/403/429、登录或验证码要求都会明确失败，不尝试绕过。`state: "SUCCESS"` 只表示判题结束；必须同时满足 `status_code: 10` 和 `status_msg: "Accepted"` 才显示通过，未知判题结构保持未确认。

工作线程可能被 Chrome 终止。会话去重标记在发送前持久化，因此中断后相同请求不会重发；原页面收不到最终响应时应到原站检查。重新加载扩展、重启 Chrome 或用新的请求 ID 手动再提交，均不是对旧请求的自动恢复。

## 页面协议

本地页面使用 `window.postMessage(message, location.origin)`。接收双方都校验 `event.source === window`、精确 `event.origin`，并按请求 ID 关联。

```js
// 所有请求
{ source: 'leetcode-recap-app', version: 1, type, requestId }

// 提交还需 payload；只接受这些字段
{ slug: 'two-sum', code: 'class Solution: ...', language: 'python3' }
```

`type` 为 `LEETCODE_PING`、`LEETCODE_SUBMIT`、`LEETCODE_CANCEL` 或 `LEETCODE_OPEN_EDITOR`。`requestId` 是 8–100 位字母/数字/下划线/连字符；slug 只含小写字母、数字和分隔连字符，最长 200；源码非空且最长 100000 个 JavaScript 字符。每次明确提交使用新 ID，取消与打开编辑器沿用原提交 ID；打开请求还带独立 `openId` 关联本次点击，不接受调用方传入标签页或 URL。

```js
// 就绪
{ source: 'leetcode-recap-extension', version: 1, type: 'LEETCODE_PONG',
  requestId, status: 'ready', browser: 'chrome', extensionVersion: '1.1.0', editorSync: true }

// 状态
{ source: 'leetcode-recap-extension', version: 1, type: 'LEETCODE_STATUS',
  requestId, status, submissionId?, url, error?, statusDisplay?, editorSynced?, editorUrl? }

// 显式聚焦编辑器的独立回执
{ source: 'leetcode-recap-extension', version: 1, type: 'LEETCODE_EDITOR_OPENED',
  requestId, openId, opened, error? }
```

`submitting`、`pending` 非终态；`accepted`、`rejected`、`failed`、`canceled` 为终态。`submissionId` 为纯数字字符串。`url` 只能是官方原题或提交详情；`error` 最长 500 字符；`statusDisplay` 为已知判题文案。`failed` 也可能表示「结果未确认」，不代表力扣判为失败。收到提交编号以后，后续查询失败仍返回该编号。

只有 `editorSynced: true` 且 `editorUrl` 为当前题的规范原题编辑器地址时，前端才显示同步成功。旧版扩展缺少 `editorSync: true` 能力声明时不启用同步，并提示重新加载扩展。

## 验证

无需安装、无需依赖下载：

```sh
npm --prefix browser-extension test
```

测试使用 mock Chrome API、mock fetch 和隔离的页面环境，覆盖来源/端口、参数边界、凭据过滤、编辑器选择与内容校验、单次提交、会话去重、导航失败、取消竞态、结果解析和有限等待。测试不会访问力扣或提交真实代码。实际浏览器加载、编辑器写入、登录、验证码及原站提交结果仍待人工验证。

Chrome 行为依据：[脚本注入](https://developer.chrome.com/docs/extensions/reference/api/scripting)、[内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[匹配规则](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)、[消息传递](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)、[工作线程生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)。
