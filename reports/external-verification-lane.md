# External Verification Lane

- lane_id: `GRAPH-RAG-REAL-SMOKE`
- mode: `external`
- status: `pass`
- checked_at_utc: `2026-06-22T17:41:56Z`
- rag_real_smoke: `pass`
- tokenhub_probe: `pass`
- rag_retrieve_probe: `pass`
- source_level_review_queue_size: 27
- blocking_now: `false`
- environment_scoped_blocking_candidate: `true`

## Preflight
- TENCENT_LKE_SECRET_ID: configured=true
- TENCENT_LKE_SECRET_KEY: configured=true
- TENCENT_LKE_KNOWLEDGE_BASE_IDS: configured=true
- tokenhub_deepseek_api_key: configured=true via TENCENT_TOKENHUB_API_KEY, TENCENT_LKEAP_API_KEY

## Steps
- rag-resolve: `pass` exit=0
- rag-real-gate: `pass` exit=0

## Redaction Boundary
- secret_values_recorded: false
- env_values_recorded: false
- raw_rag_content_recorded: false
- raw_cached_true_count: 0
- non_empty_excerpt_count: 0

## Promotion Decision
- decision: `candidate_after_repeat_evidence`
- global_ontology_blocking: `no`
- required_before_blocking:
  - repeat pass evidence in the target CI or hosted runtime
  - documented secret injection and outage policy for that runtime
  - explicit ADR cutover that scopes the gate to environments with Tencent credentials
