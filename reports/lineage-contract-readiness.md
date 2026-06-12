# Lineage Contract Readiness

- status: `partial`
- contract_status: `pass`
- government_lineage_real_import: `blocked`
- dataset_status: `contract_fixture`
- exchange_path: `data/candidates/government_lineage_contract_fixture.json`
- supported_edges: replaced_by, amended_by, split_into, merged_into, inherits_from, conflicts_with
- edge_preview_count: 6
- human_review_required: 1

## 关系覆盖
- replaced_by: 1
- amended_by: 1
- split_into: 1
- merged_into: 1
- inherits_from: 1
- conflicts_with: 1

## 诚实边界
- contract fixture passed; no real government_confirmed lineage dataset has been imported
- `conflicts_with` 只进入人工审核清单,不得自动迁移报告引用。
