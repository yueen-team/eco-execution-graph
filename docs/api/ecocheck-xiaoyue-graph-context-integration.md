# EcoCheck / 小悦 / 环保体检报告 EcoDoc worker 图谱上下文对接 v1

## 结论

本接口提供 **ETO 已审核图谱上下文 + 法规/技术规范瘦条款引用**。EcoCheck、小悦、EcoCheck 内部的环保体检报告 EcoDoc worker 可以把它作为生成内容前的图谱侧事实源,再按 `rag_doc_ref` 调腾讯云 RAG 取法规/规范原文。

接口不提供 RAG `Content`、法规全文、技术规范全文、企业原始证据、GPS、照片路径或原始报告片段。

## 调用关系

```
EcoCheck / 小悦 / EcoCheck 环保体检报告 EcoDoc worker
  -> GET /api/graph/context
  -> 读取 graph_context、law_refs、tech_spec_refs、blocked_refs、trace
  -> 按 law_refs/tech_spec_refs 中的 rag_doc_ref 调腾讯云 RAG RetrieveKnowledge
  -> 调用方组装提示词并控制法律表达强度
```

## 我们提供什么

### 1. 图谱上下文接口

```
GET /api/graph/context?node_id=issue:hw:label-incomplete&depth=2
GET /api/graph/context?q=危废标签&depth=2
```

认证复用 graph-api 现有 `/api/` 规则:

- 本地开发未配置 `ECO_GRAPH_API_TOKEN` 时允许;
- 配置 token 后需 `Authorization: Bearer <ECO_GRAPH_API_TOKEN>`;
- 企业微信 session cookie 可沿用现有审核接口会话;
- 生产环境必须配置 token。

### 2. 响应字段

| 字段 | 含义 | 调用方用法 |
|---|---|---|
| `status` | 本次上下文整体状态:`pass/partial/blocked` | `blocked` 不生成确定结论 |
| `approval_basis` | 固定为 `ETO_APPROVED_IN_GRAPH` | 说明内容来自 ETO 已审核入图 |
| `human_review_required` | 固定为 `false` | 消费侧发布不追加一道人审 |
| `machine_gate_status` | 机器门禁状态:`pass/partial/blocked` | 控制是否降级表达 |
| `root_nodes` | 命中的根节点 | 展示/调试 |
| `graph_context.nodes` | 已审核上下文节点 | 生成场景、证据、整改建议 |
| `graph_context.edges` | 已审核上下文边 | 解释关系和 trace |
| `law_refs` | 法规瘦条款引用 | 按 `rag_doc_ref` 取法规原文 |
| `tech_spec_refs` | 技术规范瘦条款引用 | 按 `rag_doc_ref` 取规范原文 |
| `blocked_refs` | 被机器门禁拦截的法规/规范引用 | 不得包装成确定法律依据 |
| `trace` | 本次命中的 node/edge/source ref | 写入日志、报告 trace、问题复盘 |

### 3. 瘦条款字段

`law_refs` 和 `tech_spec_refs` 只给 metadata:

```json
{
  "node_id": "law:swl:art77",
  "node_type": "law_article",
  "title": "固体废物污染环境防治法 第七十七条",
  "rag_doc_ref": "tencent-lke://law/swl/art77",
  "legal_basis_status": "internal_reviewed",
  "source_ref": "src:...",
  "law_name": "固体废物污染环境防治法",
  "article_no": "第七十七条",
  "trace": {
    "node_ids": ["law:swl:art77"],
    "edge_ids": ["edge:..."],
    "source_refs": ["src:..."]
  }
}
```

技术规范引用使用 `standard_no` 代替 `law_name/article_no`。

### 4. 发布包

知识治理层同时生成只读 publication bundle:

| audience | 路径 |
|---|---|
| 小悦 | `data/knowledge-governance/publications/expert_agent.json` |
| EcoCheck | `data/knowledge-governance/publications/ecocheck.json` |
| EcoCheck 环保体检报告 EcoDoc worker | `data/knowledge-governance/publications/ecodoc.json` |
| 内部审核 | `data/knowledge-governance/publications/internal_review.json` |

Graph Context API 当前默认以 `ecocheck.json` 作为 publication gate。若部署方希望小悦或 EcoCheck 环保体检报告 EcoDoc worker 使用独立发布包,可通过环境变量指定:

```
ECO_GRAPH_CONTEXT_PUBLICATION_PATH=data/knowledge-governance/publications/expert_agent.json
ECO_GRAPH_CONTEXT_PUBLICATION_PATH=data/knowledge-governance/publications/ecodoc.json
```

## 我们需要对方提供什么

### EcoCheck 侧

| 需要提供 | 用途 |
|---|---|
| `issue_type` 或 graph `node_id` | 精确匹配图谱上下文 |
| 企业适用行业、产污/危废场景、检查任务类型 | 后续用于更细粒度过滤上下文 |
| 当前报告/检查项的内部 trace id | 将图谱 trace 写回 EcoCheck 日志 |
| 调腾讯云 RAG 的能力或代理服务 | 按 `rag_doc_ref` 取法规/规范原文 |
| 降级表达策略 | `partial/blocked` 时不输出确定法律义务 |

EcoCheck 不需要把企业原始证据、照片、GPS、原始报告全文传给本接口。

### 小悦侧

| 需要提供 | 用途 |
|---|---|
| 用户问题或检索关键词 `q` | 查询图谱上下文 |
| 可选的 `node_id` | 已知问题类型时精确查询 |
| 会话 trace id | 记录本次生成引用了哪些图谱节点/边 |
| RAG 检索返回的引用原文 | 小悦自行组装回答,图谱侧不保存全文 |
| 安全表达规则 | 遇到 `blocked_refs` 或 RAG 失败时降级 |

### EcoCheck 环保体检报告 EcoDoc worker 侧

| 需要提供 | 用途 |
|---|---|
| 报告章节、检查项或问题类型 | 匹配图谱上下文 |
| 报告生成任务 id | 追踪图谱证据链 |
| 需要引用的法律/规范原文片段 | 从 RAG 获取后由报告 AI 使用 |
| 报告表达模板 | 将图谱建议转成体检报告语言 |
| 人工复核入口 | `blocked_refs`、`partial`、RAG 失败时提示复核 |

## 调用方必须遵守

- 不能把 `candidate/disputed/no_legal_basis` 写成确定法律义务。
- `blocked_refs` 只能作为内部复核提示,不能进入正式引用。
- RAG 取文失败时,不能伪造法规/规范原文。
- 图谱返回的是场景关系和瘦条款,不是完整法规库。
- 企业私有证据不得通过本接口上传或回传。

## 建议最小联调

1. 用 `node_id=issue:hw:label-incomplete&depth=2` 调图谱 API。
2. 断言 `machine_gate_status=pass`。
3. 断言至少返回 1 个 `law_refs` 和 1 个 `tech_spec_refs`。
4. 用返回的 `rag_doc_ref` 调腾讯云 RAG。
5. 小悦/EcoCheck/EcoCheck 环保体检报告 EcoDoc worker 生成一段回答或报告段落。
6. 检查输出包含 trace,且没有 RAG `Content` 缓存在图谱侧。
