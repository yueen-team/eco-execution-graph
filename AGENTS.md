# AI Agent 开发指南 · eco-execution-graph

> 读文档顺序:本文件 → `CONTEXT.md`(业务口径)→ `ARCHITECTURE.md`(架构)→ `docs/brainstorms/2026-06-10-*.md`(需求)→ 任务相关的 `docs/adr/` 与 `specs/`。

## 硬门禁(违反即停)

1. **私有层零泄漏**:`tier=private` 的任何 node / edge / source 不得进入 `data/exports/shared_*` 或聚合导出。改 export 逻辑必须先跑 `verify/` 泄漏契约测试。
2. **企业数据脱敏也不出**:代码、文档、测试夹具、演示数据中不得出现真实企业可识别信息。演示样本用合成企业。
3. **法条全文不进图**:law_article 节点只存 ID/条款号/义务谓词/lineage_ref。发现有人(包括你自己)往节点塞法条全文,拒绝并指向 ADR-0003。
4. **CANDIDATE 治理膜**:ingest 产生的一切默认 CANDIDATE;晋级 approved 必须有人工审核记录;绝不自动写 Yunnan ConfirmedDataset。
5. **密钥**:腾讯云密钥只走环境变量。提交前自查 staged 文件无密钥。
6. **主干保护**:不直接在 main 改代码;合并/推送 main 需 candy 明确批准(git-workflow-hooks 强制)。
7. **行为变更先更新 specs/**:涉及业务流程、AI 输出、报告生成、法规引用、数据解释的变更,先写/改 Gherkin 合同再动代码。
8. **法律依据状态控表达**:`regulated_by` / `manifests_as` 等法律判断边必须有 `legal_basis_status`;candidate/disputed 不得对外引用,no_legal_basis 只能写管理建议。

## 常见任务地图

| 任务 | 入口 | 注意 |
|---|---|---|
| 加节点/边类型 | `schema/node.schema.json` / `edge.schema.json` | 必须定 tier 默认值;更新 ARCHITECTURE §2;大改配 ADR |
| 写/改管道脚本 | `pipeline/`(子模块 AGENTS.md) | 每条边必须带 source_ref + confidence |
| 改 UI | `graph-ui/`(子模块 AGENTS.md) | 只读消费 exports;改动走 frontend-render-proof 留证 |
| 执行卡内容 | `data/candidates/cards/` | 卡片是图切片,不是独立数据;法条引用只存 ID |
| 缺口报告 | `pipeline/gap_report.py` | 三类缺口定义见 ARCHITECTURE §2.3 |
| 上下文装配最小验证 | `docs/api/context-assembly-api.md` + `specs/features/context-assembly-minimum.feature` | P0.5 离线验证,不接正式 EcoCheck |
| 图谱质量评分 | `schema/edge.schema.json` + `docs/api/graph-quality-scoring.md` | 每条边必须能解释 confidence 来源与陈旧风险 |
| 云南踩雷地图 | `docs/api/pitfall-map.md` + `specs/features/yunnan-pitfall-map.feature` | 只消费 aggregate,不得读取企业实例 |
| 监管口径一致性检查 | `docs/api/regulatory-consistency-checker.md` + `specs/features/regulatory-consistency-checker.feature` | 先做内部质量门禁,不得当外部法律认定工具 |
| 导出共有包 | `pipeline/export.py --tier shared` | 跑泄漏测试后才算完成 |
| 验证 | `pnpm verify:all` 或 `.\verify\verify.ps1 all` | AFK 配置在 `verify/afk-test.config.json` |

## 与上游仓库交互规则

- 读 `E:\eco-semantic-knowledge-base` 的 approved baseline:**只读引用**,经 `data/upstream/` 指针;不复制大文件,不反向修改。
- 读 `E:\semantic-profile-lab` 契约:本仓库 schema 是其扩展,字段冲突时以本仓库 schema/ 为准并记录差异。
- EcoCheck outbox 事件:消费 `ecocheck.semantic_event.v2`(契约见 E:\knowledge-graph 蒸馏 v2 spec);事件 schema 变化时先对齐契约文档。

## 验证与交付

- 统一验证入口:`pnpm verify:all`(= schema 校验 + 泄漏契约测试 + pipeline 单测 + UI 构建)。
- AFK 测试以 `verify/afk-test.config.json` 为入口;缺失基线已设 null 并列入 TODO。
- 报告输出:`reports/afk-test-report.md` / `.json`。
- 演示相关改动必须有实际呈现证据(frontend-render-proof):截图或录屏,不接受"构建通过"作为完成证明。

## 禁止事项

- 不引入图数据库依赖(ADR-0006 未解锁前)。
- 不在共有包/聚合导出里实现"例外白名单"机制——过滤逻辑必须无例外。
- 不为演示硬编码假数据冒充蒸馏流(计数器必须接真实事件统计或明示"模拟")。
- 不把 GitNexus 用于领域图谱(它只管代码导航)。
- 不把 shared 共有层当完整产品层;shared 是口径/骨架/统计层,完整能力留在 private + internal runtime。
- 不把执行卡做成独立手工内容库;执行卡必须能由图谱 trace 回放。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **eco-execution-graph** (2328 symbols, 4360 relationships, 182 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/eco-execution-graph/context` | Codebase overview, check index freshness |
| `gitnexus://repo/eco-execution-graph/clusters` | All functional areas |
| `gitnexus://repo/eco-execution-graph/processes` | All execution flows |
| `gitnexus://repo/eco-execution-graph/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
