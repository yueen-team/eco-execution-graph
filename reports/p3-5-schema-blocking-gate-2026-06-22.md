# P3-5 Schema Blocking Gate

- date: `2026-06-22`
- graph branch: `codex/p3-4-p2p3-common-schema-gate`
- ontology final: `origin/codex/p3-5-schema-blocking-gate` / `e136a21422ab221d75c5269e3f1a8c7017651789`
- KB observed by default verify: `origin/codex/kb-p3-6-legacy-script-retirement` / `6190d97bae39c028916c2baa13ee1b0ab13d0a75`
- gate command: `pnpm graph:schema:blocking`
- gate report: `reports/graph-schema-blocking-gate.json` / `.md`
- result: `red=0 yellow=0 info=0`

## Blocking Coverage

| dataset | path | nodes | edges | sources |
|---|---|---:|---:|---:|
| upstream-eco-kb-import | `data/upstream/eco-kb-import.json` | 446 | 912 | 4 |
| upstream-full-graph-source | `data/upstream/full-graph-source.json` | 513 | 1007 | 10 |
| demo-hazardous-waste-internal | `data/exports/demo_hazardous_waste_internal/graph.json` | 67 | 95 | 4 |
| full-internal-product-v1 | `data/exports/full_internal_product_v1/graph.json` | 513 | 1007 | 10 |
| shared-product-v1 | `data/exports/shared_product_v1/graph.json` | 483 | 977 | 6 |
| shared-hazardous-waste-v1 | `data/exports/shared_hazardous_waste_v1/graph.json` | 37 | 65 | 2 |

The gate validates node/source/edge instances against `schema/node.schema.json`, `schema/source.schema.json`, and `schema/edge.schema.json`.

## Negative Proof

`tests/test_schema_validation_gate.py` proves blocking behavior with bad graph data:

- invalid node enum/minLength/missing required fields produce red findings.
- `regulated_by` edges missing `legal_basis_status` produce red findings.

## Schema Decision

`schema/source.schema.json` now declares `contract` and `rag_metadata` as valid source types. These are stable full-graph sources, so this was resolved by extending schema rather than filtering generated data.

## Validation

- `python -m py_compile` touched Python files: pass.
- `pnpm graph:schema:blocking`: pass.
- `pnpm ontology:validate:report-only`: pass, `red=0 yellow=0 info=0`.
- `pnpm ontology:validate:blocking`: pass, `red=0 yellow=0 info=0`.
- `pnpm verify:check`: pass.
- `pnpm --dir graph-api check`: pass.
- `pnpm --dir graph-api test`: pass, 33 tests.
- `pnpm verify:leak`: pass.
- `pnpm verify:all`: pass, including graph-api synthetic intake smoke and 56 pipeline unit tests.

## External Gates

Still manual/report-only outside this graph schema gate: Tencent RAG real smoke, CloudBase/WeCom live scan, government lineage real import, and real EcoCheck aggregate/ETO blind review.

## Deployment

No deployment was performed. Environment: local repository only. Command: none. Smoke result: not applicable. Rollback risk: none for CloudBase/graph-api because no deployed environment was changed.
