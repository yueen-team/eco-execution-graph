# ADR-0005 置信度由真实成效"挣"出来,不手填

- 状态:Accepted(2026-06-10)
- 来源:2026-06-01 审计意见 #2

## 决策

边的 `confidence` 初始值由来源类型给出(法规抽取/baseline 导入/ESO 候选/ETO 确认各有默认),之后由闭环事件**自动回写**:`RECTIFICATION_VERIFIED` 提升、`RECTIFICATION_REJECTED` 降低关联边置信度。例:某整改建议历史 41/50 次验收通过 → 0.82。

`confidence` 必须配套质量解释字段,不得只给孤立分数:

```json
{
  "confidence": 0.82,
  "confidence_reason": ["ETO_CONFIRMED", "RECTIFICATION_VERIFIED", "LAW_MAPPING_REVIEWED"],
  "evidence_count": 17,
  "last_verified_at": "2026-06-10",
  "reviewer_role": "ETO",
  "staleness_risk": "low"
}
```

## 理由

手设 HIGH/MEDIUM 是静态编纂;权重靠现实结果挣来,图才是学习系统。这是 L∞ 飞轮在图上的原生机制,也是"整改建议按真实一次通过率排序回灌"的数据基础。

## 后果

- confidence 回写在 P5(第二刀)实装,但 schema 从现在就要求每条边带 confidence + 来源默认值表(`pipeline/` 维护)。
- UI 按 confidence 着色,演示时可直观展示"这条建议被现场验证过 N 次"。
- P1 起边详情、执行卡和监管口径一致性检查器必须展示/使用质量解释字段;`staleness_risk=high` 不得静默进入对外报告。
