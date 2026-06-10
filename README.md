# 环保现场执行图谱(eco-execution-graph)

> 让法规条款落到真实企业现场:法律法规 × 技术规范 × 现场排查经验的关联图谱。
> 第一刀:危废域《法条↔现场执行卡》+ 双向缺口报告 + 交互式 ego 图谱演示。

## 这是什么

环保管家行业首创的"现场执行图谱":把"行业 → 产污场景 → 污染源 → 污染物 → 标准 → 技术规范 → 法规条款 ↔ 现场问题 → 证据 → 整改 → 报告表达"连成一张带溯源、带置信度、带三层授权标签的图。

- **现场经验为内容**(EcoCheck 每月 100+ 家企业的蒸馏流),**公开标准为骨架**;
- **每条边带 source_ref + confidence**,置信度由真实整改成效"挣"出来;
- **三层授权**:共有层(可与政府共建/软著)、私有层(商业壁垒,永不导出)、聚合层(只出统计不出个体);
- **法条全文不进图**:图里是瘦节点 + 义务谓词 + 法典沿革指针,全文从腾讯云知识引擎 RAG 取。

## 快速开始

```powershell
# 1. 安装依赖(首次)
pnpm install
# 2. 构建图谱(从上游 baseline + 候选数据)
pnpm graph:build
# 3. 启动 ego 图谱 UI
pnpm ui:dev
# 4. 统一验证入口
pnpm verify:all      # 或 .\verify\verify.ps1 all
```

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 图数据 | JSON / NDJSON + JSON Schema 2020-12 | 沿用 semantic-profile-lab graph-export v2.1 三段式(nodes/edges/sources),不上图数据库(见 ADR-0006) |
| 构建管道 | Python 3.11+(标准库优先) | 沿用 eco-semantic-knowledge-base 的 build_*.py 风格 |
| 可视化 | Cytoscape.js + Vite | ego 视图,不做全图毛线球(见 ADR-0009) |
| 法规全文 | 腾讯云知识引擎原子能力 + RAG 组件 | 图谱是法规检索的瘦索引,不是法规副本(见 ADR-0003) |
| 行为合同 | Gherkin(coco830/gherkin-v39-cli) | specs/ 下 BDD 合同,`pnpm bdd:export` |
| Git 门禁 | coco830/git-workflow-hooks | pre-commit / commit-msg / pre-push,主干保护 |

## 文档导航

| 文档 | 内容 |
|---|---|
| `ARCHITECTURE.md` | 架构设计、模块边界、数据流、外部依赖 |
| `CODEMAP.md` | 代码组织与常用命令 |
| `AGENTS.md` | AI Agent 开发约束与常见任务 |
| `CONTEXT.md` | 业务领域知识、术语、合作背景、授权红线 |
| `docs/brainstorms/2026-06-10-*.md` | 需求文档(产品决策的单一来源) |
| `docs/adr/` | 架构决策记录(9 条) |
| `docs/api/` | 图谱导出格式与上下文装配 API 契约 |
| `specs/` | BDD 行为规格 + 术语表 + 开放问题 |

## 上游与姊妹项目

- `coco830/eco-semantic-knowledge-base`(E:\eco-semantic-knowledge-base):approved baseline 知识来源(v1.0 链路 / v8.5 污染物域 / v8.6 标准映射)
- `coco830/semantic-profile-lab`(E:\semantic-profile-lab):图模型与治理契约来源(node/edge/source、CANDIDATE 门禁)
- `coco830/ecocheck`(E:\EcoCheck):现场蒸馏流来源(semantic_event_outbox,v2 字段设计见 E:\knowledge-graph)
- `coco830/Yunnan-emission-smart-calculator`:污染物标准化键与系数维度(本期只共享键,不接核算)

## 项目状态

P0(骨架与契约)进行中。分期见 `ARCHITECTURE.md` §7。
