# 十律 ETO 审核副驾 · 活体 DeepSeek copilot smoke(verify:external 凭证 lane)

> 适用对象:candy 大人 / 维护者。本文件讲清楚这条外部 gate 验什么、不验什么、需要哪些键、怎么跑、怎么判读。
> 关联:`docs/api/eto-review-copilot.md` §8 / §11、`docs/api/tencent-lke-rag-integration.md`、ADR-0012(离线纪律)、ADR-0013(副驾 advisory-only)。

## 1. 它验什么

外部 gate `ETO-REVIEW-COPILOT-LLM-SMOKE` 跑 `graph-api/scripts/copilot-llm-smoke.mjs`,对一条**纯合成、脱敏**的危废候选(`issue:hw:label-incomplete` 口径)+ 真实 demo 图上下文,发起**一次真活体 DeepSeek(TokenHub)语义研判**,端到端确认副驾 LLM 生产路径,并守住四条红线:

1. **私有不进 prompt** —— 候选经脱敏白名单投影(`projectCandidate`),送出前断言不含 private-tier(企业名称快照 / 证据判断标准 / 整改模板 / ETO 审核笔记 / 法条全文 / GPS),命中即 fail-closed 不发送;smoke 再对捕获的 prompt 全文做一道二次扫描确认。
2. **advisory-only** —— LLM 只产结构化异议,findings 不得含审核状态 / 裁决键。
3. **trace 锚定防幻觉** —— 每条 finding 的 `trace.node_ids/edge_ids` 必须落在本次真实 graph context 内的节点 / 边上;越界或虚构法条搭便车的 finding 被 `parseFindings` 斩断。
4. **RAG grounding:有原文则 grounded、无则降级,原文绝不回流** —— LKE 凭证在场时,`buildRagFetch`(`tc3-rag-client.js`,TC3 签名调 `RetrieveKnowledge`)取法条原文,经 `projectCitations` 红线分域后【只进 prompt 的「法条引用」段供研判】,smoke 报告 `grounded=true`;**法条原文绝不进 findings / 报告 / 图**(`stripFindingLawFullText` finding 级守卫剥离任何被 LLM 回贴的原文,逐字 ≥20 字片段亦剥)。缺 LKE 凭证或取文失败 / 脏原文被逐条丢弃 → 降级(缺凭证则 `buildRagFetch` 返回 `null`;取文失败 / 脏原文逐条丢弃则引文无存活法条原文,`ragAvailable=false`),涉法条适用性的语义异议(`law_not_applicable`)降级为「需人工复核法条」,`grounded=false`,绝不据原文硬断。**红线分域**见 §11.4(`docs/api/eto-review-copilot.md`)与 ADR-0014:候选 + 图段禁法条全文;「法条引用」段允许法条原文但禁私有 / 企业 / 坐标;输出闸 + report 恒禁法条全文。

## 2. RAG grounding:LKE 凭证在场行使真 grounding,缺则降级

- **LKE 凭证在场 → 真 grounding**:copilot smoke 注入 `buildRagFetch`(`tc3-rag-client.js`),TC3 签名直连腾讯云 LKE `RetrieveKnowledge` 取**真法条原文**,经 `sanitizeRetrieveRecord`(丢 `Metadata` 企业噪声)+ `projectCitations`(只取本轮已审核来源 `rag_doc_ref ∈ law_refs/tech_spec_refs` 且不在 `blocked_refs`、逐条过 citation 红线)后,**法条原文真进 prompt 的「法条引用」段**供 DeepSeek 研判,smoke 报告 `grounded=true`。这与独立的 `GRAPH-RAG-REAL-SMOKE` gate(Python probe,sanitize 掉 `Content`)仍是两条路:本 gate 验「拿到法条原文后的语义研判 + 原文不回流」,前者验「检索 + 引文元数据安全」。
- **缺 LKE 凭证 / 取文失败 / 脏原文被丢弃 → 降级非阻塞**:`buildRagFetch` 返回 `null`(或引文无存活原文),涉法条适用性的语义异议降级为「需人工复核法条」,`grounded=false`。**降级是合法路径,不是失败**:LKE 永不阻塞本 lane、永不进 `DEFAULT_REQUIRED_GATE_IDS`(守 ADR-0012)。但若 **LKE 凭证在场却 `grounded≠true`**,lane 判 `grounding` 回归(`failed`):凭证在但没取到原文,是接线/代码缺口,不是配置缺口(见 §5 判读)。
- **原文只进 prompt、瞬时、不落盘**:法条原文仅在本次 DeepSeek 请求体里存在,**绝不进 findings / `reports/copilot-llm-smoke.json` / 图谱节点**;`stripFindingLawFullText` 剥离任何被 LLM 回贴的原文(整段模式闸 + ≥20 字逐字内容感知闸)。依据 ADR-0014(法条原文可进 prompt)+ ADR-0003(法条全文不进图,仍守)+ ADR-0012(report 不存原文,仍守)。
- **不进 `verify:all`**:活体调用只在 `verify:external` 凭证 lane;`verify:all` 只跑离线 stub 契约测试(`graph-api/tests/copilot-llm.test.js` / `copilot-llm-smoke.test.js`),绝不触网(守 ADR-0012)。

## 3. `.env.local` 需要的键(只列名,不放值)

| 键 | 必需 | 默认 / 说明 |
|---|---|---|
| `TENCENT_TOKENHUB_API_KEY`(或回退 `TENCENT_LKEAP_API_KEY`) | 是 | TokenHub DeepSeek API key;缺它 → gate 干净 `blocked`(配置缺口),绝不触网。**唯一 HARD 触发 + pass 要件** |
| `TENCENT_TOKENHUB_BASE_URL`(或回退 `TENCENT_LKEAP_BASE_URL`) | 否 | 默认 `https://tokenhub.tencentmaas.com/v1` |
| `TENCENT_TOKENHUB_DEEPSEEK_MODEL`(或回退 `TENCENT_LKEAP_DEEPSEEK_MODEL`) | 否 | 默认 `deepseek-v4-flash-202605` |
| `TENCENT_LKE_SECRET_ID` | 否(启用 grounding) | 腾讯云 LKE TC3 签名 SecretId。**三键齐 = ENABLE 真 RAG grounding**(法条原文进 prompt) |
| `TENCENT_LKE_SECRET_KEY` | 否(启用 grounding) | 腾讯云 LKE TC3 签名 SecretKey |
| `TENCENT_LKE_KNOWLEDGE_BASE_IDS` | 否(启用 grounding) | 逗号分隔知识库 id;空则 `buildRagFetch` 返回 `null`(降级) |
| `TENCENT_LKE_REGION` | 否 | 默认 `ap-guangzhou` |

> **三键齐(SecretId + SecretKey + KnowledgeBaseIds)= 启用 grounding**:smoke 行使真 RAG 取文、报告 `grounded=true`。**缺任一 → grounding 降级(非 blocked)**:smoke 仍按 TokenHub 端到端跑、`grounded=false`,gate 不因此变红。LKE 永不阻塞本 lane、永不进 `DEFAULT_REQUIRED_GATE_IDS`(守 ADR-0012)。
> ⚠️ **但 LKE 凭证在场却 `grounded≠true` → lane 判 `grounding` 回归(`failed`)**:凭证在但没取到原文是接线/代码缺口,不是配置缺口(见 §5)。
> `run_command` 不把 env 传给子进程,故 node smoke **自加载 `.env.local`**(叠加 `process.env`,不覆盖已存在的 `process.env`);grounding 凭证与 TokenHub key 同源自加载。

## 4. 命令

```powershell
# 让 copilot gate 成为阻塞 gate(否则它 report-only、不驱动 lane 状态):
$env:GRAPH_EXTERNAL_REQUIRED_GATES = "ETO-REVIEW-COPILOT-LLM-SMOKE"   # 或 "all"
pnpm verify:external
```

- 只想单独跑 runner、生成报告(不经 lane):`pnpm --dir graph-api smoke:copilot-llm`。
- **触网条件**:只要 `.env.local`/环境里 TokenHub 凭证在场,**每次** `pnpm verify:external` 都会发起一次活体 DeepSeek 调用(report-only 也调,只是不驱动 lane 状态)。`GRAPH_EXTERNAL_REQUIRED_GATES` 只决定 blocked/failed 是否**阻塞 lane**,不决定是否触网。无凭证则永不触网(fail-closed)。
- **退出码 vs 颜色**:`blocked` 表示配置缺口(非代码回归),但 lane 仍**退非零**,`verify:external` 会显示红色 `VERIFY FAILED`(verify.ps1 据退出码判级)。**别被红字吓到**——读 `reports/external-verification-lane.json` 里 gate 的 `status` 区分 `blocked`(配置缺口)与 `failed`(真红线被破/调用异常)。

## 5. 产物与判读

| 产物 | 内容 |
|---|---|
| `reports/copilot-llm-smoke.json` | 脱敏 smoke 报告:`status` / `advisory_only` / `model` / `finding_count` / `codes[]` / `grounded`(法条原文是否真进 prompt)/ `rag_available` / `degraded` / `prompt_redline_clean` / `trace_anchored` / `checked_at`。**绝不**含候选正文 / 法条原文 / 企业数据 / 任何 `FORBIDDEN_PAYLOAD_KEYS`。 |
| `reports/external-verification-lane.json` | lane 汇总(完整):gate `ETO-REVIEW-COPILOT-LLM-SMOKE` 的 `status` + `smoke_status` + `forbidden_payload_key_count` + `grounding_configured`(布尔)+ `grounding_env_names`(3 个 LKE **名,不带值**)+ `grounded` + `grounding`(分域结论)+ `private_tier_boundary`。 |
| `reports/external-verification-lane.md` | lane 汇总(精简):gate 表只渲染 `gate_id \| status \| reason`;grounding 字段只在 `.json`;preflight 段渲染可选 `lke_rag_grounding` 就绪组(`configured` 布尔 + 仅环境名)。 |

判读(`status`):

| smoke `status` | lane gate `status` | 含义 |
|---|---|---|
| `pass` | `pass` | 活体研判成功且四条红线干净(prompt 脱敏、advisory、trace 锚定、RAG grounding/降级)。 |
| `blocked` | `blocked` | 无 TokenHub 凭证(配置缺口),绝未触网。**不是**代码回归。 |
| `failed` | `failed` | 红线被破(prompt 泄漏 / 越界 trace / 审核状态出现)、调用异常(网络 / 超时 / 解析),或 **grounding 回归**(LKE 在场却 `grounded≠true`);报告 `reason` / `error`(已脱敏)给原因。 |

判读(`grounding` 分域结论,只决定 copilot gate、**永不阻塞默认 lane**):

| LKE 三键 | `grounded` | gate `grounding` | gate `status` | 含义 |
|---|---|---|---|---|
| 全在场 | `true` | `grounded` | 随 smoke(`pass`/`failed`) | 真 grounding 生效:法条原文进 prompt、研判完成、原文未回流。 |
| 全在场 | 非 `true` | `regression_lke_present_not_grounded` | `failed` | **grounding 回归**:凭证在但没取到原文(接线/代码缺口),即便 smoke 自身 `pass` 也判 `failed`。 |
| 缺任一 | `null`/`false` | `degraded_no_lke_creds` | 随 smoke(可 `pass`) | 合法降级:无 grounding 凭证,涉法条语义异议退为需人工复核。**不翻红**。 |

> smoke 自身**不因 findings 多寡失败**(0 条异议也可 `pass`);只在红线被破或调用异常时 `failed`。runner 始终 `exit 0`,由 lane 据报告判级。
> lane 侧若 `find_forbidden_payload_keys(report)` 命中(报告里出现法条原文 / 企业 / 私有判断键),gate 直接判 `failed`(脱敏边界纵深第二道)。
> **grounded vs degraded 一句话**:`grounded=true` 是「拿到真原文研判」;`degraded`(`grounded=false` + 无 LKE)是「没原文、降级为需人工复核」——两者都可 `pass`;**只有「有 LKE 却没 grounded」才是回归 `failed`**。LKE 永不进 `DEFAULT_REQUIRED_GATE_IDS`,故这条回归只在算子用 `GRAPH_EXTERNAL_REQUIRED_GATES` 显式要求 copilot gate 时才阻塞那条 external lane,绝不拖红 `verify:all` 或默认 lane。
