# 上下文装配 API v0(P5 实装,契约先行)

## 定位

第二刀:月报/一企一档生成时,按"当前企业 + 当前报告段落"自动装配 AI 上下文 = **取相关节点的邻域子图**,代替把整库塞给模型。ego 视图(ADR-0009)是本 API 的可视化调试器。

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
  law_refs: [...],                 // law_article 瘦节点列表 → 调用方凭 rag_doc_ref 取全文
  evidence_index: [...],           // 证据索引
  rectification_ranked: [...],     // 整改建议按真实通过率排序(ADR-0005)
  report_expressions: [...],       // 该 issue_type 的报告表达模板
  bdd_rules: [...],                // 适用的行为规则(降级/禁止行为)
  trace: { node_ids: [], edge_ids: [] }   // 装配溯源,审计用
}
```

## 硬规则

- 输出含 `trace`:报告里每个结论可回指装配时用了哪些节点/边。
- 法条只给瘦引用,全文由调用方(EcoDoc)向腾讯云 RAG 取,失败则触发降级表达(CONTEXT.md 判断规则 #1)。
- 本 API 只读;回灌通道复用 EcoCheck `semantic_event_outbox` 对侧(蒸馏 v2 spec 岔路3 取定)。
