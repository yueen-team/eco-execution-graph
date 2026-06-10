# 云南环保高频踩雷地图契约 v0

## 定位

踩雷地图不是企业问题清单,而是 aggregate 层产品化视图:为政府监管资源配置、基层培训、行业风险提示提供聚合依据。

## 输入

只允许读取:

- `stat_signal`
- `pitfall_pattern_stat`

禁止读取或输出:

- `enterprise`
- `issue_instance`
- `pitfall_instance`
- `evidence_instance`
- 任何可反推单个企业身份的数据

## 最小输出记录

```jsonc
{
  "region": "州市级区域",
  "industry": "行业",
  "dimension": "危废管理",
  "issue_type_ref": "issue:hw:label-incomplete",
  "law_or_spec_ref": "law:swl:art78",
  "recurrence_rate": 0.37,
  "rectification_difficulty": "medium",
  "sample_size": 12,
  "source_ref": "src:aggregation:2026-06",
  "batch_id": "pitfall-map:2026-06"
}
```

## 规则

1. `sample_size < 5` 不得输出,只能显示"样本不足,不展示"。
2. 第一版默认州市级区域;县区级需要重新评估样本量与脱敏风险。
3. 地图第一阶段可先是离线表格/报告段落,不做大屏。
