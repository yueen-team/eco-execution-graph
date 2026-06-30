# ETO 审核副驾「十律」(图谱副驾驶)· 规划架构 v0.1

> 状态:草案,待 candy 批准(配套 ADR-0013、`specs/features/eto-review-copilot.feature`)。
> 阅读顺序:本文件 → `docs/adr/0013-eto-review-copilot-advisory-not-decider.md` → `specs/features/eto-review-copilot.feature`。
> 配套既有契约:`docs/api/regulatory-consistency-checker.md`、`docs/api/context-assembly-api.md`、`docs/api/knowledge-governance-layer.md`、`docs/api/tencent-lke-rag-integration.md`。

## 1. 定位

ETO 审核副驾(代号「**十律**」)是坐在"现场经验入图审核台"里的 **错配检测器 + 异议引擎**。它在 ETO 对每条候选切片下结论之前,把超出单人记忆的上下文铺齐(**补足**),并主动指出候选里的信息错配(**纠正**)。

它的本质不是问答机:

| 它是 | 它不是 |
|---|---|
| **上游守门人**:帮 ETO 决定什么能进图 | 下游答题机(小悦那种消费已审核图) |
| **异议引擎**:主动挑刺,降低漏判/误判 | 自动裁决器:它永不替 ETO 做结论 |
| **私有运行层资产**:判断力留在 internal runtime | 共有交付物:判断力不进 shared 包 |

> **与小悦的边界**:小悦消费 `/api/graph/context` 的**已审核**图谱去帮 EcoCheck/写报告(下游)。副驾守的是**图的入口**(上游)。守门人必须比消费者更保守。副驾守住入口 → 下游所有消费方(小悦、EcoCheck、EcoDoc、共有包、政府执法工具)一起变好,这是杠杆。

## 2. 它复用了什么(不新增图基建)

副驾不引入新框架、不引入图数据库(守 ADR-0006),完全由现有件编排:

| 能力 | 复用的现有件 | 作用 |
|---|---|---|
| 检索已审核邻域 + 法条瘦引用 + 降级门禁 | `graph-api/src/graph-context.js` → `buildGraphContextResponse`(纯函数) | 副驾"补足"的上下文源;自带 tier 安全、`machine_gate_status`、`blocked_refs` |
| 跨企业模式统计 | `graph-api/src/review-store.js` → `buildPitfallBatch` 的分组逻辑 | 副驾"跨企业分布"补足;≥5 家聚合口径一致 |
| 红线零泄漏扫描 | `graph-context.js` → `assertRedlineClean` / `review-store.js` → `scanForbidden` | 副驾输出复用同一道闸 |
| 规则型错配检测种子 | `pipeline/regulatory_consistency_check.py` + `docs/api/regulatory-consistency-checker.md` | 把"事后查报告文本"前移成"审核时查切片" |
| 法条原文 | `pipeline/rag_resolve.py` / `rag_client.py`(腾讯云 LKE RetrieveKnowledge,真实 smoke 已绿) | LLM critic 读真原文,不靠记忆 |
| 语言生成/研判 | TokenHub DeepSeek(`docs/api/tencent-lke-rag-integration.md`) | LLM critic 的语义判断;只产结构化 findings |
| 审核台 UI 与判断信号 | `graph-ui/src/review.js` → `reviewSignals` / `recommendedKind` / `renderDetail` | 副驾的呈现层在其上扩展,不重写 |

## 3. 四条铁律(设计约束,任何实现不得违反)

1. **副驾不裁决,只提异议。** ETO 永远是裁决者(沿用 `review.js` 既有哲学:规则不够明确 `recommendedKind` 就返回 `null`)。副驾的"建议方向"可以为 `null`。
2. **开口必带 trace,否则闭嘴。** 每条异议必须挂 `node_ids / edge_ids / source_refs`;引不出 trace 的法条,副驾只能说"无依据,按管理建议处理",不得写"违反/依据"。
3. **降级是机器门禁,不是提示词。** RAG 失败 / `legal_basis_status ∈ {candidate, disputed, no_legal_basis}` / `blocked_refs` 非空时,表达强度由 `machine_gate_status` 强制降级,与 `graph-context.js` 同一套口径。
4. **分歧即资产。** ETO 否决副驾的每一次,落成一条 `ai_review_delta` 治理候选,与 ESO↔ETO delta 同构(见 §9)。

## 4. 信息错配分类法(纠正能力的硬核)

这是副驾区别于"通用 NLP 助手"的领域护城河。每类都锚定项目里真实存在的字段/边,并标注靠规则还是 LLM 检出——**大部分能用规则离线检出,LLM 只补"必须读懂语义"的部分**,这对守住 `verify:all` 离线纪律至关重要。

> 副驾代号**十律**即取义于这十条审核律——守住这十条,图的入口就守住了。后续若新增检查,作为某一律的子规则归并,保持"十律"为稳定的口径骨架,不轻易扩成第十一律。

| # | 错配码 | 典型例子 | 锚定字段/边 | 检出 | 严重度 |
|---|---|---|---|---|---|
| 1 | `issue_type_mismatch` | 标"危废标签不规范",摘要其实在讲台账 | `建议问题类型` vs `现场问题摘要` | LLM | warning |
| 2 | `management_advice_miscast_as_law` ⚠️最高危 | `no_legal_basis` 的现场建议被写成"违反 XX 法" | `legal_basis_status` + 表达 | 规则 +LLM | blocking |
| 3 | `law_not_applicable` | 候选法条在本场景不适用 | `法条规范候选` + RAG 原文 | LLM | warning |
| 4 | `law_status_risk` | 绑定指向已废止/待生效/被取代条款 | `effective_status` + lineage 边 | 规则 | blocking |
| 5 | `missing_law_locator` | 法条缺条款号 / 无 `rag_doc_ref` / 命中 `blocked_refs` | graph context `blocked_refs` | 规则 | warning |
| 6 | `evidence_insufficient` | 称"标签不规范",证据里无标签照片 | `证据摘要` vs `evidence_field_requirement` | 规则 +LLM | warning |
| 7 | `duplicate_mergeable` | 与已有 issue_type 或近期已通过项语义重复 | 图谱相似度 + `问题类型引用` | LLM | info |
| 8 | `aggregation_risk` | 实为个案,通过进聚合会扭曲区域统计 | 跨企业分布(`buildPitfallBatch`) | 规则 | warning |
| 9 | `confidence_stale` | 整改已驳回但 confidence 仍高;`last_verified_at` 过旧 | `整改历史摘要` + `last_verified_at` | 规则 | info |
| 10 | `pitfall_candidate` | 同问题跨多家出现,应升级为踩雷点而非一次性 | 跨企业分布 + `pitfall_class` | 规则 | info |

> 错配码与 `regulatory-consistency-checker.md` 的风险码对齐:`management_advice_miscast_as_law`、`law_status_risk`、`missing_law_reference`、`candidate_or_disputed_basis` 等直接继承,审核台是它们的前移落点。

## 5. 「补足」清单(超出单人记忆的上下文)

审核每条切片时,副驾**先于判断**铺齐这些(全部确定性检索,零 LLM):

- **法条现状**:候选法条现行/已废止/待生效?被哪条 `replaced_by/amended_by` 取代?(`effective_status` + lineage 边)
- **跨企业模式**:同类问题本季度在几家危废企业出现?是否够 ≥5 家聚合?(复用 `buildPitfallBatch` 分组)——**人脑装不下、AI 最该补的一块**。
- **该问题类型的证据应有项**:`evidence_field_requirement` 告诉 ETO"标签不规范本应有标签照片",而非只数"证据 N 条"。
- **踩雷点关联**:是否已知 `pitfall_class`?新发现还是复发?
- **判例**:近期类似候选 ETO 怎么裁的,保口径一致。

## 6. 四步副驾管线

```
一条待审切片(review item,入图时已脱敏)
   │
① 检索(确定性,零 LLM)
   ├─ buildGraphContextResponse(node_id=问题类型引用 或 q=建议问题类型)
   │      → 已审核邻域 + law_refs + blocked_refs + machine_gate_status
   ├─ evidence_field_requirement(该 issue_type 应有证据项)
   ├─ 跨企业分布(buildPitfallBatch 分组,≥5 家口径)
   └─ 判例(近期同 region/industry/dimension/issue 的 ETO 决定)
   │
② 检测(混合)
   ├─ 确定性 backbone(review-copilot.js):错配 2/4/5/6/8/9/10
   └─ LLM critic(copilot-llm.js,RAG-grounded,可选):错配 1/3/6/7
   │      DeepSeek 只输出结构化 findings;读 RAG 真原文;缺 trace 的 finding 丢弃
   │
③ 组装「副驾意见」对象(每条异议都是待 ETO 采纳/驳回的候选)
   │      过 assertRedlineClean 红线扫描
   │
④ 审核台呈现(review.js)
        在现有 3 信号之上加"副驾研判":补足面板 + 异议卡(采纳/驳回)
        ETO 下结论时,采纳/驳回回执随 decision 提交 → delta 捕获
```

**fail-closed**:②的 LLM 段不可用(无密钥/RAG 失败/超时)→ 退化到确定性 backbone,`门禁=partial` + 写明 `降级说明`,副驾不沉默、只降级。

## 7. 副驾意见数据契约

`POST /api/review/field-events/:id/copilot` 返回(中文业务话术,与审核台一致):

```jsonc
{
  "审核编号": "review:ab12cd34",
  "副驾版本": "copilot.v1",
  "生成时间": "2026-06-28T10:00:00Z",
  "上下文门禁": "pass | partial | blocked",     // 镜像 graph context machine_gate_status
  "整体研判": {
    "就绪度": "ok | warn | bad",
    "建议方向": "approve | merge | internal | return | reject | null", // 对齐 review.js ACTIONS kind;null=不表态
    "一句话": "归类与法条均就位,证据可支撑,可直接判断。",
    "副驾自评置信": 0.0                            // 副驾对自己研判的置信,不是图谱 confidence
  },
  "补足": {
    "命中问题类型": { "node_id": "issue:hw:label-incomplete", "name": "危废标签不规范" },
    "法条现状": [
      { "node_id": "law:swl:art77", "article_no": "第七十七条", "effective_status": "in_force", "沿革警示": null }
    ],
    "证据应有项": ["标签照片", "台账记录"],
    "跨企业分布": { "样本企业数": 7, "复发率": 1.3, "是否够聚合": true },
    "踩雷点关联": [{ "node_id": "pitfall:hw:label-misread", "kind": "pitfall_class" }],
    "判例": [{ "审核编号": "review:...", "结论": "仅保留内部案例", "时间": "2026-06-20" }]
  },
  "异议": [
    {
      "错配码": "management_advice_miscast_as_law",
      "严重度": "blocking | warning | info",
      "判断维度": "归类 | 法律 | 证据 | 聚合 | 置信",
      "一句话": "该问题无法条依据,通过后只能写管理建议,不得写违反 XX 法。",
      "检出方式": "rule | llm | rule+llm",
      "证据": "法条规范候选为空,legal_basis_status=no_legal_basis",
      "建议修正": "改写为管理建议;或补法条候选后再升级表达。",
      "trace": { "node_ids": ["issue:hw:..."], "edge_ids": [], "source_refs": ["src:..."] },
      "采纳状态": "未决"                            // ETO 在 UI 设为 已采纳 / 已驳回
    }
  ],
  "降级说明": null,                                // 门禁≠pass 时写明为何降级、如何降级
  "trace": { "node_ids": [], "edge_ids": [], "source_refs": [] },
  "_redline_clean": true
}
```

确定性 backbone(无 LLM)产出同样结构,只是 `异议[].检出方式` 全为 `rule`、`整体研判.副驾自评置信` 省略或为规则置信。

## 8. 后端技术实现

### 8.1 新增模块(与现有件并列,职责单一)

| 文件 | 职责 | 是否触网 |
|---|---|---|
| `graph-api/src/review-copilot.js` | 确定性 backbone:检索 + 错配 2/4/5/6/8/9/10 + 组装副驾意见;纯函数,可单测 | 否(verify:all 安全) |
| `graph-api/src/copilot-llm.js` | LLM critic:调 DeepSeek;经依赖注入的 `ragFetch` 取 grounding 法条原文,产结构化异议 1/3/6/7;fail-closed。`buildCopilotPrompt` 分域装配(候选+图段 strict 闸 / 「法条引用」段 citation 闸),`projectCitations` 决定哪些原文进 prompt,`stripFindingLawFullText` 剥离回流 | 是(仅凭证 lane,DeepSeek) |
| `graph-api/src/tc3-rag-client.js` | RAG 法条原文 grounding:TC3-HMAC-SHA256 直连腾讯云 LKE `RetrieveKnowledge`,`sanitizeRetrieveRecord` 脱敏(丢 `Metadata` 企业噪声、只留 `rag_doc_ref/title/locator/score/excerpt`);`buildRagFetch(env)` 缺 LKE 凭证 → 返回 `null`(降级,绝不伪造原文),否则产 `copilot-llm.js` 的 `ragFetch` 注入函数 | 是(仅凭证 lane,腾讯云 LKE) |
| `graph-api/src/copilot-delta.js` | 把(副驾建议 vs ETO 终判)落成 `ai_review_delta` 治理候选 | 否 |

> **grounding 注入纪律**:`tc3-rag-client.js` 只「取原文 + 脱敏」,绝不参与 prompt 装配;`copilot-llm.js` 经 `ragFetch` 注入口消费其 `citations`(含 `excerpt`=法条原文),再由 `projectCitations` 决定哪些进 prompt(候选/图段恒不进原文)。两模块均零新依赖、纯离线可 stub 单测(`verify:all` 永不触网,守 ADR-0012)。

> **隔离纪律**:`review-copilot.js` 绝不 import `copilot-llm.js` 的网络路径;LLM 段通过依赖注入传入,缺失即走 fail-closed。这样 `verify:all` 永不依赖腾讯云密钥(守 ADR-0012)。

### 8.2 端点(挂在 `server.js`,继承 `/api/review/` 审核鉴权)

| 方法 | 路径 | 作用 | 阶段 |
|---|---|---|---|
| `GET` | `/api/review/field-events/:id` (扩展) | 详情附 `副驾研判`(确定性 backbone,廉价、离线、常开) | P0 |
| `POST` | `/api/review/field-events/:id/copilot` | 完整副驾意见(backbone + LLM 异议,RAG-grounded);fail-closed | P1 |
| `POST` | `/api/review/field-events/:id/decision` (扩展) | body 增 `副驾回执 { 副驾建议方向, 采纳异议码[], 驳回异议码[] }`;分歧时落 delta | P2 |

- 三个端点都已被 `isReviewApiPath` + `isReviewAuthorized` 覆盖("只有 ETO 或 admin 可进入审核台"),无需新鉴权。
- 副驾意见返回前**必须**过 `assertRedlineClean`(复用 graph-context.js 的扫描);命中即抛错,不返回。
- LLM 调用前,送入 DeepSeek 的 payload 再过一次 `scanForbidden`(review-store.js),双保险:确认不含企业名/GPS/照片/全文/密钥。

### 8.3 LLM critic 的约束(copilot-llm.js)

- **协议**:OpenAI 兼容 `POST {TENCENT_TOKENHUB_BASE_URL}/chat/completions`,model `deepseek-v4-flash-202605`,`Authorization: Bearer ${TENCENT_TOKENHUB_API_KEY}`。
- **输入(红线分域装配,`buildCopilotPrompt`)**:
  - **strict 域**:`{候选(projectCandidate 脱敏白名单投影),已审核图谱上下文(projectGraphContext)}` —— 过 `assertPromptClean`(完整 `scanForbidden` 含法条全文模式 + private-tier 拦截),**禁法条全文、禁私有判断字段**,命中即 fail-closed 不发送。
  - **「法条引用」段(citation 域)**:`projectCitations(citations, graphContext)` 产出 —— **允许法条原文**(`tc3-rag-client.js` 经 LKE `RetrieveKnowledge` 取的 `excerpt`),但只取本轮**已审核来源**(`rag_doc_ref ∈ law_refs/tech_spec_refs` 且不在 `blocked_refs`)、≤2000 字符截断、逐条过 `scanCitationForbidden` + private-tier;脏的【该条原文置 `null`】(降级该条,不整体抛)。`assertCitationSegmentClean` 兜底:禁私有 / 企业 / 坐标 / 密钥 / 照片,命中即抛。
  - `法条原文可用` 布尔 = 是否有引用真带上了「法条原文」字段(grounding 是否生效)。
- **输出**:强制 JSON,只允许 §7 的 `异议[]` 结构;`response_format` 走 JSON,服务端再用 schema 校验;**任何缺 trace 或 trace 不在本次 graph context 内的 finding 一律丢弃**(防幻觉法条);`stripFindingLawFullText` 剥离 LLM 把法条原文回贴进散文(整段模式闸 + ≥20 字逐字内容感知闸)——**原文供研判,绝不回流进 findings / report / 图**。
- **fail-closed 矩阵**:

| 情况 | 副驾行为 |
|---|---|
| 无 TokenHub/RAG 密钥(本地/CI) | 只返回确定性 backbone,`门禁` 不降级(本就无 LLM 段) |
| RAG 取文失败 | 涉及法条适用性的异议(`law_not_applicable`,#3)降级为"需人工复核法条",`门禁=partial` |
| DeepSeek 超时/报错 | 退化到 backbone,`降级说明` 写明 LLM 不可用 |
| `blocked_refs` 非空 | 相关法条异议只作内部提示,不得写成确定依据 |

### 8.4 数据流与既有契约的一致性

副驾**只读** approved 图谱上下文(`isApproved` = shared/aggregate + approved/human_reviewed),与 `/api/graph/context` 同源;它产出的异议是**建议**,永不写回 approved 图、永不自动晋级 CANDIDATE(守 AGENTS.md 硬门禁 #4)。`ai_review_delta` 进 `data/knowledge-governance/candidates/`,默认 `review_status=candidate`,等人工。

## 9. 前端技术实现(graph-ui/src/review.js)

### 9.1 在现有详情页扩展,不重写

`renderDetail()` 当前结构:头部 → `readinessBanner` → 3 个 `signalCard`(信源/归类/字段)→ 决策区 → 完整资料折叠。在 **3 信号与决策区之间**插入"副驾研判"段:

```
头部
就绪度横幅(现有)
3 信号卡(现有,确定性)
─────────────────────────
▼ 副驾研判(新增)
  [请十律复核] 按钮 → 触发 POST /copilot(LLM 仅在 ETO 点击时才烧)
  补足面板:法条现状 / 跨企业分布 / 证据应有项 / 判例
  异议卡 × N:错配码徽章 + 严重度 + 一句话 + 建议修正 +「采纳」「驳回」
─────────────────────────
决策区(现有:选结论 → 提交)
完整资料(现有)
```

- P0:详情接口已带 `副驾研判`(确定性),进页即渲染补足 + 确定性异议,无需点按钮。
- P1:`[请十律复核]` 触发 LLM 段,把语义异议(1/3/6/7)增量并入异议列表;加载/失败/降级三态明确。

### 9.2 DESIGN.md 视觉合规(异议是"意见"不是"事实")

副驾层必须**视觉上区别于事实层**,且守"颜色即注意力 / 不为炫酷牺牲解释性":

- 异议卡用左强调边 + "副驾"小徽章,与既有 `rv-signal` 卡同族但更"轻"(它是观点)。
- 严重度配色复用 DESIGN tokens 语义:`blocking`→`issue #B42318`,`warning`→`risk #C2410C`,`info`→`on-surface-muted`。**不新增装饰性渐变/光效**(守 DESIGN「Don't use color/motion without business meaning」)。
- 错配码渲染为人读中文标签(`management_advice_miscast_as_law` → "管理经验被法律化");机器码只在"查看溯源"里露出。
- 补足里的法条现状:`已废止/待生效` 用 `effective_status` 警示点,呼应图谱质量面板口径。

### 9.3 采纳/驳回 与 delta 捕获

- 每条异议带「采纳」「驳回」切换(就地更新,不重渲染,沿用 `review.js` 既有"选结论不丢已输入意见"的模式)。
- `submitReviewDecision` 的 body 增 `副驾回执 { 副驾建议方向, 采纳异议码[], 驳回异议码[] }`。
- 演示模式(非 api)下副驾回执只在本浏览器生效,与现有 demo 横幅一致。

### 9.4 状态与证据(契约测试 + render-proof)

必须覆盖:桌面 + 移动视口;真实数据态(有异议)+ 一个非理想态(副驾降级/LLM 不可用/无异议"信号良好")。render-proof 至少新增:

```
reports/render-proof/YYYYMMDD-copilot-opinion.png       # 异议卡 + 采纳/驳回
reports/render-proof/YYYYMMDD-copilot-degraded.png      # LLM 不可用降级态
```

UI 契约测试断言:副驾异议确实渲染、`采纳/驳回` 改变提交 body、降级态文案出现、私有内容不出现在前端 bundle。

## 10. 分歧飞轮(战略层)

`ai_review_delta` 把"副驾建议 vs ETO 终判"变成一等专家经验(与 ESO↔ETO delta 同构):

- **喂养**:分歧样本 → few-shot / 口径修正,副驾越来越懂本地口径。
- **量化护城河**:"副驾-ETO 一致率"曲线随时间上升 = 一个正在被每天 100 家企业判断喂养、会进化的专家系统;每次分歧 = 别人拿不到的专家知识沉淀。
- **可演示给主任**:不是"准确率 92%",而是"它跟着我们顶尖 ETO 学,分歧被捕获不被丢弃"——直接放大 CONTEXT 既有叙事(护城河=蒸馏流,背书=放大器)。

落点:`copilot-delta.js` 生成 `ai_review_delta` 候选 → 进 `knowledge_governance.py generate-candidates` → 可选并入图谱质量评分的 `confidence_reason`。

## 11. 降级与红线(必须当面与 candy 确认)

继承 AGENTS.md 硬门禁 + CONTEXT 授权红线,新增/强调:

1. **私有零泄漏**:副驾意见过 `assertRedlineClean`;送 LLM 的 payload 过 `scanForbidden`。副驾产物不进 shared/aggregate 导出。
2. **不自动晋级**:副驾永远 advisory;异议是候选,ETO 是裁决者;`ai_review_delta` 默认 candidate。
3. **法条不幻觉**:LLM 异议必须 trace 到本次 graph context 内真实存在的法条节点;全文只从 RAG 取;引不出 → 降级为管理建议。
4. **⚠️ 外部 LLM 数据治理(candy 已定 2026-06-28)**:副驾的 DeepSeek 调用会把候选内容发到腾讯云 TokenHub。入图契约已剥离企业名/ID/GPS/照片/全文,所以送出的是**脱敏候选 + shared 图上下文 + RAG 法条原文**。**红线:私有判断标准(证据判断标准 `evidence_judgment_standard`、整改模板 `rectification_template`、ETO 审核笔记)一律不进外部 LLM 提示词**,只在本地确定性规则层用;`copilot-llm.js` 组装 prompt 前必须断言 payload 不含 private-tier 内容,违反即 fail-closed 退回 backbone。

   **红线分域不变量(RAG grounding 引入后,candy 已定 2026-06-28;ADR-0014)**——同一道扫描在不同域有不同强度,任何实现不得弱化:

   | 域 | 法条原文 | 私有判断字段 | 企业 / GPS / 照片 / 密钥 | 闸 |
   |---|---|---|---|---|
   | 候选(`projectCandidate`)+ 已审核图段(`projectGraphContext`) | **禁** | **禁** | **禁** | `assertPromptClean`(`scanForbidden` 全集含法条全文模式 + private-tier),命中 fail-closed 不发送 |
   | prompt「法条引用」段(`projectCitations`) | **允许**(仅本轮已审核来源、截断、瞬时进 prompt) | **禁** | **禁** | `scanCitationForbidden` + private-tier,逐条丢脏原文 + `assertCitationSegmentClean` 兜底抛 |
   | 副驾输出(findings / 副驾意见)+ 任何 report / 图谱节点 | **恒禁** | **禁** | **禁** | `assertRedlineClean` / `scanForbidden` 全集(法条全文也拦);`stripFindingLawFullText` 剥离回流;lane `find_forbidden_payload_keys(report)` 纵深第二道 |

   一句话:**法条原文只准在「prompt 的法条引用段」瞬时出现一次,供 DeepSeek 研判;此外的任何地方(候选、图段、findings、report、图)恒禁**。守 ADR-0003(法条全文不进图)、ADR-0012(report 不存原文)、ADR-0013(advisory)、ADR-0014(原文可进 prompt、不落盘)。
5. **离线纪律不破**:`verify:all` 不依赖任何腾讯云密钥;LLM 段只在 `verify:external` 凭证 lane(ADR-0012)。
6. **自动化偏见**:副驾以"异议"而非"答案"呈现;确定性证据永远和 LLM 观点并排,不被盖住;采纳/驳回的摩擦 + delta 捕获是解药。

## 12. 分期落地(低风险优先)

| 阶段 | 交付 | 为什么这个顺序 | 风险 |
|---|---|---|---|
| **P0**(ETO 入驻前) | 确定性 backbone(`review-copilot.js`)+ 详情接口 `副驾研判` + 审核台补足/异议渲染 + `.feature` 合同 | 离线、可 `verify:all`、对 ETO 立即有用、演示更安全 | 低 |
| **P1**(凭证 lane) | LLM critic(`copilot-llm.js`)+ `POST /copilot` + RAG-grounding + fail-closed | 守离线纪律,LLM 故障不影响审核台可用 | 中 |
| **P2** | delta 飞轮(`copilot-delta.js` + decision body 扩展 + 一致率指标) | 把分歧变资产,产出"会学习"的演示证据 | 中 |
| **P3** | 从危废泛化到其余 12 维,复用同一副驾骨架 | 一刀打穿后横向复制 | 低 |

## 13. 验证

- **先合同后代码**:`specs/features/eto-review-copilot.feature` 定义 10 类错配、降级、trace 要求、不自动裁决、delta 捕获;`pnpm bdd:export` 纳入。
- **后端单测**:`review-copilot.js` 纯函数全覆盖(错配 2/4/5/6/8/9/10);`copilot-llm.js` 用 stub 注入,断言 fail-closed 与 trace 丢弃。
- **UI 契约测试**:断言异议渲染、采纳/驳回改提交 body、降级态、私有不入 bundle。
- **离线/外部双 lane**:确定性部分进 `verify:all`;LLM 部分进 `verify:external`(`GRAPH-RAG-REAL-SMOKE` 同 lane)。
- **render-proof**:§9.4 两张新证据。

## 14. 决策(candy 已定 2026-06-28)

- **Q1 私有判断标准入外部 LLM**:**否**。私有判断力只在本地规则层用,prompt 不含 private-tier(见 §11.4)。
- **Q2 命名**:**十律**。上游守门人,与下游"小悦"分为两个身份;取义于 §4 十条审核律,以"十"为稳定骨架。
- **Q3 LLM 触发**:**ETO 手动触发**(`[请十律复核]`);补足与确定性异议进详情即自动,省 token、避免自动化偏见。
- **Q4 一致率指标进政府演示**:**是**。作为"会学习的专家系统"硬证据(见 §10)。
