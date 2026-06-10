你这个长程任务，**不应该只写成“接入腾讯云 RAG + 读取两个 GitHub 仓库”**。那样 Codex 很容易做成几个 adapter，然后产出一堆“已接入”的假报告。

正确目标应该是：

```text
把腾讯云 RAG 原子知识库、eco-semantic-knowledge-base、semantic-profile-lab
全部升级为 eco-execution-graph 的强制上游；
让 P1 危废切片从 demo seed 驱动，升级为 upstream baseline + RAG citation + contract governance 驱动；
最终形成可见张主任的产品化样板，而不是 MVP demo。
```

这个目标现在有基础：P1 已经 `verify:all` 全绿，包含 graph-build、graph-quality、gap-report、monthly-compare、regulatory-consistency、shared-export、private-leak-contract、ui-build 等全链路验证。 shared 泄漏检测当前是 `violations: []`。 监管口径检查当前也是 `findings: []`。 但最终报告也明确写了，当前法规全文还是 `rag_doc_ref` 占位，真实上游 outbox、真实 RAG、政府 lineage 尚未接入。 所以下一个长程目标就是把这些“占位”变成“真实产品化上游”。

我建议不要把全部内容硬塞进一个 `/goal`。你应该让 Codex 先创建一个目标文件，然后用短 `/goal` 指向它。

---
# 一、先让 Codex 创建目标文件

你可以先发给 Codex：

```text
请在 docs/goals/P2P3-rag-upstream-full-productization.md 创建以下目标文件。创建后不要开始实现，只确认文件已写入。
```

然后粘贴下面这份正文。

---

````markdown
# P2P3 · RAG 原子知识库 + GitHub 双上游整合 · 全量产品化长程目标

## 0. 总目标

在 `E:\eco-execution-graph` 内，把当前 P1 危废精品切片从「结构真实 demo」升级为「内容真实、引用真实、上游真实、治理真实、可见张主任的产品化样板」。

本任务的核心不是继续手工扩展 P1 demo seed，而是把以下三类上游升级为强制数据源：

1. 腾讯云知识引擎原子能力 + RAG 组件：作为法律法规、技术规范、标准条款全文与权威引用后端。
2. `coco830/eco-semantic-knowledge-base`：作为环保业务 approved baseline 上游，提供行业、产污场景、污染源、污染物、标准、技术规范、检查项、问题链路、污染物标准映射等业务骨架。
3. `coco830/semantic-profile-lab`：作为图谱契约与治理上游，提供 graph-export、provenance、candidate governance、consumption governance、manual adoption、review/status 等契约基线。

最终成功不是“代码写完”，而是形成一个可以严肃判断“是否适合见张主任”的产品化交付包：

- full internal graph package；
- full shared graph package；
- RAG citation resolution report；
- upstream utilization report；
- eco-kb import coverage report；
- semantic-profile-lab contract compatibility report；
- full execution card index；
- full gap report；
- full regulatory consistency check；
- full private leak check；
- full monthly report comparison；
- Yunnan pitfall map full version；
- 张主任演示产品包；
- P2P3 final delivery report；
- `zhang_director_ready: yes | no | conditional` 的诚实结论。

## 1. 必读上下文

开始实现前，按顺序阅读并遵守：

1. `AGENTS.md`
2. `CONTEXT.md`
3. `ARCHITECTURE.md`
4. `CODEMAP.md`
5. `README.md`
6. `docs/plans/2026-06-10-phase-one-hazardous-waste-slice.md`
7. `reports/P1-14day-final-delivery.md`
8. `reports/graph-quality-report.md`
9. `reports/private-leak-check.json`
10. `reports/regulatory-consistency-check.json`
11. `reports/render-proof/README.md`
12. `pipeline/AGENTS.md`
13. `graph-ui/AGENTS.md`
14. `schema/*.schema.json`
15. `specs/features/*.feature`
16. `docs/api/*.md`
17. `docs/adr/*.md`
18. `data/upstream/README.md`

如果本目标与 AGENTS、ADR、schema、specs 冲突，以硬门禁为准。本目标只能补充，不得放松项目红线。

## 2. 不停顿执行协议

这是全量实施任务，不是咨询任务。

不要再问“是否继续 / 是否开始 / 是否确认范围”。除非遇到以下情况，否则必须继续推进，并把降级、阻塞、替代验证写入最终报告：

1. 需要真实腾讯云密钥但环境变量缺失；
2. 需要真实企业数据且会进入提交、demo、shared 包、测试、文档或报告；
3. 需要 push / merge main；
4. 发现 existing export 逻辑会导致 private 泄漏；
5. 发现法条全文、技术规范全文或 RAG raw full text 将进入 graph.json / graph.ndjson / shared 包；
6. 需要政府侧未提供的 lineage 正式数据，且没有可用 contract fixture；
7. 两个上游 GitHub 仓库无法访问，且本地也不存在可读取副本。

遇到缺信息时按以下策略继续：

1. 首选读取本地上游路径：
   - `E:\eco-semantic-knowledge-base`
   - `E:\semantic-profile-lab`
2. 本地不存在时，尝试使用 GitHub 仓库：
   - `https://github.com/coco830/eco-semantic-knowledge-base`
   - `https://github.com/coco830/semantic-profile-lab`
3. 若 GitHub 或本地都不可用，不得伪造“已接入”；必须生成 adapter、contract、fixture、blocked report，并在最终报告中标记 `upstream_real_import: blocked`。
4. 腾讯云 RAG 若没有密钥，允许使用 fixture 跑 contract test，但最终报告必须标记 `rag_real_smoke: blocked`。
5. 如果某条法条无法从 RAG 真实 resolved，不得在报告中写“依据/根据”，只能写“参考相关要求”或“需结合监管口径确认”。
6. 不得为了漂亮数字伪造 RAG 解析、伪造上游导入、伪造蒸馏统计、伪造 review_status。
7. 不能完成真实接入时，继续完成 contract、schema、验证、报告和 blocker 说明；不要中途停。

## 3. 硬红线

必须遵守：

1. `tier=private` 不得进入任何 `data/exports/shared_*` 或 aggregate 导出。
2. 真实企业数据、脱敏企业数据、真实客户名、真实照片、真实台账不得进入 demo、测试、文档、shared 包或提交。
3. `law_article`、`tech_spec`、`standard_limit` 节点不得存全文，只能存 ID、名称、条款号、义务谓词、`rag_doc_ref`、`lineage_ref`、`effective_status`、`source_ref` 等瘦字段。
4. 腾讯云密钥只走环境变量，不得写入代码、文档、fixture、日志、manifest、reports。
5. RAG raw response 若含全文，只能进入 gitignored local cache，不得入库。
6. ingest / import 产生的一切默认 CANDIDATE 或沿用上游 review_status；自动脚本不得把候选事实直接晋级 approved。
7. 涉及法规引用、RAG、报告生成、监管口径、导出隔离、AI 输出降级、上游导入策略的行为变化，先更新 `specs/features/*.feature`。
8. 不引入 Neo4j、Graphiti、RDF 或其他图数据库；继续使用 JSON / NDJSON + Python pipeline。
9. 不把 GitNexus 用于领域图谱。
10. 不把 P1 demo seed 冒充 full product 上游。
11. 不用“UI 看不见”代替物理过滤；shared 包必须真实不含 private 内容。
12. 不为演示硬编码假结论冒充真实上游、真实 RAG、真实蒸馏流。

## 4. 强制上游使用规则

P2P3 必须把 `eco-semantic-knowledge-base` 与 `semantic-profile-lab` 从“参考资料”升级为“强制上游”。

不得仅基于 P1 demo seed 扩展 full graph。

必须实现：

1. 锁定两个上游仓库的 commit SHA、branch、remote URL、可用资产清单、manifest hash，输出：
   - `data/upstream/upstream-lock.json`
   - `reports/upstream-lock-report.md`
   - `reports/upstream-lock-report.json`

2. 从 `eco-semantic-knowledge-base` 导入或识别以下 approved baseline 资产：
   - industry / 行业画像；
   - process_scenario / 产污场景；
   - pollution_source / 污染源；
   - pollutant / 污染物；
   - standard_limit / 标准限值；
   - pollutant-standard link / 污染物-标准映射；
   - tech_spec / 技术规范；
   - inspection_item / 检查项；
   - issue_type / 问题类型；
   - issue aliases / 同义归一；
   - rectification/report 非私有骨架；
   - score13 或环保维度映射；
   - specialized inspection items；
   - hazardous waste baseline；
   - pollutant domain approved baseline；
   - 其他仓库 manifest 声明的 approved baseline。

3. 从 `semantic-profile-lab` 读取或识别以下治理契约：
   - graph-export v2.1；
   - provenance contract；
   - candidate governance；
   - graph consumption governance；
   - manual adoption to review field；
   - evidence-risk graph link；
   - evidence-risk graph provenance；
   - schema / contract / manifest 相关文档；
   - blocked action / runtime protection 规则。

4. 输出上游利用报告：
   - `reports/upstream-utilization-report.md`
   - `reports/upstream-utilization-report.json`

报告必须列明 full graph 中每类节点、边、source、card 分别来自：
   - eco-kb；
   - semantic-profile-lab；
   - P1 seed；
   - RAG citation；
   - EcoCheck fixture；
   - manual fixture；
   - blocked / skipped。

5. 若没有 `upstream-utilization-report`，不得在最终报告中使用“全量内容化”“full product”“可见张主任”这类结论。

## 5. 腾讯云 RAG 原子知识库接入

### 5.1 新增或增强模块

必须新增或增强：

- `pipeline/rag_client.py`
- `pipeline/rag_resolve.py`
- `pipeline/rag_cache.py`
- `pipeline/rag_contract_test.py`
- `docs/api/tencent-rag-adapter.md`
- `docs/api/rag-doc-ref-registry.md`
- `specs/features/rag-citation-resolution.feature`
- `.env.example`

### 5.2 Adapter 接口

实现统一 adapter：

```python
resolve_citation(
    rag_doc_ref: str,
    law_name: str | None = None,
    article_no: str | None = None,
    tech_spec_no: str | None = None,
    query_hint: str | None = None
) -> RagCitationResult
````

返回结构至少包含：

```json
{
  "status": "resolved | not_found | ambiguous | api_error | blocked | fixture_only",
  "provider": "tencent_lke_rag",
  "rag_doc_ref": "...",
  "law_name": "...",
  "article_no": "...",
  "tech_spec_no": "...",
  "citation_title": "...",
  "citation_locator": "...",
  "excerpt": "...",
  "source_hash": "...",
  "resolved_at": "...",
  "raw_cached": false,
  "cache_policy": "metadata_only | local_gitignored | disabled"
}
```

规则：

1. `excerpt` 只能作为短引用片段或报告引用快照，不得写回 graph 节点。
2. 不得把完整法规全文、技术规范全文写入 graph、card、shared 包。
3. raw response 只能进入 gitignored local cache；默认不提交。
4. 如果环境变量缺失，返回 `blocked` 或 `fixture_only`，不得伪装真实 RAG 已接入。
5. 如果密钥存在，必须跑真实 smoke test。
6. P1 5 张精品卡相关 law_article / tech_spec 必须优先 resolved。
7. full graph 所有 law_article / tech_spec 必须生成 citation resolution 状态。
8. 没有 resolved 的引用不得进入对外报告的“依据/根据”表达。

### 5.3 环境变量

`.env.example` 必须只放占位符，真实密钥不得入库：

```env
TENCENT_LKE_SECRET_ID=
TENCENT_LKE_SECRET_KEY=
TENCENT_LKE_REGION=
TENCENT_LKE_APP_ID=
TENCENT_LKE_KNOWLEDGE_BASE_ID=
TENCENT_LKE_ENDPOINT=
TENCENT_RAG_TIMEOUT_SECONDS=30
TENCENT_RAG_CACHE_DIR=.cache/tencent-rag
```

### 5.4 RAG 解析报告

输出：

* `reports/rag-citation-resolution-report.md`
* `reports/rag-citation-resolution-report.json`

报告必须包含：

1. law_article 总数；
2. tech_spec 总数；
3. 有 `rag_doc_ref` 的数量；
4. resolved 数；
5. not_found 数；
6. ambiguous 数；
7. api_error 数；
8. blocked 数；
9. fixture_only 数；
10. P1 5 张精品卡引用解析结果；
11. full execution cards 引用解析覆盖率；
12. 哪些引用不得进入对外报告；
13. `rag_real_smoke: pass | blocked | failed`；
14. 是否满足“可见张主任”的 RAG 条件。

## 6. eco-semantic-knowledge-base 导入

### 6.1 新增或增强模块

必须新增或增强：

* `pipeline/upstream_discover.py`
* `pipeline/import_eco_kb.py`
* `pipeline/import_baseline.py`
* `pipeline/upstream_inventory.py`
* `pipeline/upstream_lock.py`
* `specs/features/upstream-eco-kb-import.feature`

### 6.2 读取策略

优先读取：

1. `E:\eco-semantic-knowledge-base`
2. GitHub clone / GitHub API
3. repository archive / fixture
4. blocked report

不得反向修改上游仓库。不得复制大文件进本仓库。允许在 `data/upstream/` 放指针、manifest、hash、lock，不放上游原始大文件。

### 6.3 导入内容

从 eco-kb 尽可能导入 approved baseline：

* industry；
* process_scenario；
* pollution_source；
* pollutant；
* standard_limit；
* pollutant-standard relation；
* tech_spec；
* inspection_item；
* issue_type；
* issue aliases；
* dimension / score13 mapping；
* hazardous waste baseline；
* pollutant domain approved baseline；
* standard link map；
* specialized inspection items；
* show_if / scenario activation rules；
* issue / rectification / report 的 shared 骨架；
* source / manifest / hash / review_status。

无法导入的资产必须记录原因：

```json
{
  "asset": "...",
  "status": "imported | skipped | blocked | unsupported | not_found",
  "reason": "...",
  "path": "...",
  "source_commit": "..."
}
```

### 6.4 导入报告

输出：

* `reports/eco-kb-import-coverage.md`
* `reports/eco-kb-import-coverage.json`

报告必须包含：

1. 发现资产清单；
2. 已导入资产清单；
3. 跳过资产清单；
4. 每类节点数量；
5. 每类边数量；
6. 每类 source 数量；
7. review_status 分布；
8. tier 分布；
9. 与 P1 seed 的重复/冲突；
10. 冲突处理策略；
11. 未导入但值得后续人工对齐的资产。

## 7. semantic-profile-lab 契约接入

### 7.1 新增或增强模块

必须新增或增强：

* `pipeline/import_spl_contracts.py`
* `pipeline/contract_compatibility.py`
* `pipeline/contract_validate.py`
* `specs/features/spl-contract-compatibility.feature`

### 7.2 读取策略

优先读取：

1. `E:\semantic-profile-lab`
2. GitHub clone / GitHub API
3. repository archive / fixture
4. blocked report

不得反向修改上游仓库。不得将本仓库 schema 盲目覆盖为 SPL schema。本仓库 schema 是扩展层；冲突必须报告。

### 7.3 契约兼容性检查

必须检查：

1. graph-export node / edge / source 三段式兼容性；
2. source_ref 必填兼容性；
3. confidence 必填兼容性；
4. provenance 字段兼容性；
5. review_status 状态兼容性；
6. CANDIDATE → human-reviewed → approved 治理兼容性；
7. consumption governance 与 shared/private/aggregate tier 的兼容性；
8. manual adoption / review field 与本仓库人工审核逻辑兼容性；
9. 本仓库新增字段 `tier`、`lineage_ref`、`legal_basis_status`、`confidence_reason`、`confidence_evidence` 是否可作为 SPL 扩展；
10. 任何字段命名冲突、语义冲突、枚举冲突、导出格式冲突。

### 7.4 输出报告

输出：

* `reports/spl-contract-compatibility.md`
* `reports/spl-contract-compatibility.json`

报告必须包含：

1. 读取到的 SPL 契约列表；
2. 每个契约的 commit / path / hash；
3. compatible / extension / conflict / blocked 分类；
4. 本仓库 schema 与 SPL 的差异；
5. 需要人工确认的差异；
6. 自动 contract test 结果；
7. 是否可以作为 full graph 生产契约。

## 8. Full Graph 构建

### 8.1 新增或增强模块

必须新增或增强：

* `pipeline/build_full_graph.py`
* `pipeline/build_graph.py --scope full`
* `pipeline/normalize.py`
* `pipeline/quality_score.py`
* `pipeline/source_merge.py`
* `pipeline/conflict_resolve.py`

### 8.2 构建原则

full graph 必须由以下来源合成：

1. eco-kb approved baseline；
2. SPL contract/provenance；
3. P1 hazardous waste seed；
4. RAG citation metadata；
5. optional EcoCheck fixture；
6. optional government lineage fixture；
7. manual demo fixture。

P1 seed 只能作为示例和兼容性资产，不得成为 full graph 主来源。

每个 node / edge / source 必须带：

* `tier`
* `source_ref`
* `review_status`
* `confidence`
* `confidence_reason`
* `confidence_evidence`
* `evidence_count`
* `last_verified_at`
* `reviewer_role`
* `staleness_risk`
* `legal_basis_status`，适用于法律/规范相关边
* `export_allowed`
* `origin_repo`
* `origin_commit`
* `origin_asset`
* `origin_hash`

### 8.3 冲突处理

如果 eco-kb、P1 seed、manual fixture 中出现同名问题、同义问题、同一 law ref、同一 standard ref，必须：

1. 尝试 canonical 合并；
2. 保留 aliases；
3. 保留所有 source_ref；
4. 降低自动置信度或标记 `needs_review`；
5. 输出 conflict report；
6. 不得静默覆盖。

输出：

* `reports/full-graph-conflicts.md`
* `reports/full-graph-conflicts.json`

### 8.4 Full Graph 包

输出：

* `data/exports/full_internal_product_v1/graph.json`
* `data/exports/full_internal_product_v1/graph.ndjson`
* `data/exports/full_internal_product_v1/manifest.json`
* `data/exports/shared_product_v1/graph.json`
* `data/exports/shared_product_v1/graph.ndjson`
* `data/exports/shared_product_v1/manifest.json`

manifest 必须包含：

```json
{
  "package_name": "full_internal_product_v1",
  "scope": "full_product",
  "demo_package": false,
  "contains_real_enterprise_data": false,
  "rag_connected": true,
  "rag_real_smoke": "pass | blocked | failed",
  "upstream_real_import": "pass | partial | blocked",
  "eco_kb_commit": "...",
  "spl_commit": "...",
  "nodes": 0,
  "edges": 0,
  "sources": 0,
  "cards": 0,
  "sha256": {}
}
```

如果不能确认 `demo_package: false`，不得标 false。若仍含 fixture，应标 `demo_package: true` 或 `partial_fixture: true`。

## 9. 执行卡规模化生成

### 9.1 新增或增强模块

必须新增或增强：

* `pipeline/card_generate.py`
* `pipeline/card_rank.py`
* `pipeline/card_trace.py`
* `specs/features/execution-card-generation.feature`

### 9.2 生成规则

从 full graph 自动生成执行卡，不再只停留在 P1 5 张卡。

每个 `issue_type` 如果具备以下链路之一，即可生成 card candidate：

1. `issue_type -> regulated_by -> law_obligation -> obligation_of -> law_article`
2. `law_article -> law_obligation -> manifests_as -> issue_type`
3. `issue_type -> pollutant -> standard_limit -> tech_spec/law_article`
4. `issue_type -> pitfall_of -> law_article/issue_type`

卡片分级：

* `showcase`：适合张主任演示；
* `ready`：可内部审核；
* `candidate`：链路不完整，不能对外展示；
* `blocked`：法规/RAG/source/tier 不满足。

每张卡必须有：

* card_id
* title
* root_issue_type 或 root_law_article
* dimension
* field_manifestations
* related_obligations
* law_refs
* tech_spec_refs
* rag_citation_status
* evidence_summary
* rectification_summary
* report_expression_summary
* pitfalls
* graph_slice_refs
* source_trace
* tier_policy
* render_views：internal/shared
* quality_score
* legal_basis_status
* show_or_not_for_director_demo

### 9.3 最低目标

最低目标：

1. full card candidates 不少于 50 张；
2. showcase 卡不少于 20 张；
3. 危废 showcase 卡不少于 10 张；
4. 每张 showcase 卡 RAG citation 必须 resolved 或有明确人工替代说明；
5. 每张 shared 卡不得含 private 细节；
6. 所有卡必须能 trace 回 graph node / edge / source / origin repo / commit。

如果真实上游内容不足，不得伪造 50 张；必须生成 candidate/blocked 并解释原因。

输出：

* `data/candidates/cards/full_internal_cards.json`
* `data/candidates/cards/full_shared_cards.json`
* `reports/execution-card-index.md`
* `reports/execution-card-index.json`
* `reports/showcase-card-pack.md`
* `reports/showcase-card-pack.json`

## 10. Shared 导出包与泄漏检测增强

### 10.1 增强模块

必须增强：

* `pipeline/export.py`
* `pipeline/validate_no_private_leak.py`
* `specs/features/tier-export-isolation.feature`

### 10.2 shared 包禁止内容

`data/exports/shared_product_v1/` 中不得出现：

1. `tier=private`
2. enterprise
3. facility
4. discharge_outlet
5. risk_unit
6. issue_instance
7. evidence_requirement 明细
8. evidence_instance
9. rectification_template 明细
10. rectification_instance
11. report_expression 明细
12. distill_event
13. 真实企业信息
14. 脱敏企业信息
15. 真实照片路径
16. 真实台账字段
17. 完整法规全文
18. 完整技术规范全文
19. raw RAG response
20. `.env`
21. secret / token / access key
22. local cache
23. private runtime placeholder 的可反推细节

shared 包可以保留：

* industry
* process_scenario
* pollution_source
* pollutant
* standard_limit
* tech_spec 瘦节点
* law_article 瘦节点
* law_obligation
* issue_type
* pitfall_class
* evidence_category 概念级字段
* aggregate stat_signal，满足最小样本数
* “内部执行标准已建立 N 条”的占位摘要，不含具体私有内容。

输出：

* `reports/private-leak-check-full.md`
* `reports/private-leak-check-full.json`

必须 `violations: []`。只要有 violation，最终报告必须标 `zhang_director_ready: no`。

## 11. 监管口径一致性检查增强

### 11.1 增强模块

必须增强：

* `pipeline/regulatory_consistency_check.py`
* `specs/features/law-citation-traceability.feature`

### 11.2 检查项

必须检查：

1. RAG 未 resolved 的法条不得写“依据/根据”。
2. `candidate` 不得作为确定法律依据。
3. `internal_reviewed` 只能写“参考相关要求”或“建议结合监管口径确认”。
4. `official_confirmed` 才能写“依据/根据”。
5. law_article 必须有法规名和条款号。
6. tech_spec 必须有规范名、编号或条款定位。
7. 引用全文必须来自 RAG result，不得来自模型记忆。
8. 管理建议不得写成违法。
9. shared 卡不得引用 private 证据标准明细。
10. 报告段落必须有 citation trace。
11. 法条全文不得进图。
12. full graph 不得出现 raw RAG full text。
13. `no_legal_basis` 不得被写成“不符合某法”。
14. disputed 口径必须进入人工审核。
15. `legal_basis_status` 缺失必须报错。

输出：

* `reports/regulatory-consistency-check-full.md`
* `reports/regulatory-consistency-check-full.json`

必须 `findings: []`。只要有 findings，最终报告必须标 `zhang_director_ready: no` 或 `conditional`。

## 12. Full Gap Report 与云南踩雷地图

增强：

* `pipeline/gap_report.py`
* `pipeline/pitfall_map.py`
* `specs/features/gap-report.feature`

输出：

* `reports/gap-report-full.md`
* `reports/gap-report-full.json`
* `reports/yunnan-pitfall-map-full.md`
* `reports/yunnan-pitfall-map-full.json`

必须区分：

1. 法条义务无现场覆盖；
2. 现场问题无法条依据；
3. RAG 未解析引用；
4. 技术规范无问题挂载；
5. 问题有现场高频但法律依据弱；
6. 高频踩雷点；
7. 行业/区域聚合统计；
8. private 不出细节；
9. shared 可出培训口径；
10. 适合张主任演示的 top 10 缺口。

## 13. 月报回灌与 Context Assembly 增强

增强或新增：

* `pipeline/context_assembly.py`
* `pipeline/monthly_report_compare.py`
* `docs/api/context-assembly-api.md`
* `specs/features/context-assembly.feature`

目标：

1. 基于 full graph 生成至少 5 个合成企业场景；
2. 每个场景生成普通模板段落 vs 图谱上下文装配段落；
3. 装配段落必须包含：

   * 企业/行业场景；
   * issue_type；
   * 证据类别；
   * 法条瘦节点；
   * RAG citation；
   * 整改方向；
   * 管理建议与法律依据边界；
   * source_trace；
   * 禁止表达检查。
4. 输出 ETO 评分表模板；
5. 明确证明：图谱装配版比普通 AI 段落更自然、更像专家、更可追溯、更贴近企业场景。

输出：

* `reports/monthly-report-comparison-full.md`
* `reports/monthly-report-comparison-full.json`
* `reports/context-assembly-demo-bundles.json`
* `reports/eto-review-sheet.md`

## 14. 张主任演示产品包

生成：

* `reports/zhang-director-product-demo-script.md`
* `reports/zhang-director-product-demo-checklist.md`
* `reports/government-shared-package-readme.md`
* `reports/product-positioning-one-page.md`
* `reports/what-we-can-give-government.md`
* `reports/what-we-must-not-give-government.md`
* `reports/zhang-director-readiness.md`
* `reports/zhang-director-readiness.json`

演示叙事必须避免“我们做了一个 demo”的口吻，要表达：

```text
你们有法条，我们补现场；
你们有法规知识库，我们补行业场景；
你们有执法工具，我们补企业真实问题；
你们有案例，我们补日常蒸馏；
这套图谱不是资料库，而是法条落地到现场的执行层。
```

必须明确：

1. 哪些可给政府：

   * shared 包；
   * 行业/场景/污染物/标准/规范/法条瘦节点；
   * issue_type 分类法；
   * pitfall_class；
   * 概念级 evidence_category；
   * aggregate 统计；
   * 缺口报告 shared 摘要；
   * 培训用执行卡 shared 版。
2. 哪些只能演示不能交付：

   * internal runtime；
   * private 层存在性；
   * 证据标准明细；
   * 整改模板；
   * 报告表达模板；
   * 真实蒸馏工作流。
3. 哪些绝不出去：

   * 单个企业数据；
   * 脱敏企业数据；
   * 真实照片；
   * 真实台账；
   * issue_instance；
   * evidence_instance；
   * rectification_instance；
   * report_expression 明细；
   * raw RAG response；
   * 密钥；
   * local cache。
4. shared 包如何进软著、培训、基层执法工具；
5. RAG 引文如何保证法律原文权威；
6. 我方如何保留商业壁垒；
7. 他们的法典 lineage 未来如何接入。

## 15. graph-ui 演示止血，不做完整审美重构

当前阶段不做完整 UI 视觉重构，但必须让 UI 不再只是 MVP demo。

增强 `graph-ui/`：

1. 新增“主任演示模式”按钮；
2. 固定 5 幕路径：

   * 只有法条；
   * 法条落到行业/场景/问题；
   * 现场问题连接证据类别；
   * shared/internal 切换，展示“看得见、带不走”；
   * 打开缺口报告、踩雷地图、月报对比。
3. 主路径高亮；
4. 非主路径透明度降低；
5. 默认只显示关键节点标签；
6. hover / click 显示完整标签；
7. 右侧执行卡增加“为什么重要”摘要；
8. 展示 RAG citation status；
9. 展示 origin_repo / source_ref / review_status / legal_basis_status；
10. 展示 full graph / shared graph 包切换；
11. 不引入大型 UI 依赖；
12. 不重做最终高端视觉设计；
13. render-proof 必须有截图或 manifest。

输出：

* `reports/render-proof-p2p3/README.md`
* `reports/render-proof-p2p3/manifest.json`

如果自动截图可用，输出：

* `reports/render-proof-p2p3/desktop-director.png`
* `reports/render-proof-p2p3/desktop-shared.png`
* `reports/render-proof-p2p3/mobile-director.png`

如果截图不入 commit，manifest 必须记录路径、bytes、sha256、viewport、commit、manual command。

必须执行：

```powershell
pnpm ui:build
```

## 16. 政府 lineage 预留，不作为阻塞

新增或增强：

* `docs/api/lineage-exchange.md`
* `pipeline/import_lineage.py`
* `specs/features/law-lineage-migration.feature`

目标：

1. 定义政府法典 lineage 最小交换格式；
2. 支持 old_law_article -> new_code_article；
3. 支持 replaced_by、amended_by、split_into、merged_into、inherits_from、conflicts_with；
4. 如果无真实政府数据，用 fixture 跑 contract；
5. 不把 lineage 缺失作为 P2P3 阻塞；
6. 在最终报告中标记 `government_lineage_real_import: blocked | partial | pass`。

输出：

* `reports/lineage-contract-readiness.md`
* `reports/lineage-contract-readiness.json`

## 17. 单测与 Contract Tests

P1 当前 pipeline-unit 为空或 baseline=null 的状态不能继续作为 P2P3 的长期状态。

新增最小 tests：

* `tests/test_upstream_lock.py`
* `tests/test_eco_kb_import.py`
* `tests/test_spl_contract_compatibility.py`
* `tests/test_rag_contract.py`
* `tests/test_no_full_text_in_graph.py`
* `tests/test_no_private_leak_full.py`
* `tests/test_regulatory_consistency_full.py`
* `tests/test_card_trace.py`

若项目不引入 pytest，可用 Python stdlib `unittest`。不要为了测试引入重依赖。

测试至少覆盖：

1. upstream lock 存在；
2. eco-kb 导入能产生节点/边/source 或明确 blocked；
3. SPL contract compatibility 能输出报告；
4. RAG contract 在无密钥时返回 blocked/fixture_only；
5. graph 中不含法条全文；
6. shared 包不含 private；
7. regulatory findings 为 0；
8. card 可以 trace 到 graph；
9. manifest sha256 可验证；
10. source_ref 必填。

## 18. package.json scripts

补齐或增强 scripts：

```json
{
  "upstream:lock": "python pipeline/upstream_lock.py",
  "upstream:inventory": "python pipeline/upstream_inventory.py",
  "upstream:import:eco-kb": "python pipeline/import_eco_kb.py",
  "upstream:contracts:spl": "python pipeline/import_spl_contracts.py",
  "upstream:compat": "python pipeline/contract_compatibility.py",
  "rag:resolve": "python pipeline/rag_resolve.py",
  "rag:contract": "python pipeline/rag_contract_test.py",
  "graph:build:full": "python pipeline/build_full_graph.py",
  "cards:generate:full": "python pipeline/card_generate.py --scope full",
  "graph:export:full:internal": "python pipeline/export.py --scope full --tier internal",
  "graph:export:full:shared": "python pipeline/export.py --scope full --tier shared",
  "leak:full": "python pipeline/validate_no_private_leak.py --scope full",
  "regulatory:check:full": "python pipeline/regulatory_consistency_check.py --scope full",
  "gap:report:full": "python pipeline/gap_report.py --scope full",
  "pitfall:map:full": "python pipeline/pitfall_map.py --scope full",
  "monthly:compare:full": "python pipeline/monthly_report_compare.py --scope full",
  "demo:pack": "python pipeline/demo_pack.py",
  "delivery:p2p3": "python pipeline/final_delivery_p2p3.py"
}
```

命令名可根据现有脚本风格调整，但最终报告必须列明真实命令。

## 19. 最终验证命令

必须至少尝试执行并修复：

```powershell
pnpm bdd:export
pnpm upstream:lock
pnpm upstream:inventory
pnpm upstream:import:eco-kb
pnpm upstream:contracts:spl
pnpm upstream:compat
pnpm rag:contract
pnpm rag:resolve
pnpm graph:build
pnpm graph:quality
pnpm graph:build:full
pnpm cards:generate:full
pnpm graph:export:shared
pnpm graph:export:full:shared
pnpm gap:report
pnpm gap:report:full
pnpm monthly:compare
pnpm monthly:compare:full
pnpm pitfall:map
pnpm pitfall:map:full
pnpm regulatory:check
pnpm regulatory:check:full
pnpm leak:full
pnpm ui:build
pnpm demo:pack
pnpm verify:all
```

若某命令不存在，先补 scripts。若受外部环境限制无法通过，必须写入最终报告，并说明：

* blocker；
* 替代验证；
* 是否影响张主任演示；
* 是否影响 shared 包；
* 是否影响法律引用；
* 是否影响数据安全。

## 20. 最终交付报告

生成：

* `reports/P2P3-rag-upstream-full-productization-final.md`
* `reports/P2P3-rag-upstream-full-productization-final.json`

最终报告必须包含：

1. 完成清单；
2. 分支与 commit；
3. 运行命令；
4. 验证结果；
5. 产物路径；
6. upstream lock；
7. eco-kb import coverage；
8. SPL contract compatibility；
9. RAG citation coverage；
10. full graph 节点/边/source/card 数量；
11. full shared 包节点/边/source/card 数量；
12. full execution card 分级；
13. showcase card 数量；
14. private leak 结论；
15. regulatory consistency 结论；
16. no full text in graph 结论；
17. monthly comparison 结论；
18. gap report 结论；
19. pitfall map 结论；
20. UI build 结论；
21. render-proof 结论；
22. 张主任演示就绪度；
23. safe_to_show；
24. must_not_show；
25. blocked；
26. degraded；
27. not_done；
28. next_steps；
29. P3 UI 高端重构建议。

最终报告必须包含：

```json
{
  "zhang_director_ready": "yes | no | conditional",
  "reason": "...",
  "safe_to_show": [],
  "must_not_show": [],
  "blockers": [],
  "recommended_demo_order": [],
  "rag_real_smoke": "pass | blocked | failed",
  "upstream_real_import": "pass | partial | blocked",
  "private_leak_violations": 0,
  "regulatory_findings": 0
}
```

## 21. 张主任就绪判断规则

只有同时满足以下条件，才能标记：

```json
"zhang_director_ready": "yes"
```

条件：

1. P1 原验证继续全绿；
2. eco-kb 至少有真实上游资产被导入；
3. SPL 至少有真实契约被读取并生成 compatibility report；
4. P1 5 张精品卡核心 law / tech spec 引用真实 RAG resolved，或有人工可解释替代；
5. full shared 包生成；
6. full shared 包 private leak violations = 0；
7. full regulatory findings = 0；
8. graph 中没有法条全文、技术规范全文、raw RAG full text；
9. showcase 卡不少于 20 张，或报告中解释真实上游不足导致 conditional；
10. UI 有主任演示模式并 build 通过；
11. render-proof manifest 存在；
12. `reports/zhang-director-product-demo-script.md` 存在；
13. `reports/what-we-must-not-give-government.md` 存在；
14. 最终报告明确 safe_to_show / must_not_show。

以下情况必须标记 `no`：

1. private leak 有任一 violation；
2. regulatory findings 非空且未修复；
3. 法条全文进入 graph；
4. RAG 解析被伪造；
5. 上游导入被伪造；
6. 真实企业数据进入 demo/shared/report；
7. 密钥进入提交；
8. 没有最终报告。

以下情况标记 `conditional`：

1. RAG 密钥缺失但 contract/fixture 全部通过；
2. eco-kb 或 SPL 只能部分读取；
3. 政府 lineage 尚未真实接入；
4. UI 只是演示止血，未达到最终审美；
5. showcase 卡不足 20 张但原因清楚。

## 22. 本阶段不做什么

1. 不做完整高端 UI 视觉重构；
2. 不引入图数据库；
3. 不接真实企业数据进演示包；
4. 不把政府 lineage 当作阻塞项；
5. 不改 EcoCheck runtime；
6. 不反向修改 eco-kb 或 SPL；
7. 不把 RAG 当成业务图谱替代品；
8. 不把 full text 塞进图；
9. 不把 P1 seed 当 full product；
10. 不为演示做无法追溯的硬编码结论。

## 23. 提交要求

实现完成后：

1. 保证工作树干净；
2. 提交到当前工作分支或新建工作分支，不直接改 main；
3. commit message 使用 conventional commit；
4. 不 push main；
5. 最终响应中报告：

   * branch；
   * commit；
   * verify result；
   * RAG real smoke result；
   * upstream import result；
   * private leak result；
   * regulatory result；
   * zhang_director_ready；
   * final report path。

````

---
