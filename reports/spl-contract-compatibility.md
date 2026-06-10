# SPL Contract Compatibility

- status: `pass`
- source_commit: `53a3d284d3f2a643e88808b09c6d417516444c9b`
- conflicts: 0

## Checks
- graph-export node/edge/source arrays: `compatible` - 本仓库 graph package 使用 nodes/edges/sources 三段式。
- source_ref required on edges: `compatible` - P1/P2 edge builder 强制写 source_ref。
- confidence required on edges: `compatible` - P1/P2 edge builder 强制写 confidence。
- candidate governance: `extension` - 本仓库沿用 CANDIDATE/HUMAN_REVIEWED/APPROVED_BASELINE,并加 tier/legal_basis_status。
- shared/private/aggregate consumption governance: `extension` - SPL consumption governance 被扩展为三层授权物理过滤。
- full text boundary: `compatible` - 本仓库禁止 law_article/tech_spec/standard_limit 存全文。
