# ADR-0013 ETO 审核副驾「十律」:advisory-only,不做裁决者

- Status: Proposed(待 candy 批准 + 落地)
- Date: 2026-06-28
- 配套:`docs/api/eto-review-copilot.md`、`specs/features/eto-review-copilot.feature`
- 关联:ADR-0002(三层授权)、ADR-0005(成效定权)、ADR-0006(暂不上图数据库)、ADR-0011(知识治理层)、ADR-0012(RAG 外部 cutover)

## Context

P1 危废精品切片已交付并上线,ETO 即将入驻"现场经验入图审核台"做切片审核。当前审核台(`graph-ui/src/review.js`)的三维判断信号(信源可信/归类就绪/字段就绪)是**确定性规则**——数证据条数、查闭环标志位——读不懂内容语义,catch 不了"信息错配"(问题类型错配、法条错引/沿革过期、管理经验被法律化、证据-结论不匹配、个案误入聚合等)。

人类 ETO 认知有限,无法在审核时实时持有全法条语料+沿革、跨 100 家企业的模式、踩雷点全史、每个问题类型的证据应有项。项目已具备所需全部零件:`buildGraphContextResponse`(纯函数,已审核邻域+降级门禁)、`buildPitfallBatch`(跨企业聚合)、`assertRedlineClean`(红线扫描)、腾讯云 RAG(真实 smoke 已绿)、TokenHub DeepSeek、监管口径一致性检查器(规则种子)。缺的是把它们编排成"审核时刻"的副驾,且不破坏离线验证纪律与私有层红线。

引入大模型进入入图审核链路是架构上不可轻易反转的决策,故立此 ADR。

## Decision

1. **副驾是 advisory-only,永不裁决。** 副驾产出"补足上下文 + 异议清单",ETO 是唯一裁决者。副驾的建议方向可为 `null`。副驾不得自动改变审核状态,不得自动晋级 CANDIDATE(守 AGENTS.md 硬门禁 #4)。

2. **上游守门人定位,区别于小悦。** 副驾守图的入口(决定什么进图);小悦消费已审核图(下游)。两者是两个身份、两种风险等级,守门人更保守。

3. **确定性 backbone + LLM critic 混合,可降级。** 大部分错配检测用确定性规则(离线、可 `verify:all`);LLM 只补"必须读懂语义"的错配。LLM/RAG 不可用时 **fail-closed**:退化到 backbone,标 `门禁=partial` 并写降级说明,副驾不沉默、不中断审核台。

4. **不新增图基建。** 复用 `buildGraphContextResponse` 在进程内检索,守 ADR-0006(暂不上图数据库)。

5. **trace-required,法条不幻觉。** 每条异议必带 trace;LLM 异议的 trace 必须落在本次 graph context 内真实存在的法条节点,否则丢弃;法条全文只从 RAG 取。

6. **降级是机器门禁,不是提示词。** 表达强度由 `machine_gate_status` / `legal_basis_status` / `blocked_refs` 强制控制,与 `graph-context.js` 同一口径,继承 `regulatory-consistency-checker.md` 风险码。

7. **分歧即资产。** "副驾建议 vs ETO 终判"落成 `ai_review_delta` 治理候选,默认 `review_status=candidate`,人工晋级,与 ESO↔ETO delta 同构(呼应 ADR-0005 成效定权)。

8. **离线纪律不破。** `verify:all` 不依赖任何腾讯云密钥;LLM 段只在 `verify:external` 凭证 lane(承接 ADR-0012),`copilot-llm.js` 的网络路径通过依赖注入,缺失即 fail-closed。

## Consequences

**正向:**
- ETO 审核更快更准,漏判/误判风险下降;图的入口质量提升 → 下游所有消费方受益。
- 给"AI 行家"主任的演示从"有个图谱"升级为"有个受约束、可追溯、把人放裁决位、还会跟顶尖 ETO 学习的专家系统"。
- 一致率曲线把每天的蒸馏流量化成可演示的复利智能资产。

**代价/风险:**
- 副驾的 DeepSeek 调用把脱敏候选发到外部(腾讯云 TokenHub),需 candy 明确数据治理边界(私有判断标准是否进提示词,默认否)。
- 自动化偏见:ETO 可能盲信副驾。缓解:异议而非答案的呈现、确定性证据并排不被盖、采纳/驳回摩擦、delta 捕获。
- 维护成本:错配分类法与降级口径需随法规/口径演进维护。

## Alternatives Considered

- **纯 LLM 问答助手**:被否。读不出领域错配、易幻觉法条、破坏离线纪律、把 ETO 推向旁观者,与"法律可信"定位冲突。
- **纯规则,不引入 LLM**:可覆盖多数错配,但 1/3/6/7(语义匹配类)无法做。采用为 **P0 backbone**,LLM 作为 P1 增量,二者可独立降级。
- **复用小悦**:被否。小悦是下游消费身份,风险模型与上游守门人不同,合并会污染两边口径。

## Resolved(candy,2026-06-28)

- Q1 私有判断标准入外部 LLM:**否**,prompt 不含 private-tier。
- Q2 命名:**十律**(上游守门人,与下游"小悦"分两个身份;取义于十条审核律)。
- Q3 LLM 触发:**ETO 手动**。
- Q4 一致率指标进政府演示:**是**。

## Rollback

副驾全程旁路:停用 `POST /copilot` 端点与详情 `副驾研判` 字段,审核台回退到现有三信号,不影响入图/聚合/导出任何既有链路。LLM 段单独可关(移除 `verify:external` 的 gate),确定性 backbone 可独立保留。不得为迁就副驾削弱 schema、私有零泄漏、监管口径检查任何既有红线。
