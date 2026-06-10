# pipeline 子模块指南

## 模块边界

输入:EcoCheck outbox v2 事件、eco-kb approved baseline、法规抽取稿、人审结果。
输出:`data/candidates` / `data/approved` / `data/exports`(图 JSON+NDJSON、共有包、聚合包、缺口报告)。
**只此模块可写 data/**;graph-ui 只读。

## 脚本职责(规划,P1 起实装)

| 脚本 | 职责 | 风险点 |
|---|---|---|
| `ingest.py` | outbox v2 事件 → CANDIDATE node/edge/source | 事件 schema 对齐蒸馏 v2 spec;一切产物 CANDIDATE |
| `import_baseline.py` | eco-kb baseline → 骨架节点(只读上游) | 经 data/upstream 指针,不拷贝、不反写 |
| `normalize.py` | 问题类型 canonical+aliases 归一 | 归一映射须人审,不得自动合并 |
| `build_graph.py` | 合成全量图,双形态输出 | 校验:每边 source_ref 可解析、tier 必填 |
| `export.py` | tier 过滤导出 + manifest/hash | 前置调用 validate_no_private_leak,失败即中止 |
| `gap_report.py` | 三类缺口检测 | 管理经验类问题不得静默挂接低置信法条 |
| `validate_no_private_leak.py` | 拒绝型契约测试 | 风格参照 eco-kb validate_runtime_preintegration_contracts |

## 约定

- Python 3.11+,标准库优先;确需第三方依赖,先在 specs/open-questions 登记再引入。
- 每个脚本可独立运行亦可被 verify.ps1 调用,退出码非 0 即失败。
- confidence 来源默认值表维护在 `pipeline/confidence_defaults.json`(P1 建立)。
- 常见任务:改边类型 → 同步 schema/edge.schema.json + ARCHITECTURE §2.3 + 本表。

## 验证

`.\verify\verify.ps1 test`(pipeline 单测)+ `.\verify\verify.ps1 leak`(泄漏契约)。
