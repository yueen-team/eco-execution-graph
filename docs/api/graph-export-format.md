# 图谱导出格式 v1

## 形态

每次导出产出一个包目录 `data/exports/<package_name>_vX/`:

```
graph.json           # { "nodes": [...], "edges": [...], "sources": [...] }
graph.ndjson         # 每行 { "record_type": "node|edge|source", ...record }
manifest.json        # 包元数据 + 各文件 sha256 + tier 过滤声明 + 记录计数
```

校验规则(导出时强制,verify leak 复检):

1. NDJSON 回放计数必须等于 JSON 三数组计数;
2. 每条 edge 的 `source_ref` 必须能在 sources 中找到;
3. `tier_filter: "shared"` 的包中,任何 node / edge / source 记录 `tier != "shared"` ⇒ 构建失败;
4. shared 包中不得出现 node_type ∈ {enterprise, facility, discharge_outlet, risk_unit, issue_instance, pitfall_instance, evidence_judgment_standard, evidence_instance, rectification_*, report_expression, distill_event};
5. shared 包允许 evidence_category 与概念级/部分 evidence_field_requirement,但不得出现证据判断标准、真实样例、审核笔记;
6. aggregate 包仅含 stat_signal / pitfall_pattern_stat,且每条记录 `sample_size >= 5`;
7. `regulated_by` / `manifests_as` 边必须带 `legal_basis_status`,共有包不得包含 `candidate` / `disputed` 法律判断边。
8. 每条 edge 必须带图谱质量评分字段: `confidence_reason`、`evidence_count`、`last_verified_at`、`reviewer_role`、`staleness_risk`。

## 包类型

| 包 | tier_filter | 消费者 |
|---|---|---|
| `full_internal` | 无(全量) | graph-ui 内部全量视图、内部分析 |
| `shared_package` | shared | 软著材料、培训、执法大队工具 |
| `aggregate_stats` | aggregate | 政策/数据支持简报 |
| `demo_package` | 无,但企业节点必为合成样本 | 演示驾驶舱(ADR-0008) |
