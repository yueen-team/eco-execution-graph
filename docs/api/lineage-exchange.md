# 政府法典沿革交换格式 v1

## 状态

本文件是与政府法典知识库团队对接时的谈判起点。它已经可以被本仓库脚本校验,但当前还没有真实政府沿革数据导入,所以交付报告仍标记为“真实导入待对接”。

## 一句话口径

法条节点仍然是“瘦节点”。沿革不写成字符串备注,而是写成法条到法条的关系边,让旧条款替代、修订、拆分、合并、继承和冲突都能被机器识别。

## 支持的六类关系

| 关系 | 中文含义 | 方向 |
|---|---|---|
| `replaced_by` | 旧条款被新条款整体替代 | 旧条款 -> 新条款 |
| `amended_by` | 旧条款被新条款或修订决定修改 | 旧条款 -> 新条款 |
| `split_into` | 一个旧条款拆成多个新条款 | 旧条款 -> 每个新条款 |
| `merged_into` | 多个旧条款合并进一个新条款 | 每个旧条款 -> 新条款 |
| `inherits_from` | 法典条款继承历史单行法条款 | 历史条款 -> 法典条款 |
| `conflicts_with` | 新旧口径冲突或待解释 | 待解释条款 -> 冲突条款 |

如果政府侧只有“条号变更”这一类口径,第一版先落到 `amended_by`,并在 `authority_note` 写明“仅条号变化”;暂不新增第七类关系,避免早期接口膨胀。

## 交换文件格式

```jsonc
{
  "exchange_version": "government-lineage-exchange.v1",
  "dataset_status": "contract_fixture | draft | government_confirmed",
  "authority": "政府法典知识库团队或双方约定名称",
  "generated_at": "YYYY-MM-DD",
  "records": [
    {
      "lineage_id": "lineage:gov:000001",
      "old_law_id": "law:swl:art78",
      "old_citation": "固体废物污染环境防治法 第七十八条",
      "new_law_id": "code:eco:artXXXX",
      "new_citation": "生态环境法典 第XXXX条",
      "relation": "replaced_by | amended_by | split_into | merged_into | inherits_from | conflicts_with",
      "effective_date": "YYYY-MM-DD",
      "authority_doc_ref": "官方沿革文件或法典知识库记录号",
      "authority_locator": "页码、章节、记录号或接口定位符",
      "authority_note": "官方说明摘要,不得放法规全文",
      "status": "contract_fixture | draft | government_confirmed",
      "review_status": "CANDIDATE | HUMAN_REVIEWED | APPROVED_BASELINE"
    }
  ]
}
```

## 进入图谱后的边

每条记录会变成一条 `law_article -> law_article` 边:

```jsonc
{
  "edge_id": "lineage:gov:000001",
  "from": "law:swl:art78",
  "to": "code:eco:artXXXX",
  "edge_type": "inherits_from",
  "tier": "shared",
  "source_ref": "src:government-lineage:gov-lineage-2026",
  "confidence": 0.9,
  "confidence_reason": ["GOVERNMENT_CONFIRMED"],
  "evidence_count": 1,
  "last_verified_at": "YYYY-MM-DD",
  "reviewer_role": "GOVERNMENT",
  "staleness_risk": "low",
  "review_status": "HUMAN_REVIEWED",
  "attrs": {
    "old_citation": "固体废物污染环境防治法 第七十八条",
    "new_citation": "生态环境法典 第XXXX条",
    "effective_date": "YYYY-MM-DD",
    "authority_doc_ref": "官方沿革文件或法典知识库记录号",
    "authority_locator": "页码、章节、记录号或接口定位符",
    "authority_note": "官方说明摘要"
  }
}
```

注意:这里仍然只放引用定位和说明摘要,不得放法规全文。

## 导入门槛

- `dataset_status=contract_fixture` 只能用于本仓库测试和谈判样例,不得写成真实接入。
- `dataset_status=draft` 可以进入候选区,但不得迁移对外报告引用。
- `dataset_status=government_confirmed` 且每条记录 `status=government_confirmed` 后,才允许把边标记为可迁移依据。
- 任一记录缺少 `authority_doc_ref` 或 `authority_locator`,只能做人工待核对清单。
- `conflicts_with` 不自动迁移引用,必须进入人工审核。

## 双方价值

- 政府 → 我方:法典生效后,图谱全部法律引用沿关系化 lineage 边自动迁移(ADR-0003),并能标出拆分、合并、替代、修订、冲突等待解释情况。
- 我方 → 政府:每条法典条款获得"行业现场落地视图"(经 shared 包:条款 → 义务 → 问题分类 → 踩雷点 → 行业分布统计)。
