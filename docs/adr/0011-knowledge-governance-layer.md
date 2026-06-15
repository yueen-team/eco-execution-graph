# ADR-0011 知识治理中层

- 状态:Accepted(2026-06-15)

## 决策

在腾讯云 RAG 知识库与环保现场执行图谱之间增加 **Knowledge Governance Layer(知识治理中层)**。它负责文档版本治理、去重、废止/替代状态、定位补全候选、图谱反馈候选和消费侧发布包编排。

固定链路改为“双事实源、双接口消费”:

```
腾讯云 RAG 知识库(原文与检索)  -> rag_doc_ref 取全文
eco-execution-graph(ETO 已审核关系语义与现场经验) -> /api/graph/context 取瘦条款与场景上下文
知识治理中层 -> 去重/版本/状态/候选队列/机器门禁发布包
DeepSeek 专家智能体小悦 / EcoCheck / EcoCheck 环保体检报告 EcoDoc worker 同时消费 RAG 与图谱 API
```

知识库不接 ADP。知识库路径继续使用 `RetrieveKnowledge` 检索与 TokenHub DeepSeek 生成,见 `docs/api/tencent-lke-rag-integration.md`。

## 原则

1. **RAG 是原文事实源**  
   法律法规、技术规范、政策文件和指南的全文保留在腾讯云 RAG 知识库或本地临时检索上下文。图谱、shared export、知识治理 registry、publication bundle 都不得保存 RAG `Content` 或法条/规范全文。

2. **图谱是关系语义和现场经验源**  
   图谱表达“哪个现场问题关联哪条法规/义务/证据/整改路径”。现场经验可以反馈到知识治理层,但只能成为候选,不能自动改写法规或技术规范知识库。

3. **知识治理中层是版本、去重和机器门禁发布编排层**  
   ETO 审核通过并进入图谱的内容,可作为小悦、EcoCheck、EcoCheck 环保体检报告 EcoDoc worker 的主审核来源,发布时不再追加一道人审。知识治理层只做机器门禁:检查 `tier`、`review_status`、`legal_basis_status`、`rag_doc_ref`、条款定位、trace 与红线扫描。只有修改腾讯云 RAG 原文库、删除/替换官方文档、晋级 `candidate/disputed/no_legal_basis` 法律状态,或对外形成正式法律认定时,才需要额外人工确认。

## 回传规则

图谱可以回传以下治理候选:

- 文档去重建议;
- 新旧版本、废止或替代关系;
- 法条/规范定位补全;
- 标准号、别名、标题归一;
- `legal_basis_status` 需要人工复核的法律映射。

图谱不得把以下内容直接写入法规/规范原文知识库:

- 企业现场经验;
- 整改建议;
- 常见问题类型;
- 风险等级判断;
- 专家话术;
- 报告表达。

这些内容如果尚未通过 ETO 入图审核,只能进入 `graph_expert_candidate` 或内部审核 bundle。已经通过 ETO 入图审核的现场经验,可以经机器门禁发布给小悦、EcoCheck 或 EcoCheck 环保体检报告 EcoDoc worker,但不得反写为法规/规范原文知识库事实。

## 后果

- 新增 `KnowledgeDocument`、`KnowledgeGovernanceCandidate`、`PublicationBundle` 三类治理 schema。
- 新增本地离线 CLI `pipeline/knowledge_governance.py`,先从现有 RAG citation report 与图谱 thin refs 生成 registry、candidate queue 和 publication bundle。
- v1 不直接调用腾讯云文档管理 API,不上传、删除或替换知识库文档。
- v1 不直接写 EcoCheck 生产库,消费侧通过 `/api/graph/context` 只读 ETO 已审核图谱上下文,并用 `rag_doc_ref` 调腾讯云 RAG 取法规/规范原文。
- 行为合同见 `specs/features/knowledge-governance-layer.feature`。
