# 图谱质量评分契约 v0

## 定位

`confidence` 是边的最终可信度分数,但不能单独作为可信依据。每条边必须提供可解释质量元数据,让政府侧、ETO 与内部审核能看见"这条关联来自多少次现场、谁审核、最近何时验证、是否可能过期"。

## EdgeQuality 字段

```jsonc
{
  "confidence": 0.82,
  "confidence_reason": [
    "ETO_CONFIRMED",
    "RECTIFICATION_VERIFIED",
    "LAW_MAPPING_REVIEWED"
  ],
  "evidence_count": 17,
  "last_verified_at": "2026-06-10",
  "reviewer_role": "ETO",
  "staleness_risk": "low"
}
```

## 规则

1. `confidence_reason` 至少一项,不得只给分数不给理由。
2. `evidence_count` 是现场事件、审核记录、整改验证或聚合样本的数量。
3. `last_verified_at` 用 YYYY-MM-DD,用于陈旧风险评估。
4. `staleness_risk=high` 的边不得静默进入对外报告,必须提示人工复核。
5. `regulated_by` / `manifests_as` 的高置信边必须有法律映射审核或政府确认理由。

## P1 最小实现

- 写入 schema 字段;
- 在执行卡和 ego 图边详情中展示;
- 在监管口径一致性检查器中将 high staleness 作为 warning/blocking 风险。
