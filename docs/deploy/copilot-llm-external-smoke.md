# 十律 ETO 审核副驾 · 活体 DeepSeek copilot smoke(verify:external 凭证 lane)

> 适用对象:candy 大人 / 维护者。本文件讲清楚这条外部 gate 验什么、不验什么、需要哪些键、怎么跑、怎么判读。
> 关联:`docs/api/eto-review-copilot.md` §8 / §11、`docs/api/tencent-lke-rag-integration.md`、ADR-0012(离线纪律)、ADR-0013(副驾 advisory-only)。

## 1. 它验什么

外部 gate `ETO-REVIEW-COPILOT-LLM-SMOKE` 跑 `graph-api/scripts/copilot-llm-smoke.mjs`,对一条**纯合成、脱敏**的危废候选(`issue:hw:label-incomplete` 口径)+ 真实 demo 图上下文,发起**一次真活体 DeepSeek(TokenHub)语义研判**,端到端确认副驾 LLM 生产路径,并守住四条红线:

1. **私有不进 prompt** —— 候选经脱敏白名单投影(`projectCandidate`),送出前断言不含 private-tier(企业名称快照 / 证据判断标准 / 整改模板 / ETO 审核笔记 / 法条全文 / GPS),命中即 fail-closed 不发送;smoke 再对捕获的 prompt 全文做一道二次扫描确认。
2. **advisory-only** —— LLM 只产结构化异议,findings 不得含审核状态 / 裁决键。
3. **trace 锚定防幻觉** —— 每条 finding 的 `trace.node_ids/edge_ids` 必须落在本次真实 graph context 内的节点 / 边上;越界或虚构法条搭便车的 finding 被 `parseFindings` 斩断。
4. **RAG 无原文降级不伪造** —— JS 侧不带 RAG 客户端(`ragFetch=null`,即 as-built 生产路径),涉法条适用性的语义异议(`law_not_applicable`)降级为「需人工复核法条」,绝不据原文硬断。

## 2. 它**不**验什么(已知边界,列为后续增强)

- **不验真实 RAG 取文**:copilot smoke 的 RAG 降级**纯由 JS 侧 `ragFetch=null` 造成**(graph-api 没有 RAG 客户端),与独立的 `GRAPH-RAG-REAL-SMOKE` gate 的 Python probe(它 sanitize 掉 `Content`)是两条路、互不调用。as-built 生产即这条「RAG 降级」路径,smoke 验证的就是它,不是「拿到法条原文后的语义判断」。补真 RAG grounding 是后续增强(需 JS 侧 RAG 客户端或 sanitized 元数据回灌)。
- **不进 `verify:all`**:活体调用只在 `verify:external` 凭证 lane;`verify:all` 只跑离线 stub 契约测试(`graph-api/tests/copilot-llm-smoke.test.js`),绝不触网(守 ADR-0012)。

## 3. `.env.local` 需要的键(只列名,不放值)

| 键 | 必需 | 默认 / 说明 |
|---|---|---|
| `TENCENT_TOKENHUB_API_KEY`(或回退 `TENCENT_LKEAP_API_KEY`) | 是 | TokenHub DeepSeek API key;缺它 → gate 干净 `blocked`(配置缺口),绝不触网 |
| `TENCENT_TOKENHUB_BASE_URL`(或回退 `TENCENT_LKEAP_BASE_URL`) | 否 | 默认 `https://tokenhub.tencentmaas.com/v1` |
| `TENCENT_TOKENHUB_DEEPSEEK_MODEL`(或回退 `TENCENT_LKEAP_DEEPSEEK_MODEL`) | 否 | 默认 `deepseek-v4-flash-202605` |

> RAG 真取文未接,故本 smoke **不需要** `TENCENT_LKE_SECRET_ID/SECRET_KEY/KNOWLEDGE_BASE_IDS`(那是默认 `GRAPH-RAG-REAL-SMOKE` gate 的键)。
> `run_command` 不把 env 传给子进程,故 node smoke **自加载 `.env.local`**(叠加 `process.env`,不覆盖已存在的 `process.env`)。

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
| `reports/copilot-llm-smoke.json` | 脱敏 smoke 报告:`status` / `advisory_only` / `model` / `finding_count` / `codes[]` / `rag_available` / `degraded` / `prompt_redline_clean` / `trace_anchored` / `checked_at`。**绝不**含候选正文 / 法条原文 / 企业数据 / 任何 `FORBIDDEN_PAYLOAD_KEYS`。 |
| `reports/external-verification-lane.json` | lane 汇总(完整):gate `ETO-REVIEW-COPILOT-LLM-SMOKE` 的 `status` + `smoke_status` + `forbidden_payload_key_count` + `private_tier_boundary`。 |
| `reports/external-verification-lane.md` | lane 汇总(精简):gate 表只渲染 `gate_id \| status \| reason`;上面三个字段只在 `.json`。 |

判读:

| smoke `status` | lane gate `status` | 含义 |
|---|---|---|
| `pass` | `pass` | 活体研判成功且四条红线干净(prompt 脱敏、advisory、trace 锚定、RAG 降级)。 |
| `blocked` | `blocked` | 无 TokenHub 凭证(配置缺口),绝未触网。**不是**代码回归。 |
| `failed` | `failed` | 红线被破(prompt 泄漏 / 越界 trace / 审核状态出现)或调用异常(网络 / 超时 / 解析);报告 `reason` / `error`(已脱敏)给原因。 |

> smoke 自身**不因 findings 多寡失败**(0 条异议也可 `pass`);只在红线被破或调用异常时 `failed`。runner 始终 `exit 0`,由 lane 据报告判级。
> lane 侧若 `find_forbidden_payload_keys(report)` 命中(报告里出现法条原文 / 企业 / 私有判断键),gate 直接判 `failed`(脱敏边界纵深第二道)。
