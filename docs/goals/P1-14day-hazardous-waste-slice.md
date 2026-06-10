# P1 一阶段 14 天危废精品切片 · 唯一成功目标

## 0. 总目标

在本仓库 `E:\eco-execution-graph` 内，完整实现「P1 一阶段 14 天危废精品切片」的可运行闭环：以危废域为唯一切口，交付 5 个精品 `issue_type`、issue_type registry + aliases、每个问题 1-3 个高置信法条/规范绑定、图谱质量评分字段、5 张 internal 执行卡 + 5 张 shared 执行卡、双向缺口报告、P0.5 月报段落对比、监管口径一致性检查器雏形、ego 图谱最小演示、shared 导出包、私有层泄漏检测、政府演示叙事彩排材料。

唯一成功标准：`pnpm verify:all` 通过，并且 `reports/` 下存在可人工验收的演示证据、缺口报告、月报对比报告、监管口径检查报告、shared 包泄漏检测报告、政府演示脚本。不要只做文档，不要只做 mock，不要只写 TODO；必须有可运行脚本、样例数据、导出产物、验证结果和 UI 构建结果。

## 1. 必读上下文

开始实现前，先按顺序阅读并遵守：

1. `AGENTS.md`
2. `CONTEXT.md`
3. `ARCHITECTURE.md`
4. `CODEMAP.md`
5. `README.md`
6. `graph-ui/AGENTS.md`
7. `pipeline/AGENTS.md`
8. `schema/*.schema.json`
9. `specs/features/*.feature`
10. `docs/adr/*.md`
11. `docs/api/*.md`

如文件内容和本目标冲突，以硬门禁、AGENTS、ADR、schema 为准。本目标只能补充，不得放松项目红线。

## 2. 不停顿执行协议

这是一个全量实施任务，不是咨询任务。

除非遇到会破坏安全红线、需要真实密钥、需要真实企业数据、需要 candy 人工批准上 main、需要访问不存在的上游仓库且没有任何可替代样例，否则不要向用户提问，不要停下来等确认。

遇到缺信息时，使用以下降级策略继续推进：

1. 首选读取现有仓库、schema、docs、specs、上游指针和样例。
2. 若上游真实数据不可用，使用结构真实、标识虚构的合成危废 demo 数据，并在 manifest 中明确 `demo_package: true`。
3. 若法规全文/RAG 不可用，只存 law_article 瘦节点和 `rag_doc_ref` 占位，禁止伪造法条全文。
4. 若无法确定某条法条是否高置信，将其标记为 `candidate` 或 `internal_reviewed`，不得标记 `official_confirmed`。
5. 若 UI 截图/录屏自动化不可用，至少完成 `pnpm ui:build`，并生成 `reports/render-proof/README.md`，说明人工打开方式、演示路径和验收截图清单。
6. 若部分真实集成无法完成，用 adapter/stub + contract test 先打通闭环，但必须在报告中列出真实接入缺口。
7. 不要为了通过测试删除关键功能；可以收缩范围，但不能破坏闭环。

## 3. 硬红线

必须遵守：

1. `tier=private` 不得进入 `data/exports/shared_*` 或 aggregate 导出。
2. 真实企业数据、脱敏企业数据、真实客户名、真实照片、真实台账不得进入 demo、测试、文档或 shared 包。
3. `law_article` 节点不得存法条全文，只能存 ID、法规名、条款号、义务谓词、`rag_doc_ref`、`lineage_ref`、`effective_status`。
4. ingest 产生的一切默认 CANDIDATE；自动脚本不得把候选事实直接晋级 approved。
5. 涉及报告生成、法规引用、监管口径、导出隔离、AI 输出降级的行为变化，先补充或更新 `specs/features/*.feature`。
6. 不引入图数据库，不引入重型外部依赖，不把 GitNexus 用于领域图谱。
7. 不提交密钥，不写真实 `.env`。
8. 不直接 push / merge main；如当前分支是 main，创建工作分支。

## 4. 实施范围

### 4.1 危废 issue_type 精品切片

交付 5 个精品危废 `issue_type`，至少包括：

1. 危废标签不规范
2. 危废台账不完整
3. 危废暂存间分区/分类贮存不规范
4. 危废识别标志/警示标识设置不规范
5. 危废转移、入库、出库记录不一致

每个 issue_type 必须有：

- 稳定 `issue_type_id`
- canonical name
- aliases，至少 5 个
- dimension = 危废管理
- typical_scene / process_scenario
- default_risk_level
- tier
- review_status
- source_ref
- evidence_count 或 demo_evidence_count
- confidence_seed
- 适用的 shared/internal 字段边界说明

### 4.2 法条/规范高置信绑定

每个 issue_type 绑定 1-3 个高置信 law_article / tech_spec / law_obligation 瘦节点。允许使用 demo law IDs，但必须结构真实，不得伪造全文。

每条绑定边必须有：

- edge_type：`regulated_by` / `manifests_as` / `obligation_of` / `limited_by` 等项目既有类型
- source_ref
- confidence
- confidence_evidence
- review_status
- legal_basis_status：`official_confirmed | internal_reviewed | candidate | disputed | no_legal_basis`
- report_usage_policy：说明报告中能写“依据/参考/管理建议/需人工审核”的表达边界

### 4.3 图谱质量评分字段覆盖

为 node/edge/source/card 或质量报告补齐质量评分字段，至少覆盖：

- confidence
- confidence_reason
- evidence_count
- last_verified_at
- review_status
- reviewer_role
- staleness_risk
- legal_basis_status
- source_ref
- tier
- export_allowed

更新 schema、样例数据、验证脚本和文档。

### 4.4 执行卡

生成 5 张 internal 执行卡和 5 张 shared 执行卡。

internal 卡可展示私有层存在，但 demo 数据必须合成；shared 卡必须物理过滤 private 内容，只保留“已建立标准 N 条 / 内部执行标准已建立”这类占位信息。

每张卡至少包含：

- card_id
- title
- root_law_article 或 root_issue_type
- field_manifestations
- related_obligations
- evidence_summary
- rectification_summary
- report_expression_summary
- pitfalls
- graph_slice_refs
- render_views：internal/shared
- export_policy
- quality_score

### 4.5 双向缺口报告

实现 `pipeline/gap_report.py`，输出 Markdown + JSON：

1. 法条义务无现场覆盖：law_obligation 无 `manifests_as`
2. 现场问题无法条依据：issue_type 无 `regulated_by`
3. 高频踩雷点排行：pitfall density / issue coverage
4. 共有层可出摘要
5. 内部层保留详情

报告输出到：

- `reports/gap-report-hazardous-waste.md`
- `reports/gap-report-hazardous-waste.json`

### 4.6 P0.5 月报段落对比

实现一个离线月报段落对比器，输出：

- 普通 AI/通用模板式段落
- 图谱上下文装配后的段落
- 差异说明：更自然、更人性化、更可追溯、更贴近企业场景
- 引用链：问题 → 证据类型 → 法条瘦节点 → 整改方向 → 报告表达边界
- 禁止表达检查：不得把管理建议写成违法

输出到：

- `reports/monthly-report-comparison-hazardous-waste.md`
- `reports/monthly-report-comparison-hazardous-waste.json`

不需要真实调用大模型；可以使用 deterministic template + context bundle，关键是验证上下文装配价值。

### 4.7 监管口径一致性检查器雏形

实现 `pipeline/regulatory_consistency_check.py` 或等价脚本。

输入：执行卡、月报段落、graph slice。

检查：

1. 是否引用不存在的法条
2. 是否法条全文进图
3. 是否缺少 source_ref
4. 是否把 `no_legal_basis` / `candidate` 写成确定法律依据
5. 是否把管理建议写成“违反/违法/不符合 XX 法”
6. 是否 shared 包包含 private 字段
7. 是否法规引用缺条款号
8. 是否缺少人工审核状态

输出到：

- `reports/regulatory-consistency-check.md`
- `reports/regulatory-consistency-check.json`

### 4.8 ego 图谱最小演示

在 `graph-ui/` 完成最小可构建的 Cytoscape.js + Vite ego 图谱驾驶舱。

必须支持：

- 读取 `data/exports/demo_hazardous_waste_internal/graph.json` 或 shared demo package
- 中央 ego 图，默认 1-2 跳
- 点击节点设为中心
- 节点类型视觉区分
- shared/private/aggregate tier 徽章
- confidence 边强弱或颜色表达
- internal/shared 视图切换
- 右侧执行卡面板
- 边/节点详情抽屉，显示 source_ref、confidence、legal_basis_status、review_status
- 蒸馏计数器，真实 outbox 不可用时明确显示 demo snapshot
- 演示模式：C 刀法“执法工具升级前 / 升级后”

必须执行：

- `pnpm ui:build`

并输出：

- `reports/render-proof/README.md`
- 如可自动截图则输出截图，否则写清人工截图路径。

### 4.9 shared 导出包 + 泄漏检测

实现或补齐：

- `pipeline/export.py --tier shared`
- `pipeline/validate_no_private_leak.py`

导出：

- `data/exports/demo_hazardous_waste_internal/`
- `data/exports/shared_hazardous_waste_v1/`
- manifest with sha256, counts, demo_package flag, tier filter declaration

泄漏检测必须失败即非零退出码；shared 包中不得出现：

- `tier=private`
- evidence_requirement 明细
- rectification_template 明细
- report_expression 明细
- enterprise / facility / issue_instance / evidence_instance / rectification_instance / distill_event
- 真实企业信息
- 法条全文

输出：

- `reports/private-leak-check.md`
- `reports/private-leak-check.json`

### 4.10 政府演示叙事彩排

生成 `reports/government-demo-script-hazardous-waste.md`。

必须包含 7 幕：

1. 升级前：只有法条，脱离企业场景
2. 接入现场执行图谱：法条落到行业/场景/问题
3. 高频危废问题出现：5 个精品 issue_type
4. 证据/整改/报告表达闭环：展示“看得见、带不走”
5. 双向缺口报告：法规盲区、管理经验区、踩雷排行
6. shared 包：可进软著/培训/执法工具
7. 回到企业月报：同一张图让报告更自然、更像专家、更可追溯

语言要适合向监控中心主任团队演示：专业、克制、高级，不要夸张营销。

## 5. 建议的执行顺序

按以下顺序推进，不要跳着做 UI：

1. 建工作分支
2. 读取项目文档和 schema
3. 更新 specs/features，补齐本阶段行为合同
4. 补样例数据目录和 5 个 issue_type registry
5. 补 law/tech spec 瘦节点和关系边
6. 补质量评分字段与 schema/验证
7. 生成 internal/shared 执行卡
8. 实现 graph build/export/leak check
9. 实现 gap report
10. 实现 monthly comparison
11. 实现 regulatory consistency checker
12. 实现 graph-ui 最小演示
13. 生成政府演示脚本
14. 跑全量验证，修复失败
15. 生成最终交付报告
16. commit，提交信息使用 conventional commit

## 6. 最终验收

最终必须给出一个 `reports/P1-14day-final-delivery.md`，包含：

- 完成清单
- 产物路径
- 运行命令
- 验证结果
- 未完成项与原因
- 降级项与后续真实接入建议
- 泄漏检测结论
- UI 构建结论
- 政府演示路径

最终命令必须至少尝试运行：

```powershell
pnpm bdd:export
pnpm verify:all
pnpm graph:build
pnpm graph:export:shared
pnpm gap:report
pnpm ui:build
```

若某命令不存在或失败，不要停；先修复。若受外部环境限制无法修复，把替代验证写入最终报告，但不能省略闭环产物。

## 7.唯一成功定义

不是“代码写完”，而是以下条件同时满足：

有 5 个精品危废 issue_type。
有 issue_type registry + aliases。
每个问题有 1-3 个高置信法条/规范瘦节点绑定。
每条关键边有 source_ref、confidence、confidence_evidence、legal_basis_status。
有 5 张 internal 卡和 5 张 shared 卡。
有双向缺口报告。
有月报段落对比。
有监管口径一致性检查。
有 ego 图谱最小演示并能 build。
有 shared 导出包。
泄漏检测 0 失败。
有政府演示叙事脚本。
有最终交付报告。
验证命令尽可能全绿；无法全绿的部分必须有清楚、诚实、可执行的 blocker 说明。
