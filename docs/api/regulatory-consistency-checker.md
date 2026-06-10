# 监管口径一致性检查器契约 v0

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

## 输出

```jsonc
{
  "status": "pass | warning | blocked",
  "findings": [
    {
      "code": "management_advice_miscast_as_law",
      "severity": "blocking",
      "message": "管理经验类问题不得写成违反某法。",
      "trace_ref": "edge:..."
    }
  ]
}
```

## 第一版风险码

| code | 触发条件 |
|---|---|
| `missing_law_reference` | 引用了不存在或不可追溯的法条 |
| `management_advice_miscast_as_law` | `no_legal_basis` 问题被写成违法/违反 |
| `candidate_or_disputed_basis` | `candidate` / `disputed` 法律判断被对外引用 |
| `missing_evidence_chain` | 问题、证据、法条、source_ref 任一断链 |
| `law_status_risk` | 引用了已废止、待生效或待确认条款 |
| `overcommitted_language` | 使用"必然/保证/已完全合规"等过度承诺表达 |
| `government_position_mismatch` | 与已确认政府口径不一致 |

## P1 最小实现

- 离线运行;
- 使用 BDD 规则与图谱 trace;
- 先覆盖危废 5 张精品卡与 P0.5 月报段落;
- 输出 blocking/warning/info 三档。
