# P3-4 p2p3_common Refactor

- date: `2026-06-22`
- branch: `codex/p3-4-p2p3-common-schema-gate`
- base: `origin/codex/p3-baseline-freeze-20260622` at `a9020fac6aa42fc7124957deaab364f73040606d`
- reason: `origin/main` did not contain the P3 baseline.
- line count: `pipeline/p2p3_common.py` 1666 -> 1246 lines.

## Split

`pipeline/p2p3_common.py` remains the compatibility facade. Old imports for KB paths, ETO overrides, hazardous-card helpers, graph record factories, IO helpers, and upstream repo helpers still resolve through the facade.

New modules:

- `pipeline/p2p3_paths.py`
- `pipeline/p2p3_io.py`
- `pipeline/p2p3_graph_records.py`
- `pipeline/p2p3_review_overrides.py`
- `pipeline/p2p3_upstream_helpers.py`
- `pipeline/schema_validation.py`

ETO review override data moved to `data/review/eto_review_overrides.json`; `pipeline/p2p3_review_overrides.py` owns the loader.

## GitNexus

- `build_full_graph` impact: LOW; direct callers are `pipeline/source_merge.py`, `pipeline/conflict_resolve.py`, and `pipeline/build_full_graph.py`.
- `build_upstream_lock` impact: HIGH; affected processes include `build_full_graph`, `contract_compatibility`, `import_eco_kb`, and `build_upstream_inventory`.
- Mitigation: public facade preserved; upstream asset traversal order preserved after helper extraction.

## Validation

- `python -m py_compile` touched Python files: pass.
- `python -m unittest tests.test_p2p3_common_refactor tests.test_schema_validation_gate`: pass.
- `pnpm verify:check`: pass.
- `pnpm verify:all`: pass.

## Deployment

No deployment was performed. Environment: local repository only. Command: none. Smoke result: not applicable. Rollback risk: none for CloudBase/graph-api because no deployed environment was changed.
