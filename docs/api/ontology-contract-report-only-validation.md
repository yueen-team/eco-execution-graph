# Ontology contract validation

## Scope

`pnpm ontology:validate:report-only` measures current drift between
eco-execution-graph artifacts and shared ontology contracts. It is report-only:
red findings are migration work, not CI failures.

`pnpm ontology:validate:blocking` runs the same checks as a release/CI gate.
It writes a separate blocking report and exits non-zero when any red or yellow
finding appears. The default `pnpm verify:check` and `pnpm verify:all` include
this blocking gate.

`pnpm graph:schema:blocking` is the P3-5 graph data-vs-schema gate. It uses the
same lightweight `pipeline/schema_validation.py` helper as report-only contract
validation, but validates current graph datasets directly against
`schema/node.schema.json`, `schema/edge.schema.json`, and
`schema/source.schema.json`. The default `pnpm verify:check` and
`pnpm verify:all` include this blocking gate after ontology contract blocking.

The validator covers:

- GRAPH-001 nodes in shared graph exports against `schema/node.schema.json`.
- GRAPH-002 edges in shared graph exports against `schema/edge.schema.json`.
- GRAPH-003 sources in shared graph exports against `schema/source.schema.json`.
- GRAPH-004 KB package manifest path/version/hash presence.
- GRAPH-005 KB import CSV required columns.
- GRAPH-006 `ecocheck.semantic_event.v2` fixture against
  `E:\eco-ontology\schemas\semantic_event.v2.schema.json`.
- GRAPH-007 `ecocheck.profile_gap_confirmed.v1` fixture against
  `E:\eco-ontology\schemas\profile_gap_confirmed.v1.schema.json`.
- GRAPH-008 KB product package manifest instance against
  `E:\eco-ontology\schemas\kb_product_manifest.v1.schema.json` when the formal
  ontology schema is available. If the ontology schema is not yet present, the
  graph validator keeps direct path/version/hash checks and records an info
  finding.
- P3-5 graph schema blocking coverage:
  `data/upstream/eco-kb-import.json`,
  `data/upstream/full-graph-source.json`,
  `data/exports/demo_hazardous_waste_internal/graph.json`,
  `data/exports/full_internal_product_v1/graph.json`,
  `data/exports/shared_product_v1/graph.json`, and
  `data/exports/shared_hazardous_waste_v1/graph.json`.

## Inputs

Defaults remain compatible with the current local setup:

- `ECO_KB_ROOT`, default `E:\eco-semantic-knowledge-base`
- `ECO_KB_PACKAGE_MANIFEST`, default
  `E:\eco-semantic-knowledge-base\manifests\graph_kb_package_manifest_v1_0.json`
- `ECO_ONTOLOGY_ROOT`, default `E:\eco-ontology`
- `ECO_ONTOLOGY_SEMANTIC_EVENT_SCHEMA`, default
  `E:\eco-ontology\schemas\semantic_event.v2.schema.json`
- `ECO_ONTOLOGY_PROFILE_GAP_SCHEMA`, default
  `E:\eco-ontology\schemas\profile_gap_confirmed.v1.schema.json`
- `ECO_ONTOLOGY_KB_PRODUCT_MANIFEST_SCHEMA`, default
  `E:\eco-ontology\schemas\kb_product_manifest.v1.schema.json`

If `ECO_KB_PACKAGE_MANIFEST` points to a manifest under a `manifests` directory
and `ECO_KB_ROOT` is unset, the validator and KB importer derive the KB root
from that manifest path.

## Outputs

- `reports/ontology-contract-report-only-validation.json`
- `reports/ontology-contract-report-only-validation.md`
- `reports/ontology-contract-blocking-validation.json`
- `reports/ontology-contract-blocking-validation.md`
- `reports/graph-schema-blocking-gate.json`
- `reports/graph-schema-blocking-gate.md`

Blocking pass criteria:

- `red=0`
- `yellow=0`
- no schema drift in graph exports
- no schema drift in current upstream/full/shared graph datasets
- no forbidden raw attachment/GPS/secret/full-law-text fields in EcoCheck fixtures
- no KB manifest path/hash/version mismatch

## P3-4 Helper Boundaries

`pipeline/p2p3_common.py` remains the compatibility facade for older pipeline
imports. New code should import focused helpers directly:

- `pipeline/p2p3_paths.py`: KB manifest/root resolution and stable graph paths.
- `pipeline/p2p3_io.py`: local path rendering, git command, CSV and Markdown helpers.
- `pipeline/p2p3_graph_records.py`: node/edge/source record factories and ID/confidence helpers.
- `pipeline/p2p3_review_overrides.py`: ETO review override data loader and hazardous-waste card helpers.
- `pipeline/p2p3_upstream_helpers.py`: upstream repo metadata and lock asset collection.
- `pipeline/schema_validation.py`: shared lightweight JSON Schema instance validator.

## P3 KB Consumer Acceptance

P3-1/P3-2 changes in `eco-semantic-knowledge-base` are accepted by graph only
after the KB branch has a final commit/hash and graph reruns the consumer gates.
Pre-final KB snapshots may be recorded as interim evidence, but must not be
reported as final green.

Graph-side acceptance commands:

- `pnpm upstream:lock`
- `pnpm upstream:import:eco-kb`
- `pnpm ontology:validate:blocking`
- `pnpm verify:check`
- `pnpm --dir graph-api check`
- `pnpm verify:all`

`pnpm verify:external` remains a separate Tencent RAG real-smoke gate. A real
external pass or fail must be reported honestly, and default `pnpm verify:all`
does not depend on Tencent SecretId/network availability.

Graph consumes KB through `ECO_KB_PACKAGE_MANIFEST` or the default
`manifests/graph_kb_package_manifest_v1_0.json` package manifest. New KB build
helpers such as `kb_lib.py` or `kb_build` are KB-internal unless the final
manifest path, hashes, or output shape changes.
