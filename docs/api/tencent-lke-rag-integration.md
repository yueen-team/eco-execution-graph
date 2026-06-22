# 腾讯云 LKE/RAG 接入路径

## 结论

截至 2026-06-15 的项目口径:本项目知识库不接腾讯云智能体开发平台 ADP。知识库召回直接走腾讯云 RAG 套件检索,生成、改写、监管口径检查直接走 TokenHub DeepSeek OpenAI 兼容接口。RAG 操作指南与 API 文档中旧知识库管理/检索接口命名存在变动,因此第一版实现以本机已验证的 `RetrieveKnowledge` TC3 签名调用为准;若控制台 API Inspector 给出新 action,再更新 adapter。

当前推荐路径拆成两段:

1. 腾讯云 RAG 套件知识库检索:使用 `TENCENT_LKE_SECRET_ID` / `TENCENT_LKE_SECRET_KEY` 做 TC3 签名,调用 `RetrieveKnowledge`,取得法规/标准知识库的 citation metadata 与可进入本地上下文的片段。
2. TokenHub DeepSeek OpenAI 兼容层:消费图谱上下文与 RAG 检索结果,用于生成、改写、监管口径检查。DeepSeek 不替代知识库检索;它只负责基于已装配上下文做语言生成。

`lkeap.tencentcloudapi.com` 的 embedding、文档解析、拆分等原子能力仍可用于离线验证或后续增强,但不作为当前知识库接入的必需链路。

## 本地配置

`.env.local` 仅本机使用,不得入库。CloudBase/CI/托管环境注入的 `TENCENT_*` 运行环境变量优先于 `.env.local`,本地文件只作为开发 fallback。

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
```

## Key 分工

| Key | 环境变量 | 用途 |
|---|---|---|
| 腾讯云 SecretId / SecretKey | `TENCENT_LKE_SECRET_ID` / `TENCENT_LKE_SECRET_KEY` | 腾讯云 API 3.0 签名鉴权,例如 embedding smoke 和需要签名的原子能力接口 |
| 知识引擎 API Key | `TENCENT_LKEAP_RAG_API_KEY` | RAG 套件 Bearer Token 预留。当前 verified retrieval path 未使用它,因为 `lkeap.tencentcloudapi.com` 仍要求 TC3 签名 |
| TokenHub DeepSeek API Key | `TENCENT_TOKENHUB_API_KEY` | DeepSeek OpenAI 兼容对话接口,用于根据图谱上下文和 RAG 检索结果生成/改写/检查 |

## API 路线

### 1. RAG 套件知识库

核心调用流程:

- service: `lkeap`
- host: `lkeap.tencentcloudapi.com`
- version: `2024-05-22`
- action: `RetrieveKnowledge`
- region: `ap-guangzhou`

1. 创建或上传知识库文档。
2. 调用 `POST https://lkeap.tencentcloudapi.com/` 检索知识库。
3. 使用 `TENCENT_LKE_SECRET_ID` / `TENCENT_LKE_SECRET_KEY` 做腾讯云 API 3.0 签名鉴权。
4. payload 至少包含 `KnowledgeBaseId`、`Query`、`RetrievalSetting.TopK`。
5. 返回结果包含 `Records` 数组,单条记录至少可见 `Title`、`Content`、`Metadata`。其中 `Content` 只能进入本地 RAG 上下文或报告装配缓存,不得写入图谱节点或 shared 包。
6. 将检索结果标准化为本项目 citation metadata,至少包括知识库 ID、标题、来源类型、页码/片段定位与相关性信息。

### 2. DeepSeek TokenHub 对话

最小调用使用 OpenAI 兼容协议:

- endpoint: `https://tokenhub.tencentmaas.com/v1/chat/completions`
- auth: `Authorization: Bearer ${TENCENT_TOKENHUB_API_KEY}`
- model: `${TENCENT_TOKENHUB_DEEPSEEK_MODEL}`,当前为 `deepseek-v4-flash-202605`

该接口只用于生成/改写/检查。它可以消费本项目装配出的图谱上下文与 RAG 检索结果,但返回文本不得直接写回 approved 图谱。

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
