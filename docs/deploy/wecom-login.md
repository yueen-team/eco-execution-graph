# 企业微信登录部署说明

> 定位:内部/小范围使用,只认企业微信成员身份;不开手机号或邮箱注册(自管凭证安全性不达标)。

## 流程

```
/login.html → GET /auth/wecom/start → 302 企业微信扫码页(login.work.weixin.qq.com/wwlogin/sso/login)
→ 扫码确认 → 企业微信回调 GET /auth/wecom/callback?code=…
→ graph-api 用 corpsecret 换 access_token,再用 code 换 userid(qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo)
→ 公司成员白名单校验 → 签发 HMAC 会话 cookie(eco_graph_session,HttpOnly + SameSite=Lax + Secure,12 小时)
→ ETO/admin 进入 <内部图谱前端>/app.html?workspace=review;普通成员进入 <内部图谱前端>/app.html
```

应急通道:`/login.html` 折叠区可粘贴 `ECO_GRAPH_API_TOKEN`(Bearer),仅运维兜底用。

## 企业微信管理台准备

1. 「应用管理 → 自建应用」创建应用,记录 `CorpId`、`AgentId`、`Secret`。
2. 应用「网页授权及 JS-SDK」可信域名 = 部署域名(需完成域名校验文件)。
3. 「企业微信授权登录」开启 Web 登录,回调域配置为部署域名。

## 环境变量(CloudBase 云托管)

| 变量 | 说明 |
|---|---|
| `ECO_GRAPH_WECOM_CORP_ID` | 企业 ID |
| `ECO_GRAPH_WECOM_AGENT_ID` | 自建应用 AgentId |
| `ECO_GRAPH_WECOM_CORP_SECRET` | 自建应用 Secret(密钥只走环境变量) |
| `ECO_GRAPH_WECOM_REDIRECT_URI` | `https://<域名>/container-eco-execution-graph/auth/wecom/callback` |
| `ECO_GRAPH_APP_BASE_URL` | 扫码成功后的内部图谱前端入口,本环境为 `https://www.yueen.cc/eco-execution-graph-internal/` |
| `ECO_GRAPH_WECOM_ALLOWED_USERS` | 公司成员登录白名单;留空=放行全企业成员 |
| `ECO_GRAPH_WECOM_REVIEW_USERS` | ETO/admin 审核台白名单;逗号分隔企业微信 userid |
| `ECO_GRAPH_SESSION_SECRET` | 32+ 随机字符,会话签名密钥 |

未配置时 `/auth/wecom/start` 返回 503,绝不半开放;生产环境仍强制 `ECO_GRAPH_API_TOKEN`(fail-closed,见 server.js `validateRuntimeConfig`)。

注意:`ECO_GRAPH_WECOM_REDIRECT_URI` 是企业微信回调到后端的地址;`ECO_GRAPH_APP_BASE_URL` 是后端签发会话后跳回前端的地址。CloudBase 云托管地址在 `www.yueen.cc/container-eco-execution-graph`,审核员/admin 的 `ECO_GRAPH_APP_BASE_URL` 应指向内部壳 `https://www.yueen.cc/eco-execution-graph-internal/`。若回调后仍跳到 `/` 或 `/?workspace=review`,浏览器会落到同域名企业官网根目录;若跳到 `/eco-execution-graph/`,则会进入只读 shared 演示包,审核台按钮仍会被隐藏。

## 边界

- 只读共有演示包(着陆页、主任演示)不需要登录 —— 零门槛是演示价值的一部分。
- 内部知识库入口必须在企业微信登录后面;审核台还必须命中 `ECO_GRAPH_WECOM_REVIEW_USERS`。
- `/api/graph/context` 可由已登录公司成员读取瘦条款上下文;`/api/review/*`、`/api/ecocheck/field-events` 和 `/api/aggregate/pitfall-batches` 只允许 ETO/admin 会话或内部 Bearer token。
- 会话只存 userid,不落任何个人敏感信息;staging 数据治理见 `ecocheck-field-event-intake.md`。

## 公开站备案提醒

着陆页绑自定义域名公开访问需 ICP 备案(公司主体,周期数周);备案完成前可用 CloudBase 默认域名内部预览。页脚备案号占位在 `landing.html#icp`。
