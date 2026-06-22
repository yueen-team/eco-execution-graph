# EcoCheck graph-api 联调人工测试报告

日期: 2026-06-22  
范围: A1 环境变量、A2 存储驱动、A3 EcoCheck/graph-api token 对齐  
结论: 本地 graph-api 鉴权、jsonl 初始化、候选事件 HTTP 往返、泄漏契约均已跑通;CloudBase 控制台真实环境变量、MySQL 真实连接、EcoCheck CloudRun 真实 worker 推送未跑,仍需人工在控制台联调。

## 1. 检查对象

### graph 仓

- `.env.example`: 已覆盖 `ECO_GRAPH_API_TOKEN`、`ECO_GRAPH_SESSION_SECRET`、企业微信四件套和 MySQL 凭证占位符;未发现真实密钥。
- `graph-api/src/server.js`: `/api/*` 统一走 Bearer token 或企业微信 session;生产或 CloudBase 环境缺 `ECO_GRAPH_API_TOKEN` 会拒绝启动。
- `graph-api/src/storage.js`: 默认本地 jsonl;设置 `ECO_GRAPH_STORAGE_DRIVER=mysql` 或 MySQL host 后走 MySQL。
- `graph-api/Dockerfile`: 默认 `CMD ["sh", "-c", "npm run db:init && node src/server.js"]`,启动前会执行表初始化。
- `docs/api/ecocheck-field-event-intake.md`: 已写明 jsonl 只允许本地或单实例试运行,CloudBase 建议 MySQL。
- `docs/deploy/cloudbase-static-readonly.md`: 本次补充 EcoCheck 联调门禁。

### EcoCheck 仓

- `cloudrun/src/services/graph-field-event-push-service.ts`: 读取 `ECO_GRAPH_PUSH_ENABLED`、`ECO_GRAPH_FIELD_EVENT_ENDPOINT`、`ECO_GRAPH_API_TOKEN`,POST 时发送 `Authorization: Bearer <token>`。
- `cloudrun/src/services/graph-context-client.ts`: `/api/graph/context` 拉取同样读取 `ECO_GRAPH_API_TOKEN` 并发送 Bearer。
- `docs/semantic-os-integration-handoff.md` 与 `docs/semantic-field-fact-middle-layer.md`: 已说明 context 拉取和 field-events 回流共用同一枚 graph token。

## 2. 已执行验证

| 环节 | 命令/方式 | 结果 |
|---|---|---|
| graph-api 语法检查 | `pnpm --dir graph-api check` | PASS |
| graph-api 单元/接口测试 | `pnpm --dir graph-api test` | PASS, 27/27 |
| 生产缺 token 拒启 | `ECO_GRAPH_ENV=production; ECO_GRAPH_API_TOKEN=; pnpm --dir graph-api start` | PASS, 抛出“生产或云托管环境必须设置 ECO_GRAPH_API_TOKEN” |
| jsonl 存储初始化 | 临时 `ECO_GRAPH_STAGING_PATH`; `pnpm --dir graph-api db:init` | PASS, `storage ready: jsonl` |
| HTTP smoke | 本地 8789 启动 graph-api,依次请求 healthz、无 token 列表、有 token POST、列表查询 | PASS: health `pass`;无 token `401`;POST `pass`;列表 1 条 |
| 泄漏契约 | `pnpm verify:leak` | PASS, shared/full shared 均无 private 泄漏 |
| check 总入口 | `pnpm verify:check` | BLOCKED: `gherkin-v39` 命令缺失,`schema-validate` 与 `docs-matrix` 已 PASS,卡在 `bdd-export` |

## 3. 跑通路径

1. A1 环境变量覆盖: graph 仓占位符和部署文档覆盖 CloudBase 必填项;真实值仍只能在控制台或服务端环境配置。
2. A2 单实例 jsonl 路径: 本地 `db:init` 和 HTTP smoke 已确认 jsonl 可用于开发/单实例试运行。
3. A2 CloudBase MySQL 路径: Dockerfile 与脚本路径已确认会先执行 `db:init`;未连接真实 MySQL。
4. A3 token 契约: graph 接收端校验 `Authorization: Bearer <ECO_GRAPH_API_TOKEN>`;EcoCheck 推送端和 context 拉取端均使用同名 `ECO_GRAPH_API_TOKEN`。
5. 数据治理: graph-api 测试覆盖法条全文/原始附件路径拒绝、候选默认待审核、未审核不进聚合、样本不足不输出、shared 泄漏测试通过。

## 4. 未跑通/缺口

| 缺口 | 当前状态 | 影响 | 下一步 |
|---|---|---|---|
| CloudBase 控制台真实环境变量 | 未验证 | A1 仍可能因控制台漏配导致启动失败或登录失败 | 运维在 CloudBase `graph-api` 服务配置 token/session/企业微信/MySQL 后截图或导出变量名清单,不含值 |
| MySQL 真实连接与建表 | 未验证 | A2 多实例安全性未闭环;jsonl 扩缩会丢审核记录 | 在 CloudBase 或同网络 MySQL 配置 `ECO_GRAPH_STORAGE_DRIVER=mysql` 后运行 `npm run db:init` 并查表状态 |
| EcoCheck CloudRun 真实 worker 推送 | 未验证 | A3 最可能联调失败点仍未在线闭环 | 设置 EcoCheck `ECO_GRAPH_PUSH_ENABLED=true`、field event endpoint 和同一 token,推 5 条合成/测试企业事件 |
| graph-api 线上 URL smoke | 未验证 | 本地通过不等于线上网关、域名、路由通过 | 访问线上 `/healthz`;无 token `/api/review/field-events` 应 401;用内部 token POST 合成事件 |
| `pnpm verify:check` | 未跑通 | BDD 导出无法确认当前本机工具链完整 | 安装/接入 `gherkin-v39` CLI 后重跑 `pnpm verify:check` 或 `pnpm verify:all` |
| 企业微信真实扫码登录 | 未验证 | 审核台登录路径可能因可信域名/回调配置失败 | 控制台配置 `ECO_GRAPH_WECOM_*` 后访问 `/auth/wecom/start` 做扫码回调 smoke |

## 5. 风险判断

- 风险等级: 中高。代码级契约基本闭合,但 CloudBase 控制台变量、MySQL 和跨仓在线 worker 尚未实测。
- 最大风险: EcoCheck 和 graph-api 的 `ECO_GRAPH_API_TOKEN` 不一致,表现为 EcoCheck worker 反复收到 401。
- 次要风险: CloudBase 云托管使用 jsonl 且开启扩缩,导致审核记录落在不同容器本地盘或容器重启后丢失。
- 回滚风险: 本次只改文档和报告,不改变运行代码;运行回滚风险低。

## 6. to bo

1. CloudBase graph-api 控制台配置必填变量: `ECO_GRAPH_API_TOKEN`、`ECO_GRAPH_SESSION_SECRET`、`ECO_GRAPH_WECOM_*`、`ECO_GRAPH_STORAGE_DRIVER=mysql`、`ECO_GRAPH_MYSQL_*`。
2. CloudBase graph-api 部署后执行线上 smoke: `/healthz`、无 token 401、有 token POST 合成事件、GET 审核列表。
3. EcoCheck CloudRun 配置同一枚 `ECO_GRAPH_API_TOKEN`,并显式开启 `ECO_GRAPH_PUSH_ENABLED=true` 与 `ECO_GRAPH_FIELD_EVENT_ENDPOINT`。
4. 用 5 条合成/测试企业事件做端到端联调,确认 graph 审核台可见、审核后聚合路径可生成候选。
5. 补齐本机或 CI 的 `gherkin-v39` CLI,重跑 `pnpm verify:check`/`pnpm verify:all`。
