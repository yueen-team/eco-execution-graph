# Knowledge Governance Layer v1

## 定位

知识治理中层位于腾讯云 RAG 知识库、eco-execution-graph、专家智能体小悦、EcoCheck 和 EcoCheck 环保体检报告 EcoDoc worker 之间。它不保存法规/规范全文,也不直接改生产知识库;它负责把“文档级治理”和“图谱反馈候选”整理成可审核、可发布、可追溯的本地离线产物。

固定路径:

```
RAG RetrieveKnowledge + TokenHub DeepSeek
  -> knowledge governance registry/candidates/publications
  -> graph context / Xiaoyue / EcoCheck / EcoCheck health-report EcoDoc worker
```

ADP 不在知识库路径内。

## 输入

| 输入 | 文件或接口 | 用途 | 红线 |
|---|---|---|---|
| RAG citation report | `reports/rag-citation-resolution-report.json` | 文档标题、RAG 定位符、source-level 定位不足项 | 只读 metadata,禁止保存 `Content` |
| 图谱 thin refs | `data/exports/demo_hazardous_waste_internal/graph.json` 或 full internal graph | `law_article`、`tech_spec`、`standard_limit` 的瘦引用 | 法条全文不进图 |
| EcoCheck outbox 对侧 | `ecocheck.semantic_event.v2` 对应候选 | 现场经验候选与成效反馈 | 不接企业原始证据、GPS、照片路径、原始报告全文 |
| 人工审核记录 | 后续 review bundle | 晋级 approved/human_reviewed | 不允许系统自动晋级 |

## 输出

| 输出 | 默认路径 | 消费方 |
|---|---|---|
| KnowledgeDocument registry | `data/knowledge-governance/doc-registry/knowledge-documents.json` | 内部治理、RAG 文档台账 |
| Governance candidates | `data/knowledge-governance/candidates/governance-candidates.json` | ETO/candy 审核 |
| Publication bundles | `data/knowledge-governance/publications/*.json` | 小悦、EcoCheck、EcoCheck 环保体检报告 EcoDoc worker、内部审核 |
| Reports | `reports/knowledge-governance-report.*`、`reports/knowledge-publication-report.*` | 验证与交付说明 |

## 审核与发布口径

ETO 审核进图是主审核。进入图谱 approved/human_reviewed 的知识,可以自动进入小悦、EcoCheck、EcoCheck 环保体检报告 EcoDoc worker 的图谱上下文接口;不再追加一道人审。发布前只跑机器 policy gate:

- 不含 private tier 数据;
- 不含 RAG `Content` 或法规/规范全文;
- `legal_basis_status` 为 `official_confirmed` 或 `internal_reviewed`;
- 法规/规范瘦条款有 `rag_doc_ref`;
- source-level 定位不足的条款进入 blocked,等待定位补全;
- trace/source_ref 完整。

只有修改腾讯云法规/规范原文库、把 candidate/disputed/no_legal_basis 晋级为对外法律依据、废止/替换/删除正式文档、或面向政府/外部客户输出确定法律认定时,才需要额外人工确认。

## 核心对象

### KnowledgeDocument

文档级元数据对象。表示法规、技术规范、政策文件、指南或管理手册的可治理身份。

必须包含:

- `doc_id`
- `doc_type`
- `title`
- `canonical_title`
- `rag_doc_ref`
- `content_hash`
- `metadata_hash`
- `effective_status`
- `supersedes`
- `superseded_by`
- `dedupe_group_id`
- `review_status`
- `trace`

禁止包含:

- RAG `Content`
- 法律法规全文
- 技术规范全文
- 企业私有证据
- GPS、照片路径、原始报告片段

### KnowledgeGovernanceCandidate

待审核治理候选。所有候选默认 `review_status=candidate`。

候选类型:

- `doc_dedupe`
- `doc_status_update`
- `locator_patch`
- `alias_normalization`
- `graph_expert_candidate`
- `legal_mapping_review`
- `publication_blocker`

候选只表达“建议怎么改”和“证据在哪里”,不得直接改 approved registry 或腾讯云知识库。

### PublicationBundle

发布给消费侧的只读 bundle。每个 item 必须包含:

- `trace`
- `source_ref`
- `legal_basis_status`
- `review_status`
- `rag_doc_ref`

不同消费方的默认边界:

| audience | 内容 | 不允许 |
|---|---|---|
| `expert_agent` | 小悦使用的 ETO 已审核图谱上下文、法规/规范瘦条款、专家经验摘要 | RAG 全文、未审核法律结论 |
| `ecocheck` | ETO 已审核现场适用建议、证据类别、整改建议、trace、瘦条款引用 | candidate/disputed 法律依据 |
| `ecodoc` | EcoCheck 环保体检报告 EcoDoc worker 使用的报告表达、引用一致性、旧规范拦截信号、瘦条款引用 | 旧规范作为正式法律依据 |
| `internal_review` | blocked items、候选原因、人工审核入口 | 企业原始证据 |

## Graph Context API

小悦、EcoCheck 和 EcoCheck 环保体检报告 EcoDoc worker 采用双接口消费:

- 图谱 API: `/api/graph/context`,返回已审核图谱上下文、`law_refs`、`tech_spec_refs`、blocked refs 与 trace。
- 腾讯云 RAG API: 按图谱返回的 `rag_doc_ref`、条款号或标准号取原文。

图谱 API 负责匹配和解释瘦条款,RAG 负责取回原文。生成内容时必须先以图谱 API 的 `legal_basis_status` 和 blocked refs 控制表达强度。

请求:

```
GET /api/graph/context?node_id=issue:hw:label-incomplete&depth=2
GET /api/graph/context?q=危废标签&depth=2
```

响应:

```
{
  "status": "pass",
  "approval_basis": "ETO_APPROVED_IN_GRAPH",
  "human_review_required": false,
  "machine_gate_status": "pass",
  "root_nodes": [],
  "graph_context": { "nodes": [], "edges": [] },
  "law_refs": [],
  "tech_spec_refs": [],
  "blocked_refs": [],
  "trace": { "node_ids": [], "edge_ids": [], "source_refs": [] }
}
```

## CLI

```
python pipeline/knowledge_governance.py build-registry
python pipeline/knowledge_governance.py generate-candidates
python pipeline/knowledge_governance.py publish-bundles
python pipeline/knowledge_governance.py all
```

每个命令支持 `--check`。`--check` 会执行同样的红线扫描与报告输出,用于验证入口。

## 红线

- RAG `Content` 不得出现在 registry、candidate、publication 或 report 中。
- `effective_status=deprecated/superseded` 的文档不得进入 `expert_agent`、`ecocheck`、`ecodoc` 的正式发布 items。
- `legal_basis_status=candidate/disputed/no_legal_basis` 不得包装成确定法律义务。
- 图谱现场经验不得自动进入法规/规范原文知识库。
- publication bundle 与 Graph Context API 必须可追溯,缺 `trace/source_ref/legal_basis_status` 即阻断发布或进入 `blocked_refs`。
- v1 只做本地离线产物,不直接写腾讯云知识库和 EcoCheck 生产库。
