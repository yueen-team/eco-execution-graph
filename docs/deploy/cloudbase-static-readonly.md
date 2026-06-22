# CloudBase 只读静态演示部署

## 结论

第一版云端演示只部署前端静态站,目标是给主任团队看 shared 口径、审核后的 5 张执行卡、缺口报告和授权边界。

`现场经验入图审核台` 不进入本静态 shared 包。审核台属于 graph 内部工作区,真实接收与审核接口走 `graph-api/` CloudBase 云托管;静态 shared 包只保留只读演示数据。

不要直接上传 `graph-ui/dist`。普通构建产物包含内部全量演示数据文件名,只允许上传脚本生成的只读包:

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/prepare_cloudbase_static_readonly.ps1
```

生成目录:

```text
graph-ui/dist-cloudbase-static-readonly/
```

## 数据边界

只读静态包会做以下处理:

- `full-graph.json` 覆盖为 `shared_product_v1/graph.json`;
- `graph.json` 覆盖为 `shared_product_v1/graph.json`;
- `full-cards.json` 覆盖为 `shared_product_v1/cards.shared.json`;
- `cards.json` 覆盖为 `shared_product_v1/cards.shared.json`;
- 移除 `monthly-comparison.json`,因为月报对比仍等待真实脱敏历史段落的审核盲评;
- 扫描 private tier、内部模板、密钥和原始 RAG 响应标记。

不得上传:

- `data/exports/full_internal_product_v1`;
- `graph-ui/dist` 原始目录;
- `.env` 或 `.env.local`;
- 真实企业数据;
- 腾讯云密钥;
- RAG 原文响应。

## CloudBase 部署路径

### 根目录保护红线

`www.yueen.cc` 的根目录是悦恩官网吗,不是本项目目录。**任何人不得把本项目静态包上传到 CloudBase 静态托管根目录 `/`。**

本项目只能部署到静态托管目标目录:

```text
dist-cloudbase-static-readonly
```

部署命令里的最后一个参数必须是 `dist-cloudbase-static-readonly`。如果误写成 `/`、空字符串、根目录默认值,会覆盖企业官网、`/ecomind-ai/` 等同域名下的其他应用。发现命令目标不是 `dist-cloudbase-static-readonly` 时,必须立刻停止部署。

本环境自定义域名把 `/eco-execution-graph` 路由到静态托管目录 `dist-cloudbase-static-readonly/`。因此:

- Vite 构建 base 必须是 `/eco-execution-graph/`;
- CloudBase 上传目标必须是 `dist-cloudbase-static-readonly`,不得上传到静态托管根目录;
- 不需要在静态托管根目录创建 `eco-execution-graph/` key。

CLI 部署命令:

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/prepare_cloudbase_static_readonly.ps1
cloudbase hosting deploy -e yueen-huanbao-1gqfjr5s41e61180 graph-ui/dist-cloudbase-static-readonly dist-cloudbase-static-readonly
```

验证 URL:

```text
https://www.yueen.cc/eco-execution-graph/?director=1
```

必须确认:

1. 页面 HTML 返回 200;
2. `assets/*.js` / `assets/*.css` 通过 `/eco-execution-graph/assets/` 返回正确 MIME;
3. `demo-data/*.json` 通过 `/eco-execution-graph/demo-data/` 返回 `application/json`;
4. 首屏为审核后的 5 张卡主线,不是云南踩雷地图或月报对比。

## graph-api 云托管前置条件

`现场经验入图审核台` 不属于 shared 静态演示包。真实审核必须走 `graph-api/` 云托管或同源内部代理。

部署 `graph-api/` 前必须满足:

1. 设置 `ECO_GRAPH_API_TOKEN`,并设置 `ECO_GRAPH_ENV=production` 或 `ECO_GRAPH_DEPLOY_TARGET=cloudbase`;生产或云托管环境缺少 token 时服务会拒绝启动。
2. 前端不得硬编码长期服务密钥。内部审核台访问有锁后端时,应通过 CloudBase 网关、同源代理或登录态换取短期内部请求能力。
3. 文件化 `data/private-staging/` 只能用于本地或单实例试运行。CloudBase 云托管建议设置 `ECO_GRAPH_STORAGE_DRIVER=mysql`,由 `graph-api` 启动脚本自动建表、补齐缺失列和索引。
4. 云托管入口必须限制为内部访问,不得把 private staging API 暴露为公网匿名读写。
5. 继续禁止接收真实附件路径、原始照片、GPS、法条全文、原始报告全文和密钥。

### EcoCheck 联调门禁

上线联调前必须逐项确认:

1. CloudBase 控制台已手工配置 `ECO_GRAPH_API_TOKEN`、`ECO_GRAPH_SESSION_SECRET`、`ECO_GRAPH_WECOM_*` 和 `ECO_GRAPH_MYSQL_*`;仓库只保留 `.env.example` 占位符。
2. 存储形态已明确:本地或单实例试运行可用 `ECO_GRAPH_STORAGE_DRIVER=jsonl`;CloudBase 多实例或可扩缩云托管必须使用 `ECO_GRAPH_STORAGE_DRIVER=mysql`。
3. EcoCheck CloudRun 的 `ECO_GRAPH_API_TOKEN` 必须与 graph-api 接收端的 `ECO_GRAPH_API_TOKEN` 是同一个值;EcoCheck 的 `/api/graph/context` 拉取和 `/api/ecocheck/field-events` 回流共用该 token。
4. EcoCheck 回流必须显式设置 `ECO_GRAPH_PUSH_ENABLED=true` 和 `ECO_GRAPH_FIELD_EVENT_ENDPOINT=https://<graph-api-domain>/api/ecocheck/field-events`;只设置 context endpoint 不会启动回流 worker。
5. 部署记录不得回显 token、MySQL 密码、企业微信 secret 或生产企业数据;只记录变量是否已配置、命令、smoke 结果和回滚风险。

当前 CloudBase 服务若仍保留旧入口命令 `pnpm --dir graph-api start`,镜像内提供了同名兼容启动垫片,只用于过渡到本仓库 Dockerfile。正式入口建议改为使用 Dockerfile 默认 `CMD`,或改成等价命令:

```text
npm run db:init && node src/server.js
```

后端云托管后续还会承载:

- RAG 检索代理;
- 上下文装配接口;
- 监管口径一致性检查接口;
- 登录鉴权和审计日志;
- private runtime 只在服务端运行。

## 回滚

CloudBase 静态托管回滚方式:

1. 保留上一版静态托管上传包;
2. 如新包异常,重新上传上一版目录;
3. 如果发现 private 泄漏、真实企业数据、密钥或 RAG 原文响应,立即下线静态站并停止传播链接。

## 当前部署记录

本项目当前采用:

- CloudBase 环境: `yueen-huanbao-1gqfjr5s41e61180`;
- 地域: `ap-shanghai`;
- 静态托管目标目录: `dist-cloudbase-static-readonly`;
- 静态访问路径: `https://www.yueen.cc/eco-execution-graph/`;
- 云托管服务名: `graph-api`;
- 云托管访问路径: `https://www.yueen.cc/container-eco-execution-graph`;
- 后端运行端口: `8787`。

若要部署审核台,必须先完成上面的 `graph-api` 云托管前置条件。每次部署后必须在交付记录中写清:环境、命令、smoke 结果、回滚风险。
