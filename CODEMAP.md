# 代码地图 · eco-execution-graph

## 目录结构

```
eco-execution-graph/
├── README.md / ARCHITECTURE.md / CODEMAP.md / AGENTS.md / CONTEXT.md
├── docs/
│   ├── adr/                  # 架构决策记录 0001-0009
│   ├── api/                  # 图谱导出格式 + 上下文装配 API 契约
│   ├── brainstorms/          # 需求文档(CE brainstorm 产物)
│   ├── plans/                # 阶段实施计划
│   └── references/           # 外部资源引用清单
├── specs/                    # BDD 行为规格(Gherkin)+ 术语表 + 开放问题
│   └── features/
├── schema/                   # JSON Schema 单一事实源
│   ├── node.schema.json      # 节点(含 tier、类型枚举)
│   ├── edge.schema.json      # 边(含 source_ref、confidence、tier、legal_basis_status)
│   ├── source.schema.json    # 溯源记录(含 tier,防 source 泄漏)
│   └── card.schema.json      # 法条↔现场执行卡
├── pipeline/                 # Python 构建管道(子 AGENTS.md)
│   ├── ingest.py             # EcoCheck outbox v2 事件 → CANDIDATE 图记录
│   ├── import_baseline.py    # eco-kb approved baseline → 骨架节点
│   ├── normalize.py          # 问题类型/别名归一
│   ├── build_graph.py        # candidates+approved → 全量图(JSON+NDJSON)
│   ├── export.py             # tier 过滤导出(shared/aggregate 包)
│   ├── gap_report.py         # 双向缺边检测报告
│   └── validate_no_private_leak.py  # 拒绝型泄漏契约测试
├── graph-ui/                 # Cytoscape.js ego 视图(Vite,子 AGENTS.md)
├── data/
│   ├── upstream/             # 上游 baseline 指针(README,不拷贝数据)
│   ├── candidates/           # CANDIDATE 数据(含 cards/)
│   ├── approved/             # 人工审核通过数据
│   └── exports/              # 导出产物(全量/共有/聚合包 + manifest)
├── verify/
│   ├── verify.ps1            # 统一验证入口(check/test/leak/build/all)
│   └── afk-test.config.json  # AFK 测试工程协议配置
├── reports/                  # 验证与 AFK 报告输出
├── scripts/git-workflow/     # git hooks 脚本(来自 yueen-team/git-workflow-hooks)
└── .husky/                   # husky 入口(pre-commit/commit-msg/pre-push); 刷新上游后用 hooks:install --path .husky
```

## 常用命令

```powershell
pnpm install                  # 首次:依赖 + husky hooks 激活
pnpm graph:build              # python pipeline/build_graph.py
pnpm graph:export:shared      # 导出共有包(自动跑泄漏测试)
pnpm gap:report               # 生成双向缺口报告
pnpm ui:dev                   # 演示驾驶舱开发服务器
pnpm ui:build                 # 演示打包
pnpm bdd:export               # Gherkin → Cucumber Messages NDJSON
pnpm verify:all               # 统一验证(= .\verify\verify.ps1 all)
.\verify\verify.ps1 leak      # 单跑私有层零泄漏契约测试
```

## 导航提示

- 找业务口径 → `CONTEXT.md` → `specs/_glossary.md`
- 找"为什么这么设计" → `docs/adr/`(按编号)
- 找数据结构 → `schema/`(JSON Schema 即文档)
- 找"什么能导出什么不能" → `AGENTS.md` 硬门禁 §1-2 + ADR-0002
- 改报告/法规引用行为 → 先看 `specs/features/`
