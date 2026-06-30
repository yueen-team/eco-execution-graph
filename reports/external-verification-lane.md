# External Verification Lane

- lane_id: `GRAPH-EXTERNAL-VERIFICATION`
- mode: `external`
- status: `failed`
- checked_at_utc: `2026-06-30T02:04:30Z`
- source_commit: `3f7c46b89335` (dirty)
- credentials_present: `true`
- required_gate_ids: `GRAPH-RAG-REAL-SMOKE`
- rag_real_smoke: `failed`
- tokenhub_probe: `pass`
- rag_retrieve_probe: `failed`
- source_level_review_queue_size: 27
- blocking_now: `false`
- environment_scoped_blocking_candidate: `false`

## Preflight
- TENCENT_LKE_SECRET_ID: configured=true
- TENCENT_LKE_SECRET_KEY: configured=true
- TENCENT_LKE_KNOWLEDGE_BASE_IDS: configured=true
- tokenhub_deepseek_api_key: configured=true via TENCENT_TOKENHUB_API_KEY, TENCENT_LKEAP_API_KEY

## External Gates

| gate | status | reason |
| --- | --- | --- |
| GRAPH-RAG-REAL-SMOKE | `failed` | Tencent RAG real smoke did not pass. |
| ECOCHECK-GRAPH-PUSH-REAL-SMOKE | `blocked` | EcoCheck graph smoke report location is not configured. |
| ECOCHECK-AGGREGATE-ETO-BLIND-REVIEW | `blocked` | Requires real aggregate rows plus ETO blind review of desensitized monthly samples. |
| GOVERNMENT-LINEAGE-REAL-IMPORT | `blocked` | Requires a government_confirmed lineage exchange dataset, not only the contract fixture. |
| ETO-REVIEW-COPILOT-LLM-SMOKE | `blocked` | Copilot LLM smoke report is missing; run the graph-api copilot LLM smoke against TokenHub with only desensitized whitelist payload. |

## Steps
- rag-resolve: `pass` exit=0
- rag-real-gate: `failed` exit=1

## Redaction Boundary
- secret_values_recorded: false
- env_values_recorded: false
- raw_rag_content_recorded: false
- raw_cached_true_count: 0
- non_empty_excerpt_count: 0

## Promotion Decision
- decision: `remain_report_only`
- global_ontology_blocking: `no`
- required_before_blocking:
  - repeat pass evidence in the target CI or hosted runtime
  - documented secret injection and outage policy for that runtime
  - explicit ADR cutover that scopes each gate to environments with its required credentials or data
