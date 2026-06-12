# 架构设计 · 环保现场执行图谱

> 配套阅读:`docs/brainstorms/2026-06-10-eco-execution-graph-requirements.md`(需求与决策)、`docs/adr/`(不可轻易反转的决策)、`CONTEXT.md`(业务口径)。

## 1. 总体架构:一张图、三层授权、四个消费面

```
                ┌─────────────────────────────────────────────┐
   上游数据源    │              本仓库(图谱层)                  │      消费面
                │                                             │
 EcoCheck 蒸馏流 ─→ pipeline/ingest  ─┐                        │ ① 演示驾驶舱(graph-ui ego 视图)
 (semantic_event │  (CANDIDATE)      │                        │ ② 共有导出包(软著/培训/执法工具)
  _outbox v2)    │                   ▼                        │ ③ 缺口报告(双向,给主任团队)
                │            data/candidates                  │ ④ 上下文装配 API(第二刀,回灌
 eco-semantic-kb ─→ pipeline/import  │                        │    EcoCheck 月报,docs/api)
 approved        │  (骨架挂载点)      │  人工审核(candy/ETO)    │
 baselines       │                   ▼                        │
                │            data/approved                    │
 semantic-       │                   │                        │
 profile-lab     │                   ▼                        │
 contracts ──────→ schema/(node/edge/source/card)             │
                │                   │                        │
 腾讯云知识引擎   │                   ▼                        │
 RAG(法规全文)←──┼── 法条瘦节点 law_ref 指回 ──────────────────┼──→ 引用时取全文
                │                   │                        │
 政府法典库      │            pipeline/export                  │
 (lineage,预留)─→ lineage 关系边     │── tier 过滤 ──→ data/exports
                └─────────────────────────────────────────────┘
```

核心原则(继承 2026-06-01 审计结论):**一张图、溯源优先、现场为源、成效定权、薄切发车。**

### 1.1 对外定位

同一底座按对象使用不同名称,避免落入泛化的"环保知识图谱"表达:

| 对象 | 名称 | 目的 |
|---|---|---|
| 内部工程 | 环保现场执行图谱 | 强调法条如何落到真实企业现场 |
| 政府侧 | 生态环境法典行业现场执行图谱 | 强调法典/执法工具获得行业现场视图 |
| 企业侧 | 环保管家智能底座 | 强调服务质量、报告质量与整改闭环 |
| 产品战略 | 环保语义操作系统 | 强调长期语义资产与执行飞轮 |

## 2. 数据模型

### 2.1 图模型:node / edge / source 三段式

直接沿用 `semantic-profile-lab` graph-export v2.1 的结构(JSON + NDJSON 双形态),在其上增加授权、法规沿革与法律口径控制:

- 每个 node / edge / source 增 **`tier: "shared" | "private" | "aggregate"`**(ADR-0002,出生即带,导出按 tier 物理过滤);
- law_article 节点可带 **`lineage_ref`** 轻量摘要,正式沿革用 `replaced_by / amended_by / split_into / merged_into / inherits_from / conflicts_with` 等关系边表达(ADR-0003);
- `regulated_by` / `manifests_as` 等法律判断边增 **`legal_basis_status`**,控制报告与卡片的对外表达强度。

每条边必须有 `source_ref`(回指 sources 记录)和 `confidence`。confidence 初始由来源类型决定,之后由整改成效回写(ADR-0005)。

### 2.2 节点类型(本期)

| tier | 节点类型 | 来源 |
|---|---|---|
| shared | industry / process_scenario / pollution_source / pollutant / standard_limit / tech_spec / law_article(瘦) / law_obligation / issue_type(问题分类法) / pitfall_class / evidence_category / 概念级 evidence_field_requirement | eco-kb baselines + 法规抽取 + 现场归一 |
| private | enterprise / facility / discharge_outlet / risk_unit / issue_instance / pitfall_instance / evidence_judgment_standard / evidence_instance / rectification_template / rectification_instance / report_expression / distill_event | EcoCheck 蒸馏流 + 私有沉淀 |
| aggregate | stat_signal(区域/行业级统计) | 由私有层计算,单向输出 |

踩雷点不再默认整体 shared: `pitfall_class` 可共有,`pitfall_pattern_stat` 只能以聚合统计出,`pitfall_instance` 永远 private。证据也拆三层:证据类别可出,证据字段要求只出概念级/部分字段,证据判断标准与真实样例不出。

### 2.3 边类型(本期核心)

```
occurs_in            (process_scenario → industry)
emits                (pollution_source → pollutant)
limited_by           (pollutant → standard_limit)
regulated_by         (process_scenario / issue_type → law_obligation)
obligation_of        (law_obligation → law_article)
manifests_as         (law_obligation → issue_type)        ← 法条↔现场的焊接边
evidenced_by         (issue_type → evidence_category / evidence_field_requirement / evidence_judgment_standard)
rectified_by         (issue_type → rectification_template) [private]
reported_as          (issue_type → report_expression)      [private]
pitfall_of           (pitfall_class / pitfall_pattern_stat / pitfall_instance → law_article / issue_type)
instance_of          (issue_instance → issue_type)          [private]
located_at           (issue_instance → facility/outlet/risk_unit) [private]
replaced_by / amended_by / split_into / merged_into / inherits_from / conflicts_with
                     (law_article → law_article,法典沿革)   ← 政府数据挂载点
supports_stat        (issue_instance → stat_signal)         [aggregate 生成线]
```

**缺边检测**是一等产物(R2):`law_obligation` 无 `manifests_as` 出边 = 合规盲区;`issue_type` 无 `regulated_by` 出边 = 管理经验(必须与法律要求强制区分);`pitfall_class` + `pitfall_pattern_stat` 排行 = 高频踩雷条款。

### 2.4 法律依据状态

法律判断边必须带 `legal_basis_status`,避免 AI 把管理建议包装成法律要求。

| status | 对外表达 |
|---|---|
| `official_confirmed` | 可写"依据/根据" |
| `internal_reviewed` | 可写"参考相关要求" |
| `candidate` | 只能内部提示,不能对外引用 |
| `disputed` | 必须进入人工审核 |
| `no_legal_basis` | 只能写管理建议,不得写违法/违反 |

### 2.5 执行卡(card)

《法条↔现场执行卡》不是新数据,是**按卡片 schema 对图的一次切片渲染**:一个 law_article 为根,沿 obligation → manifests_as → issue_type → (evidence/rectification/report/pitfall) 取邻域子图。卡有两个渲染视图:**内部全量视图**(含私有层)和**共有视图**(tier=shared 过滤,证据/整改/报告表达栏渲染为"已建立标准,N 条"占位)。schema 见 `schema/card.schema.json`。

共有视图不是空卡:可展示证据类别(如现场照片/台账记录/标签照片/转移联单)和概念级字段要求;证据判断标准、真实样例、审核笔记、整改模板、报告表达模板仍只在内部全量视图存在。

执行卡可以人工润色叙事,但数据源必须来自图谱节点/边/source。禁止把执行卡维护成独立手工内容库。

### 2.6 图谱质量评分

`confidence` 是最终分数,但每条边还必须带可解释质量元数据,用于政府演示、ETO 审核和内部质量门禁:

```json
{
  "confidence": 0.82,
  "confidence_reason": ["ETO_CONFIRMED", "RECTIFICATION_VERIFIED", "LAW_MAPPING_REVIEWED"],
  "evidence_count": 17,
  "last_verified_at": "2026-06-10",
  "reviewer_role": "ETO",
  "staleness_risk": "low"
}
```

解释原则:

- `confidence_reason` 说明这条边为什么可信;
- `evidence_count` 说明来自多少次现场/审核/聚合证据;
- `last_verified_at` + `staleness_risk` 说明这条关系是否可能过期;
- `reviewer_role` 说明最后确认来自 ESO、ETO、政府、系统或 candy。

### 2.7 三个进阶模块

| 模块 | 数据层 | 第一阶段边界 | 价值 |
|---|---|---|---|
| 图谱质量评分系统 | edge 质量字段 + confidence_evidence | P1 就写入 schema 与卡片/边详情展示;先不做复杂算法 | 让"可信"可解释、可审核、可演示 |
| 云南环保高频踩雷地图 | aggregate 层 stat_signal / pitfall_pattern_stat | P1 只输出离线表格/报告段落,不做地图大屏 | 为监管资源配置和基层培训提供聚合依据 |
| 监管口径一致性检查器 | BDD 规则 + legal_basis_status + graph trace | P1 先做离线 checker,输入报告结论输出风险清单 | 防错引法条、管理经验违法化、缺证据链和过度承诺 |

## 3. 模块边界

| 模块 | 职责 | 禁区 |
|---|---|---|
| `schema/` | JSON Schema 单一事实源 | 改 schema 必须配 ADR 或 specs 更新 |
| `pipeline/` | ingest(蒸馏流→CANDIDATE)/ import(baseline→骨架)/ normalize(归一)/ build(成图)/ export(tier 过滤导出)/ gap_report(缺边检测) | 不得绕过人工审核把 CANDIDATE 直接置 APPROVED;不得在导出中携带 private 数据 |
| `graph-ui/` | ego 视图、tier 徽章、confidence 着色、蒸馏计数器、演示模式 | 只读消费 data/exports,不写数据 |
| `data/` | upstream(指针不拷贝)/ candidates / approved / exports | exports 里的共有包必须通过 verify 的零泄漏契约测试 |
| `verify/` | 统一验证入口 + AFK 配置 + 零泄漏契约测试 | — |

## 4. 关键数据流

### 4.1 现场蒸馏 → 图(P1,壁垒起点)

EcoCheck `semantic_event_outbox`(v2 字段设计见 `E:\knowledge-graph\现场蒸馏-v2-价值字段设计-2026-06-01.md`)只作为**候选现场经验来源**。审核链路拆成两道门:

1. **EcoCheck 业务事实审核**:EcoCheck 小程序内完成现场排查、报告事实或整改闭环的 ETO 确认;该确认只证明"这个企业这次业务事实成立"。
2. **graph 入图/聚合审核**:候选现场经验推送到 graph `private staging`;graph Web 端"现场经验入图审核台"由 ETO 决定是否入图、仅保留内部案例、退回补充、不入图,或进入聚合候选池。

未经 graph ETO 入图审核的 EcoCheck 事件不得进入 aggregate 统计。进入聚合候选后仍必须满足最小样本企业数 ≥5,才能生成 `stat_signal` / `pitfall_pattern_stat`。企业级字段、真实证据路径、GPS、原始照片、原始报告全文不得进入 graph 接收契约或导出行。ESO/ETO 双值 delta 仍是一等蒸馏物,但完整能力留在 private + internal runtime。

### 4.2 法规引用(图为瘦索引)

```
现场问题 → 图查 manifests_as/regulated_by 边 → 得 law_article ID 列表
        → 腾讯云知识引擎 RAG 按 ID/条款号取全文 → 报告引用(可追溯)
```

图保证"引哪条",RAG 保证"原文是什么"。法规更新只维护 RAG 侧;法典生效后由关系化 lineage 边迁移引用(ADR-0003)。若 `legal_basis_status` 不是 `official_confirmed/internal_reviewed`,报告表达自动降级或进入人工审核。

### 4.3 共有包导出(软著/培训/执法工具)

`pipeline/export --tier shared` → 物理过滤 → `data/exports/shared_package_vX/` + manifest(含 hash)。聚合层导出走独立命令,只含 stat_signal,经最小聚合粒度校验(防止小样本反推个体企业)。

## 5. 外部工具、资源与开源项目引用

| 类别 | 名称 | 许可 | 用途 | 引用方式 |
|---|---|---|---|---|
| 开源库 | [Cytoscape.js](https://js.cytoscape.org/) | MIT | ego 图谱渲染、布局、交互 | graph-ui 依赖 |
| 开源库 | [cytoscape-dagre](https://github.com/cytoscape/cytoscape.js-dagre) + [dagre](https://github.com/dagrejs/dagre) | MIT | 法条→义务→问题分层有向布局 | graph-ui 依赖(ADR-0010) |
| 开源库 | [Lucide](https://lucide.dev/) | ISC | 语义图标体系(法条=scale、私有层=lock、踩雷=triangle-alert) | graph-ui 依赖 |
| 开源库 | [Vite](https://vitejs.dev/) | MIT | 前端构建与开发服务器 | graph-ui 依赖 |
| 视觉参照 | AntV G6 / Graphin / shadcn-ui / Tremor / DataHub | 各自开源 | 仅借鉴视觉与信息架构范式,不引入代码 | ADR-0010(React 化门槛) |
| 字体 | Noto Sans SC / Noto Serif SC | OFL | 界面正文 / 法典叙事衬线;演示机系统已装,不打包 | CSS 字体栈(ADR-0010) |
| 标准 | [JSON Schema 2020-12](https://json-schema.org/) | — | schema/ 校验 | 规范引用 |
| 云服务 | 腾讯云知识引擎原子能力(LKE)+ RAG 组件 | 商业 | 法律法规与技术规范条款全文存储/检索 | API 调用,密钥走 .env(永不入库) |
| 私有仓库 | coco830/eco-semantic-knowledge-base | 私有 | approved baseline(v1.0 链路/v8.5 污染物/v8.6 标准映射)作为骨架数据 | data/upstream 指针引用,不拷贝 |
| 私有仓库 | coco830/semantic-profile-lab | 私有 | 图模型契约(graph-export v2.1、provenance v1.9、治理门禁) | schema 继承并扩展 |
| 私有仓库 | coco830/ecocheck | 私有 | semantic_event_outbox 蒸馏流(v2) | pipeline/ingest 消费 |
| 私有仓库 | coco830/Yunnan-emission-smart-calculator | 私有 | pollutant_id 标准化字典、系数维度键 | 只共享键,不接核算(治理膜) |
| 私有仓库 | coco830/git-workflow-hooks | 私有 | pre-commit/commit-msg/pre-push 门禁、主干保护 | scripts/git-workflow + .husky |
| 私有仓库 | coco830/gherkin-v39-cli | 私有 | BDD .feature → Cucumber Messages NDJSON | `pnpm bdd:export` |
| 工具 | GitNexus | — | **仅用于本仓库代码导航,不用于领域图谱**(职责澄清,勿混用) | 本地 CLI |
| 延后评估 | Microsoft GraphRAG | MIT | 非结构化文本抽图 + 社区摘要探索管道 | 不作为主业务图谱,只可在 tool-lab 中试验辅助抽取 |
| 延后评估 | Neo4j Community / Graphiti | GPLv3 / Apache-2.0 | 图数据库/时序上下文图(关系复杂度达标后再评估) | ADR-0006 延后 |

## 6. 安全与授权边界(红线)

1. **私有层零泄漏**:任何 `tier=private` 的节点/边/源不得出现在共有导出包;由 `verify/` 拒绝型契约测试强制(参照 eco-kb `validate_runtime_preintegration_contracts` 风格)。
2. **企业数据脱敏也不出**:演示用例须用结构真实、标识虚构的合成企业,或获企业书面同意的展示样本。
3. **聚合层最小粒度**:统计输出必须满足最小样本数(默认 ≥5 家企业),防反推。
4. **密钥**:腾讯云密钥只走环境变量,`.env.example` 只放占位符。
5. **CANDIDATE 治理膜**:现场事实是 CANDIDATE,绝不自动写 Yunnan `ConfirmedDataset`(继承蒸馏 v2 spec R2)。

## 7. 分期路线(与 2026-06-01 审计规划对齐)

| 阶段 | 内容 | 验收 |
|---|---|---|
| **P0 骨架与契约**(本期) | 仓库矩阵、schema、tier 设计、卡片 schema、verify 入口 | checklist 全绿,schema 校验通过 |
| **P1 危废竖切样板** | 5 张精品执行卡打穿全链路 + 15 张半成品卡证明可规模化 + 1 份缺边报告 + 1 个 shared 导出包 + 口径检查器雏形 + 质量评分字段 | 精品卡可演示,共有包泄漏测试通过,ETO 能看见质量依据 |
| **P0.5 上下文装配最小验证** | 合成企业 + 3 条危废现场问题 + 法条 ID → 离线装配上下文 → 生成月报段落,ETO 对比旧 AI 与图谱装配版 | 证明报告更像专家、更可追溯,不接正式 EcoCheck |
| **P2 演示驾驶舱** | graph-ui ego 视图 + tier 徽章 + 蒸馏计数器 + 演示模式(C 刀法对照叙事) | 演示彩排通过 frontend-render-proof |
| **P3 缺口报告 + 共有包** | gap_report + shared 导出 + 零泄漏契约测试 | 报告生成,泄漏测试 0 失败 |
| **P4 政府对接面** | 关系化 lineage 接口契约、共建数据交换格式 | 契约文档可直接拿去对接 |
| **P5 第二刀:回灌** | 上下文装配 API → EcoCheck 月报接地(EcoDoc M3);成效回写 confidence 飞轮 | 报告引用可追溯,飞轮跑通 |

## 8. 性能与规模预期

第一刀图规模 < 5,000 节点 / 20,000 边,JSON 全量加载 + Cytoscape 前端布局完全够用。上下文装配 API(P5)按"单节点邻域子图查询"设计,纯内存索引即可,无需图数据库——这是 ADR-0006 的量化依据,触发重新评估的阈值写在该 ADR 中。
