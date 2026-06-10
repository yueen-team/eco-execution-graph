# 上游数据指针(不拷贝)

本目录只放指针与同步说明,不存上游数据副本。

| 上游 | 本地路径 | 消费内容 | 方式 |
|---|---|---|---|
| eco-semantic-knowledge-base | `E:\eco-semantic-knowledge-base` | `data/approved_baseline/`(v1.0 链路、v8.5 污染物域 209 条、v8.6 标准映射、49 条专项检查项)、`manifests/*.json`(hash 校验) | import_baseline.py 只读,按 manifest hash 校验版本 |
| semantic-profile-lab | `E:\semantic-profile-lab` | `contracts/graph-export.v2_1.md`、`contracts/evidence-risk-graph-provenance.v1_9.md` 等契约 | schema 继承,字段差异记录于本文件 |
| EcoCheck | `E:\EcoCheck` | `semantic_event_outbox`(v2 事件,契约见 `E:\knowledge-graph\现场蒸馏-v2-价值字段设计-2026-06-01.md`) | ingest.py 消费(P1 先用导出文件,后接服务) |
| Yunnan-emission-smart-calculator | `E:\Yunnan-emission-smart-calculator` | pollutant_id 标准化字典、dim_type 维度键 | 只共享键;绝不写其 ConfirmedDataset |

## 与 spl graph-export v2.1 的字段差异

- 新增:node/edge `tier`(ADR-0002)、law_article `lineage_ref`(ADR-0003)、edge `confidence_evidence`(ADR-0005)。
- 沿用:node/edge/source 三段式、NDJSON 回放、source_ref 强制、CANDIDATE 治理膜。
