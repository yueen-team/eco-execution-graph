# P3 Baseline Freeze - 2026-06-22

Status: `final`.

This is the graph-side P3-0/P3-1/P3-2 consumer acceptance report. It is based on
the local P0/P1/P2 closure branch and validates graph consumption after ontology
and KB final commits were pushed.

## Graph Baseline

- Branch: `codex/p3-baseline-freeze-20260622`
- Validation base commit: `8add28f`
- Base closure branch: `codex/p0-p1-p2-closure-20260622`
- Base closure commit: `8add28f`
- Based on P0/P1/P2 closure: yes
- Main protection: no main merge or main push was performed.

P0/P1 closure evidence remains in
`reports/ecocheck-graph-p0-p1-closure-2026-06-22.json`. That report records
token alignment and synthetic transport checks, and explicitly lists CloudBase
storage-driver proof plus live WeCom scan callback as not verified.

## Upstream Finals

- Ontology final branch: `origin/codex/p3-baseline-freeze`
- Ontology final commit: `13dcd706067f8763546080f33b7dc8d0cfee494d`
- Ontology baseline JSON: `E:\eco-ontology\contracts\p3-baseline.v0.json`
- Ontology KB manifest schema:
  `E:\eco-ontology\schemas\kb_product_manifest.v1.schema.json`
- KB final branch: `origin/codex/kb-p3-build-foundation`
- KB final commit: `5f8245e42280fb9390f2b30b5c783fa0d03527e0`
- KB graph package manifest:
  `E:\eco-semantic-knowledge-base\manifests\graph_kb_package_manifest_v1_0.json`

Consumer surface: no change. KB now has `kb_lib.py` and `kb_build.py`, but graph
does not depend on KB-internal build code. Graph still consumes the package
manifest through `ECO_KB_PACKAGE_MANIFEST` or the default manifest path; no new
local KB path was hard-coded.

## Final Validation

- `pnpm upstream:lock`: pass, locked KB
  `5f8245e42280fb9390f2b30b5c783fa0d03527e0`
- `pnpm upstream:import:eco-kb`: pass, imported 56 show-if rows, 209 pollutant
  baseline rows, 923 standard-link rows, and 49 specialized inspection rows
- `pnpm ontology:validate:blocking`: pass, `red=0 yellow=0 info=0`
- `pnpm verify:check`: pass
- `pnpm --dir graph-api check`: pass
- `pnpm verify:all`: pass
- `pnpm verify:external`: pass on this machine; it remains an external Tencent
  RAG real-smoke gate and is not required by default `verify:all`

## Report Paths

- KB lock: `reports/upstream-lock-report.json`
- KB import: `data/upstream/eco-kb-import.json`
- Ontology blocking: `reports/ontology-contract-blocking-validation.json`
- RAG real smoke: `reports/rag-citation-resolution-report.json`
- P0/P1 closure: `reports/ecocheck-graph-p0-p1-closure-2026-06-22.json`

## Not Verified

- CloudBase storage driver live proof was not performed in this P3 run.
- Enterprise WeCom live scan login callback was not exercised in this P3 run.
- No CloudBase deployment was performed.

## Risk And Follow-Up

Risk: low. The graph consumer manifest path and approved output shape did not
change, and all final graph gates passed against the KB final commit.

Follow-up for the three repos:

- EcoCheck still needs to feed real approved aggregate data for full pitfall-map
  product readiness.
- CloudBase storage diagnostics and live WeCom scan remain external verification
  tasks.
- Ontology baseline JSON records its internal snapshot commit separately from
  the pushed final commit; this graph report references the pushed final commit.
