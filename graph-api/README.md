# graph-api

graph 内部云托管服务。第一版只做 EcoCheck 候选现场经验接收、ETO 入图审核和聚合批次生成。

## 运行

```powershell
$env:ECO_GRAPH_STAGING_PATH="E:\eco-execution-graph\data\private-staging\field-events.jsonl"
$env:ECO_GRAPH_API_TOKEN="replace-with-cloudbase-secret"
pnpm --dir graph-api start
```

## CloudBase 云托管

部署前先读 `docs/deploy/cloudbase-static-readonly.md` 的 CloudBase 路径和“本机时间漂移硬规则”。本机时间可能与真实时间存在漂移,部署代理不得要求 candy 修改系统时间、时区或 Windows Time/NTP 服务;CloudBase CLI / 腾讯云签名失败时必须用非交互密钥登录、CI/云端执行器或签名层服务端时间偏移重试来处理。

本仓库固定部署入口:

```powershell
pnpm deploy:cloudbase:graph-api
```

该命令会加载 `.env.local` 或进程环境变量中的 CloudBase 凭据,为 CloudBase CLI 注入本次进程内时间偏移,同步 `graph-api/data`,执行检查/测试,部署后 smoke 远端服务。

构建目标目录填写:

```text
graph-api
```

该目录与 `Dockerfile` 同级。云托管环境至少设置:

```text
ECO_GRAPH_ENV=production
ECO_GRAPH_DEPLOY_TARGET=cloudbase
ECO_GRAPH_API_TOKEN=<在 CloudBase 控制台配置>
ECO_GRAPH_STORAGE_DRIVER=mysql
ECO_GRAPH_MYSQL_HOST=<MySQL 内网或公网地址>
ECO_GRAPH_MYSQL_PORT=3306
ECO_GRAPH_MYSQL_USER=<MySQL 用户名>
ECO_GRAPH_MYSQL_PASSWORD=<在 CloudBase 控制台配置>
ECO_GRAPH_MYSQL_DATABASE=<数据库名>
ECO_GRAPH_MYSQL_TABLE=eco_graph_field_event_reviews
```

容器启动命令会先运行:

```text
npm run db:init
```

该脚本会自动连接 MySQL、创建审核记录表、补齐缺失列和索引。你不需要手动建表。

可选运维命令:

```powershell
pnpm --dir graph-api db:init
pnpm --dir graph-api db:admin status
pnpm --dir graph-api db:admin list
pnpm --dir graph-api db:admin delete <审核编号>
pnpm --dir graph-api db:admin clear
```

本地开发仍可不配 MySQL,默认用 `ECO_GRAPH_STAGING_PATH` 指向 JSONL 文件。

## 边界

- 只接收候选现场经验,默认进入 private staging。
- 不接收法条全文、真实附件路径、GPS、原始照片、密钥或原始企业报告全文。
- 不反写 EcoCheck 业务状态。
- shared/CloudBase 静态演示包不装载本服务的审核数据。
- 云托管环境必须设置 `ECO_GRAPH_API_TOKEN`;设置后所有 `/api/` 请求必须携带 `Authorization: Bearer <token>`。
- CloudBase 云托管建议使用 MySQL 存储审核记录;JSONL 只适合本地或临时单实例验证。
