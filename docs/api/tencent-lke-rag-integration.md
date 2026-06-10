# 腾讯云 LKE/RAG 接入路径

## 结论

截至 2026-06-10 的官方文档核对结果:腾讯云知识引擎原子能力的 RAG 文档存在割裂。RAG 操作指南仍描述 `CreateKnowledgeBase`/`SearchKnowledge` 这样的直检索流程,但 API 文档搜索与更新历史中旧的知识库管理/检索接口并不稳定,部分接口在 2026-05-20 的发布中被删除或迁移。因此本项目不要把第一版实现绑定到旧的 `RetrieveKnowledge`/`ListDocs`/`DescribeDoc` 直连 `KnowledgeBaseId` 接口。

当前推荐路径拆成两层:

1. `lkeap.tencentcloudapi.com` 原子能力层:用于 embedding、文档解析、拆分、模型对话等基础能力。它适合做本项目的法规文本向量化、候选召回、离线验证。
2. 腾讯云智能体开发平台应用层:把知识库挂到已发布应用,通过对话端接口调用。优先评估新版 WebSocket V2;HTTP SSE 旧版文档已标明停止更新并将在 2026-12-31 下线,只能作为过渡参考。RAG 命中的文档/问答/知识图谱引用从对话事件里的 `References`、`DocRefer`、`QaRefer`、`GraphRAGRefer` 解析回来。
3. 直连知识库检索层:只有在腾讯云控制台 API Inspector 能对这两个知识库 ID 生成当前可用请求后,才作为独立 adapter 接入。接入前不得假定 `KnowledgeBaseId` 直检索接口仍可用。

## 本地配置

`.env.local` 仅本机使用,不得入库。

```env
TENCENT_LKE_SECRET_ID=...
TENCENT_LKE_SECRET_KEY=...
TENCENT_LKE_REGION=ap-guangzhou
TENCENT_LKE_KNOWLEDGE_BASE_IDS=2036306946025328640,2012806427613073408

# 发布智能体应用后再填
TENCENT_ADP_BOT_APP_KEY=...
TENCENT_ADP_VISITOR_BIZ_ID=eco-execution-graph-local-dev
```

## API 路线

### 1. 原子能力连通

最小健康检查使用 `GetEmbedding`:

- service: `lkeap`
- host: `lkeap.tencentcloudapi.com`
- version: `2024-05-22`
- action: `GetEmbedding`
- region: `ap-guangzhou`

本项目的 `pipeline/tencent_lke_probe.py embedding` 会自动处理本机时间偏移导致的 `AuthFailure.SignatureExpire`。

### 2. 知识库 RAG 对话

知识库内容检索优先在腾讯云智能体开发平台里建立并发布一个应用,把共享知识库 ID 绑定到该应用的知识问答配置中。

运行时流程:

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

- 仅凭两个知识库 ID 不能直接检索;还需要发布后的 `BotAppKey`。
- 如果腾讯云控制台 API Inspector 能生成有效的 `SearchKnowledge` 或等价直检索请求,再将它作为第二 adapter 实装。
- 如果 Windows 本机时间不可更改,签名层必须使用服务端时间偏移重试,不得要求用户修改系统时间。
