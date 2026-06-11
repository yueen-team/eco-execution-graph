# 腾讯云 LKE/RAG 接入路径

## 结论

截至 2026-06-10 的官方文档核对结果:腾讯云知识引擎原子能力的 RAG 文档存在割裂。RAG 操作指南仍描述 `CreateKnowledgeBase`/`SearchKnowledge` 这样的直检索流程,但 API 文档搜索与更新历史中旧的知识库管理/检索接口并不稳定,部分接口在 2026-05-20 的发布中被删除或迁移。因此本项目不要把第一版实现绑定到旧的 `RetrieveKnowledge`/`ListDocs`/`DescribeDoc` 直连 `KnowledgeBaseId` 接口。

当前推荐路径拆成三层:

1. `lkeap.tencentcloudapi.com` 原子能力层:用于 embedding、文档解析、拆分、模型对话等基础能力。它适合做本项目的法规文本向量化、候选召回、离线验证。
2. RAG 套件知识库层:使用腾讯云 `SecretId/SecretKey` 签名调用 `RetrieveKnowledge`,负责知识库 RAG 召回。Bearer 直连 `lkeap.tencentcloudapi.com` 在本机 smoke 中被 API 3.0 网关拒绝,暂不作为本项目默认路径。
3. TokenHub DeepSeek OpenAI 兼容层:用于上下文装配后的生成、改写、监管口径检查。它只负责模型调用,不等同于知识库检索。
4. 腾讯云智能体开发平台应用层:仅作为备选路径。若原子能力知识库无法直接返回 citation metadata,再评估应用层对话事件里的 `References`、`DocRefer`、`QaRefer`、`GraphRAGRefer`。

## 本地配置

`.env.local` 仅本机使用,不得入库。

```env
TENCENT_LKE_SECRET_ID=...
TENCENT_LKE_SECRET_KEY=...
TENCENT_LKE_REGION=ap-guangzhou
TENCENT_LKE_KNOWLEDGE_BASE_IDS=2036306946025328640,2012806427613073408
TENCENT_LKEAP_RAG_API_KEY=...

# TokenHub DeepSeek OpenAI 兼容接口,用于上下文装配后的生成/改写/检查
TENCENT_TOKENHUB_API_KEY=...
TENCENT_TOKENHUB_BASE_URL=https://tokenhub.tencentmaas.com/v1
TENCENT_TOKENHUB_DEEPSEEK_MODEL=deepseek-v4-flash-202605

# 发布智能体应用后再填
TENCENT_ADP_BOT_APP_KEY=...
TENCENT_ADP_VISITOR_BIZ_ID=eco-execution-graph-local-dev
```

## Key 分工

| Key | 环境变量 | 用途 |
|---|---|---|
| 腾讯云 SecretId / SecretKey | `TENCENT_LKE_SECRET_ID` / `TENCENT_LKE_SECRET_KEY` | 腾讯云 API 3.0 签名鉴权,例如 embedding smoke 和需要签名的原子能力接口 |
| 知识引擎 API Key | `TENCENT_LKEAP_RAG_API_KEY` | RAG 套件 Bearer Token 预留。当前 verified retrieval path 未使用它,因为 `lkeap.tencentcloudapi.com` 仍要求 TC3 签名 |
| TokenHub DeepSeek API Key | `TENCENT_TOKENHUB_API_KEY` | DeepSeek OpenAI 兼容对话接口,用于根据图谱上下文和 RAG 检索结果生成/改写/检查 |

## API 路线

### 1. 原子能力连通

最小健康检查使用 `GetEmbedding`:

- service: `lkeap`
- host: `lkeap.tencentcloudapi.com`
- version: `2024-05-22`
- action: `GetEmbedding`
- region: `ap-guangzhou`

本项目的 `pipeline/tencent_lke_probe.py embedding` 会自动处理本机时间偏移导致的 `AuthFailure.SignatureExpire`。

### 2. RAG 套件知识库

核心调用流程:

1. 创建或上传知识库文档。
2. 调用 `POST https://lkeap.tencentcloudapi.com/` 检索知识库。
3. 使用 `TENCENT_LKE_SECRET_ID` / `TENCENT_LKE_SECRET_KEY` 做腾讯云 API 3.0 签名鉴权。
4. 当前已验证的 action 为 `RetrieveKnowledge`,payload 至少包含 `KnowledgeBaseId`、`Query`、`RetrievalSetting.TopK`。
5. 返回结果包含 `Records` 数组,单条记录至少可见 `Title`、`Content`、`Metadata`。其中 `Content` 只能进入本地 RAG 上下文或报告装配缓存,不得写入图谱节点或 shared 包。
6. 将检索结果标准化为本项目 citation metadata,至少包括知识库 ID、标题、来源类型、页码/片段定位与相关性信息。

### 3. DeepSeek TokenHub 对话

最小调用使用 OpenAI 兼容协议:

- endpoint: `https://tokenhub.tencentmaas.com/v1/chat/completions`
- auth: `Authorization: Bearer ${TENCENT_TOKENHUB_API_KEY}`
- model: `${TENCENT_TOKENHUB_DEEPSEEK_MODEL}`,当前为 `deepseek-v4-flash-202605`

该接口只用于生成/改写/检查。它可以消费本项目装配出的图谱上下文与 RAG 检索结果,但返回文本不得直接写回 approved 图谱。

### 4. 智能体应用备选路径

若直检索暂不可用,备选运行时流程为智能体应用层:

1. 使用 SecretId/SecretKey 调 `GetWsToken`。
2. 使用返回的 token 连接 `wss://wss.lke.cloud.tencent.com/adp/v2/chat/conn/?language=zh-CN&EIO=4&transport=websocket`。
3. 发送 `request` 事件,携带 `RequestId`、`ConversationId`、`Contents`。
4. 从 `message.added`/`content.added`/`reference` 相关事件中抽取 `References`。
5. 将 `DocRefer.KnowledgeId`、`QaRefer.KnowledgeId`、`GraphRAGRefer.KnowledgeId` 与本项目的 `law_article.rag_doc_ref`/`lineage_ref` 建立只读引用。

## 授权红线

- 法条全文仍不进入图谱节点。
- 腾讯云返回的原文片段只进入 RAG 引文响应或报告装配上下文,不得写入 shared 图谱包。
- `KnowledgeId` 是外部知识库业务 ID,不是本项目 node_id。
- 任何 `candidate`/`internal_reviewed` 法规口径不得因为 RAG 有返回而自动晋级 `official_confirmed`。

## 已知限制

- TokenHub DeepSeek 对话接口不自动等于知识库 citation retrieval。
- RAG 套件知识库召回结果必须先进入 citation metadata 标准化,不得把原文全文写入 graph 节点或 shared 包。
- 腾讯云 RAG 网页操作指南仍提 `SearchKnowledge`,但当前 API PDF 的更新历史显示旧知识库管理/检索接口经历过删除/迁移。本项目本机 smoke 已验证 `RetrieveKnowledge` 可通过 TC3 签名返回 `Records`;如控制台 API Inspector 给出新 action,以 Inspector 为准更新 adapter。
- 如果 Windows 本机时间不可更改,签名层必须使用服务端时间偏移重试,不得要求用户修改系统时间。
