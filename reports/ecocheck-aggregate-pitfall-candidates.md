# EcoCheck 聚合候选生成报告

- status: `blocked`
- batch_id: `pitfall-map:ecocheck-review-preview`
- aggregate_rows: 0
- sample_limited: 0
- leak_violations: 0

## 规则

- 只消费“已通过(待聚合)”或“已进入聚合候选”且允许进入聚合的 graph ETO 审核记录。
- 选择“合并到已有问题类型”时,按合并目标问题类型归并统计。
- 样本企业数少于 5 的组合只进入样本不足池。
- 输出行不得包含企业名、企业 ID、检查记录、整改记录、证据实例或附件路径。
