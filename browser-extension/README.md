# Chrome 本机提交联动扩展

这是项目独立的 Chrome Manifest V3 扩展。Codex 的 Chrome 连接不代表此扩展已安装；本地页面只有收到本扩展的 `LEETCODE_PONG` 才显示就绪。就绪只表示桥接正常，不表示力扣已登录或能够提交。

当前交付仅包含可审阅文件和 mock 测试。**尚未安装扩展，也未使用真实账号向力扣提交。** 力扣中国的页面内部接口不是公开、稳定、官方承诺支持的自动提交 API；当前接口字段尚未通过真实登录、提交和判题验证。公开页面抓取遇到 HTTP 403，不能据此宣称真实联动已通过。

## 安装与使用

安装需要用户确认：扩展将新增本机页面和 `https://leetcode.cn` 的站点访问权限。确认后可手动执行：

1. 在 Chrome 打开 `chrome://extensions`，启用开发者模式。
2. 选择「加载已解压的扩展程序」，选择本仓库的 **browser-extension** 文件夹。
3. 刷新 Chrome 中的本地练习页。支持 `http://127.0.0.1` 或 `http://localhost`，端口仅限 **8765、8766、5173**。连接探测会有限尝试三次，以等待扩展脚本加载；仍未连接时可点「检测连接」。这只重试连接探测，不会重试代码提交。
4. 在 Chrome 的力扣中国页面自行登录。回到本地练习页，明确勾选同步提交后再点击提交。
5. 本地判题和力扣判题分别显示结果。力扣返回提交编号后可打开其提交详情继续查看。

扩展复用同一原题标签页，或在后台创建该原题标签页。它不修改力扣编辑器内容、不点击编辑器的提交按钮、不更改 Chrome 设置。源码通过同源请求数据发送给力扣，绝不作为扩展脚本执行。

「停止等待」只停止本地等待和后续查询。已经发出的提交可能被力扣接收，无法据此撤销。超时、切页、断连或字段异常均不得视为「未提交」；应先去原站核对记录，再决定是否手动发起新请求。**扩展不会自动重试提交。**

## 权限和数据边界

- `scripting`：只在 `https://leetcode.cn/problems/<受限slug>/…` 的顶层页面执行固定、可审阅的请求适配函数。
- `https://leetcode.cn/*`：用于原题同源的 GraphQL、提交和结果查询；不接受调用方提供的域名、URL、GraphQL 文本或脚本。
- 静态 content script 只匹配两个 loopback 主机；内容脚本和后台都会再次精确校验 HTTP 来源、端口和顶层窗口。省略端口的 manifest 匹配不能代替这些运行时检查。
- `storage`：仅使用浏览器会话存储记录请求 ID 和公开状态，供工作线程重启后去重。不存源码、账户信息、Cookie 或 CSRF token；会话结束后清除。

没有 `cookies`、广泛 `tabs`、外部网站消息入口、任意网址访问或本机程序权限。不读取 Chrome 配置文件，不把登录 Cookie 导出给本地服务或宿主机。CSRF token 仅在力扣页面 MAIN 世界中读取并作为同源请求头使用，不返回后台、本地页面或日志。

公开响应仅含状态、规范化提交编号、派生的官方链接及简短固定错误/判题文案；不转发完整账户对象、HTML、Cookie、token 或原始服务器错误。

## 实现与兼容性限制

需要 Chrome 106 或更新版本。后台通过 `chrome.scripting.executeScript({ world: 'MAIN', … })` 执行自包含函数，固定目标 document，导航后不改向其他页面。流程依次为：

1. `POST /graphql/` 查询 `question(titleSlug) { questionId titleSlug }` 和 `userStatus { isSignedIn }`，必须严格确认登录和题目。
2. 对同一个显式请求 ID，最多一次 `POST /problems/<slug>/submit/`，固定 `lang: "python3"`、`question_id`、`typed_code`。
3. 若收到正整数 `submission_id`，立即返回提交详情链接，仅在约 20 秒内有限查询 `/submissions/detail/<id>/check/`。超时保留编号和链接，由用户到原站查看。

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

`type` 为 `LEETCODE_PING`、`LEETCODE_SUBMIT` 或 `LEETCODE_CANCEL`。`requestId` 是 8–100 位字母/数字/下划线/连字符；slug 只含小写字母、数字和分隔连字符，最长 200；源码非空且最长 100000 个 JavaScript 字符。每次明确提交使用新 ID，取消沿用原提交 ID。

```js
// 就绪
{ source: 'leetcode-recap-extension', version: 1, type: 'LEETCODE_PONG',
  requestId, status: 'ready', browser: 'chrome', extensionVersion: '1.0.0' }

// 状态
{ source: 'leetcode-recap-extension', version: 1, type: 'LEETCODE_STATUS',
  requestId, status, submissionId?, url, error?, statusDisplay? }
```

`submitting`、`pending` 非终态；`accepted`、`rejected`、`failed`、`canceled` 为终态。`submissionId` 为纯数字字符串。`url` 只能是官方原题或提交详情；`error` 最长 500 字符；`statusDisplay` 为已知判题文案。`failed` 也可能表示「结果未确认」，不代表力扣判为失败。收到提交编号以后，后续查询失败仍返回该编号。

## 验证

无需安装、无需依赖下载：

```sh
npm --prefix browser-extension test
```

测试使用 mock Chrome API、mock fetch 和隔离的页面环境，覆盖来源/端口、参数边界、凭据过滤、单次提交、会话去重、导航失败、取消竞态、结果解析和有限等待。测试不会访问力扣或提交真实代码。实际浏览器安装、登录、验证码及原站提交结果仍待用户确认后的人工验证。

Chrome 行为依据：[脚本注入](https://developer.chrome.com/docs/extensions/reference/api/scripting)、[内容脚本](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、[匹配规则](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)、[消息传递](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)、[工作线程生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)。
