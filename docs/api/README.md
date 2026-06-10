# API 契约索引

| 契约 | 文件 | 状态 |
|---|---|---|
| 图谱导出格式(JSON/NDJSON 双形态 + tier 过滤包) | `graph-export-format.md` | v1 draft |
| 图谱质量评分字段 | `graph-quality-scoring.md` | v0 draft(P1 起强制写入边) |
| 上下文装配 API(第二刀:月报回灌) | `context-assembly-api.md` | v0 draft(P0.5 离线验证,P5 实装) |
| 云南环保高频踩雷地图 | `pitfall-map.md` | v0 draft(aggregate-only) |
| 监管口径一致性检查器 | `regulatory-consistency-checker.md` | v0 draft(P1 内部门禁) |
| 腾讯云 LKE/RAG 接入路径 | `tencent-lke-rag-integration.md` | v0 draft(官方文档核对后) |
| 腾讯云 RAG adapter | `tencent-rag-adapter.md` / `rag-doc-ref-registry.md` | v0 draft(P2P3 citation metadata) |
| 政府 lineage 数据交换格式 | `lineage-exchange.md` | v0 占位(待对接校准,specs Q4) |

规则:API 行为变化必须同步更新本目录;破坏性变更配 ADR;消费者(EcoCheck/EcoDoc/政府侧)对接前以本目录为准。
