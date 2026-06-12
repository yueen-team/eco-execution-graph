# 上下文装配 API v0(P0.5 离线验证,P5 实装)

## 定位

第二刀:月报/一企一档生成时,按"当前企业 + 当前报告段落"自动装配 AI 上下文 = **取相关节点的邻域子图**,代替把整库塞给模型。ego 视图(ADR-0009)是本 API 的可视化调试器。

P0.5 先做离线最小验证,不接正式 EcoCheck:输入一个合成企业、3 条危废现场问题、相关法条 ID;系统装配上下文并生成一段月度体检报告段落,由 ETO 对比"旧 AI 直接写"与"图谱装配后写"。

## 接口草案

```
assembleContext(request) -> ContextBundle

request = {
  enterprise_ref: string,          // EcoCheck 企业 ID
  dimension: string,               // 如 "危废管理"
  section: string,                 // 报告段落类型,如 "年度危废分析"
  depth: 1 | 2                     // 邻域跳数
}

ContextBundle = {
  facts: [...],                    // 企业当期事实(issue_instance 等,private)
  issue_types: [...],              // 关联问题类型 + 踩雷点
  law_refs: [...],                 // law_article 瘦节点 + citation metadata → 调用方凭 rag_doc_ref 取全文
  evidence_categories: [...],      // 可出证据类别
  evidence_field_requirements: [...], // 概念级/部分字段要求
  evidence_private_refs: [...],    // 判断标准/样例/审核笔记,只给内部引用或数量占位
  rectification_ranked: [...],     // 整改建议按真实通过率排序(ADR-0005)
  report_expressions: [...],       // 该 issue_type 的报告表达模板
  bdd_rules: [...],                // 适用的行为规则(降级/禁止行为)
  legal_basis_status: "official_confirmed | internal_reviewed | candidate | disputed | no_legal_basis",
  trace: { node_ids: [], edge_ids: [] }   // 装配溯源,审计用
}
```

## 硬规则

- 输出含 `trace`:报告里每个结论可回指装配时用了哪些节点/边。
- 法条只给瘦引用,全文由调用方(EcoDoc)向腾讯云 RAG 取,失败则触发降级表达(CONTEXT.md 判断规则 #1)。
- `law_refs` 只能携带 `provider`、`rag_doc_ref`、`node_id`、`node_type`、`law_name`、`article_no`、`tech_spec_no`、`citation_title`、`citation_locator`、`source_hash`、`resolved_at`、`raw_cached=false`、`cache_policy=metadata_only`、`retrieval_probe`、`report_usage_policy` 等 citation metadata。不得携带 RetrieveKnowledge 的 `Content` 或原始响应。
- `citation_locator` 应优先使用条款号、规范编号、页码或章节。只有这些 metadata 都缺失时,才允许降级为 `source-level`,并进入人工补定位队列。
- `legal_basis_status` 控制输出: candidate 仅内部提示,disputed 必须人工审核,no_legal_basis 只能写管理建议。
- 本 API 只读;回灌通道复用 EcoCheck `semantic_event_outbox` 对侧(蒸馏 v2 spec 岔路3 取定)。
