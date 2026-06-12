# graph-api

graph 内部云托管服务。第一版只做 EcoCheck 候选现场经验接收、ETO 入图审核和聚合批次生成。

## 运行

```powershell
$env:ECO_GRAPH_STAGING_PATH="E:\eco-execution-graph\data\private-staging\field-events.jsonl"
$env:ECO_GRAPH_API_TOKEN="replace-with-cloudbase-secret"
pnpm --dir graph-api start
```

## 边界

- 只接收候选现场经验,默认进入 private staging。
- 不接收法条全文、真实附件路径、GPS、原始照片、密钥或原始企业报告全文。
- 不反写 EcoCheck 业务状态。
- shared/CloudBase 静态演示包不装载本服务的审核数据。
- 云托管环境必须设置 `ECO_GRAPH_API_TOKEN`;设置后所有 `/api/` 请求必须携带 `Authorization: Bearer <token>`。
