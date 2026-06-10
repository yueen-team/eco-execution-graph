# 政府 lineage 数据交换格式 v0(占位)

## 状态

待与监控中心法典知识库团队对接校准(specs/open-questions Q4)。本文件先定义我方期望的最小格式,作为谈判起点。

## 我方期望的最小记录

```jsonc
{
  "old_law_id": "law:swl:art78",        // 现行单行法条款(我方 node_id 或双方约定 ID)
  "old_citation": "固体废物污染环境防治法 第七十八条",
  "new_law_id": "code:eco:artXXXX",     // 生态环境法典条款
  "relation": "replaced_by | amended_by | split_into | merged_into | inherits_from | conflicts_with | renumbered_as",
  "effective_date": "YYYY-MM-DD",
  "authority_note": "官方解释/沿革说明引用"
}
```

## 双方价值

- 政府 → 我方:法典生效后,图谱全部法律引用沿关系化 lineage 边自动迁移(ADR-0003),并能标出拆分、合并、替代、修订、冲突等待解释情况。
- 我方 → 政府:每条法典条款获得"行业现场落地视图"(经 shared 包:条款 → 义务 → 问题分类 → 踩雷点 → 行业分布统计)。
