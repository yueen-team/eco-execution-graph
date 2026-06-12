# 监管口径一致性检查器契约 v0.1

## 定位

输入一段报告结论或月报段落,检查它是否违反法规引用、管理经验、证据链、条款状态和表达强度规则。第一阶段作为内部质量门禁,不作为对外自动法律认定工具。

## 输入

```jsonc
{
  "text": "报告结论文本",
  "trace": {
    "node_ids": [],
    "edge_ids": [],
    "source_ids": []
  },
  "audience": "internal | enterprise | government_demo | shared_export"
}
```

说明:

- `text` 是要检查的报告结论、月报段落或演示口径。
- `trace.node_ids` 指向本结论用到的问题、法条、证据类别等节点。
- `trace.edge_ids` 指向本结论用到的法律判断边、证据边和来源边。
- `trace.source_ids` 指向本结论可追溯的来源。
- 面向企业、政府演示、共有导出时,检查器会比内部草稿更严格。

## 输出

```jsonc
{
  "status": "pass | warning | blocked",
  "findings": [
    {
      "code": "management_advice_miscast_as_law",
      "severity": "blocking",
      "message": "管理经验类问题不得写成违反某法。",
      "trace_ref": "edge:...",
      "guidance": "改成管理建议,不要写违法、违反、依据或根据。",
      "matched_text": "违法"
    }
  ],
  "trace_summary": {
    "law_articles": 1,
    "legal_edges": 2,
    "evidence_chain_present": true
  }
}
```

## 风险码

| code | 触发条件 | ETO/主任能怎么理解 |
|---|---|
| `missing_law_reference` | 引用了不存在、缺 RAG 定位或 trace 未挂接的法条 | 这条法条没有被图谱证明能用于本结论,先不要写条款号 |
| `management_advice_miscast_as_law` | `no_legal_basis` 问题被写成违法/违反 | 现场管理建议不能包装成违法认定 |
| `candidate_or_disputed_basis` | `candidate` / `disputed` 口径被写成依据、根据、违反或违法 | 候选或争议口径必须人工审核 |
| `basis_requires_official_confirmation` | `internal_reviewed` 对外写成确定法律依据 | 内部审核只能写参考相关要求,不能冒充官方口径 |
| `missing_evidence_chain` | 对外确定结论缺 issue/evidence/source 追溯 | 证据链不够时只能写建议核查或管理建议 |
| `law_status_risk` | 引用了已废止、待生效或待确认条款 | 条款状态有风险,先人工复核 |
| `overcommitted_language` | 使用"必然合规/完全合法/保证通过/无任何风险"等表达 | 报告不能替监管或未来检查做保证 |
| `government_position_mismatch` | 与政府确认口径不一致 | 先不上报告、先人工审核 |

## 表达降级规则

| 当前情况 | 不得写 | 建议写 |
|---|---|---|
| `official_confirmed` | 仍不得写过度承诺 | 依据/根据,但必须带 trace |
| `internal_reviewed` | 依据、根据、违法、违反 | 参考相关要求、建议结合监管口径确认 |
| `candidate` | 对外引用、依据、根据、违法、违反 | 内部提示,进入人工审核 |
| `disputed` | 对外引用、依据、根据、违法、违反 | 人工审核,等待口径统一 |
| `no_legal_basis` | 违法、违反、不符合某法 | 管理建议、建议核查、建议完善 |
| 证据链不足 | 必须、应当、违法、违反 | 建议核查、需补充证据后判断 |

## P1 最小实现

- 离线运行;
- 使用 BDD 规则与图谱 trace;
- 先覆盖危废 5 张精品卡与 P0.5 月报段落;
- 输出 blocking/warning/info 三档。

## 命令

```powershell
python pipeline/regulatory_consistency_check.py
python pipeline/regulatory_consistency_check.py --scope full
python -m unittest tests.test_regulatory_consistency_check
```

`--scope full` 优先读取 `data/exports/full_internal_product_v1/graph.json`;如果隔离环境没有该生成目录,降级读取 `data/upstream/full-graph-source.json`,并在报告的 `graph_input` 字段里写明。
