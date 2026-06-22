# Ontology contract report-only validation

## Scope

`pnpm ontology:validate:report-only` measures current drift between
eco-execution-graph artifacts and shared ontology contracts. It is report-only:
red findings are migration work, not CI failures.

The validator covers:

- GRAPH-001 nodes in shared graph exports against `schema/node.schema.json`.
- GRAPH-002 edges in shared graph exports against `schema/edge.schema.json`.
- GRAPH-003 sources in shared graph exports against `schema/source.schema.json`.
- GRAPH-004 KB package manifest path/version/hash presence.
- GRAPH-005 KB import CSV required columns.
- GRAPH-006 `ecocheck.semantic_event.v2` fixture against
  `E:\eco-ontology\schemas\semantic_event.v2.schema.json`.

## Inputs

Defaults remain compatible with the current local setup:

- `ECO_KB_ROOT`, default `E:\eco-semantic-knowledge-base`
- `ECO_KB_PACKAGE_MANIFEST`, default
  `E:\eco-semantic-knowledge-base\manifests\approved_baseline_knowledge_manifest_v1_0.json`
- `ECO_ONTOLOGY_ROOT`, default `E:\eco-ontology`
- `ECO_ONTOLOGY_SEMANTIC_EVENT_SCHEMA`, default
  `E:\eco-ontology\schemas\semantic_event.v2.schema.json`

If `ECO_KB_PACKAGE_MANIFEST` points to a manifest under a `manifests` directory
and `ECO_KB_ROOT` is unset, the validator and KB importer derive the KB root
from that manifest path.

## Outputs

- `reports/ontology-contract-report-only-validation.json`
- `reports/ontology-contract-report-only-validation.md`
