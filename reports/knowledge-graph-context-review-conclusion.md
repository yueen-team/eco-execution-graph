# 图谱上下文与知识治理接口审核结论

- 日期:2026-06-15
- 审核对象:`/api/graph/context`、知识治理 publication bundle、相关 schema/spec/doc
- 结论状态:待 candy/ETO 审核

## 建议审核结论

可以进入 EcoCheck、小悦、EcoCheck 环保体检报告 EcoDoc worker 的联调准备阶段。

理由:

- 接口只读,不写腾讯云 RAG 知识库,不写 EcoCheck 生产库。
- ETO 审核进图是消费侧主审核,接口发布不追加一道人审,只做机器门禁。
- 返回的是已审核图谱上下文和法规/技术规范瘦条款,不返回法规全文、规范全文或 RAG `Content`。
- `blocked_refs` 会拦截未发布、定位不足、法律依据状态不确定、缺 `rag_doc_ref`、缺条款号/标准号的引用。
- private source、企业私有证据、GPS、照片路径、原始报告片段、token 等红线字段会被过滤或阻断。

## 已实现范围

| 项 | 结论 |
|---|---|
| 图谱上下文 API | 已实现 `GET /api/graph/context` |
| 消费方 | 小悦、EcoCheck、EcoCheck 环保体检报告 EcoDoc worker |
| 认证 | 复用 graph-api `/api/` Bearer/session 认证 |
| 审核口径 | `approval_basis=ETO_APPROVED_IN_GRAPH`, `human_review_required=false` |
| 机器门禁 | tier、review_status、legal_basis_status、rag_doc_ref、locator、publication allowlist、redline scan |
| RAG 边界 | 只返回 `rag_doc_ref`,不返回 RAG `Content` |
| 发布包 | `expert_agent`、`ecocheck`、`ecodoc`、`internal_review` |
| 生产写入 | v1 不写腾讯云知识库、不写 EcoCheck 生产库 |

## 审核重点

请重点审核以下业务口径是否认可:

1. ETO 审核进图后,小悦/EcoCheck/EcoCheck 环保体检报告 EcoDoc worker 消费时不再追加一道人审。
2. 机器门禁失败的法规/规范引用进入 `blocked_refs`,调用方不得包装成确定法律依据。
3. 图谱只负责“匹配哪条瘦条款、为什么匹配、现场经验如何解释”,全文仍由腾讯云 RAG 按 `rag_doc_ref` 获取。
4. `ecodoc` 是 EcoCheck 环保体检报告 worker 的内部实现口径,不是独立于 EcoCheck 的第三个产品消费方。
5. v1 只做只读联调,不做腾讯云 RAG 文档管理 API 的上传、删除、替换。

## 验证证据

已通过:

```
python pipeline\knowledge_governance.py all --check
python -m unittest tests.test_knowledge_governance
pnpm --dir graph-api check
pnpm --dir graph-api test
pnpm bdd:export
```

真实数据 smoke:

```
GET /api/graph/context?node_id=issue:hw:label-incomplete&depth=2
```

观察结果:

- `status=pass`
- `machine_gate_status=pass`
- `root_nodes=1`
- `graph_context.nodes=14`
- `graph_context.edges=27`
- `law_refs=1`
- `tech_spec_refs=1`
- `blocked_refs=0`

知识治理输出:

- registry documents:210
- governance candidates:33
- publication bundles:4
- public items:183
- public blocked items:27

## 已知未完成

- 尚未与 EcoCheck、小悦、EcoCheck 环保体检报告 EcoDoc worker 做真实端到端联调。
- 腾讯云 RAG 文档管理 API 仍未接入;v1 不上传、删除、替换 RAG 文档。
- `pnpm verify:all` 当前受 P2/P3 卡片旧测试口径影响,失败点不在本接口,但全仓发版前需要单独收口。

## 审核通过后的对接动作

1. EcoCheck 选择按 `node_id` 还是 `q` 查询图谱上下文。
2. 小悦确认 prompt 装配方式:先图谱、再 RAG、再生成。
3. EcoCheck 环保体检报告 EcoDoc worker 确认报告章节与 issue_type/node_id 的映射。
4. 三方共同确认 `blocked_refs` 的降级表达模板。
5. 联调用例先从 `issue:hw:label-incomplete` 开始。
