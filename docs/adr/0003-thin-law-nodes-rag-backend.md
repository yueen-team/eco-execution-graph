# ADR-0003 法条瘦节点 + lineage_ref;全文留在腾讯云 RAG

- 状态:Accepted(2026-06-10)

## 决策

law_article 节点只存:`law_id`、法规名、条款号、义务谓词(适用对象/触发条件/管理要求摘要)、`effective_status`、轻量 `lineage_ref`。**法条全文不进图**,存于腾讯云知识引擎原子能力 + RAG 组件(以及未来政府法典库)。

查询模式:图先用边(manifests_as / regulated_by)定位"引哪几条",RAG 再按 ID 取原文用于引用。

正式沿革关系用图边表达,而不是只靠字符串指针:

| edge_type | 含义 |
|---|---|
| `replaced_by` | 旧条款被新条款替代 |
| `amended_by` | 条款被修订 |
| `split_into` | 一条拆成多条 |
| `merged_into` | 多条合并成一条 |
| `inherits_from` | 法典条款继承历史单行法条款 |
| `conflicts_with` | 新旧口径存在冲突/待解释 |

这些边是政府合作预留的挂载点:生态环境法典生效后,图谱全部法律引用沿关系化 lineage 边迁移,不需人工重挂。

## 理由

1. 两套法规文本(图内+RAG)必然失步,引用错法条在本行业是责任事故。
2. 法规权威解释与沿革关系是政府合作方的主场资产;我方维护"业务关联",不维护"文本权威"。
3. 法典编纂正在进行,挂死在现行单行法条号上的图会在法典生效日整体失效。

## 后果

- 报告生成必须实时(或带缓存地)调 RAG 取原文;RAG 不可用时按 CONTEXT.md 判断规则 #1 降级,不凭记忆引用。
- lineage 数据格式以 `docs/api/` 契约为准,待政府对接校准(specs/open-questions Q4)。
- 法律判断边必须带 `legal_basis_status`: `official_confirmed` 可写"依据/根据";`internal_reviewed` 只能写"参考相关要求";`candidate` 不得对外引用;`disputed` 进人工审核;`no_legal_basis` 只能写管理建议。
