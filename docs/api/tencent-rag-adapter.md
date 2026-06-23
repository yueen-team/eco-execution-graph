# Tencent RAG Adapter

`resolve_citation(...)` is represented by `pipeline/rag_resolve.py` for P2P3. It resolves citation metadata for `law_article`, `tech_spec`, and `standard_limit` nodes without writing full text into graph packages.

Status values: `resolved`, `not_found`, `ambiguous`, `api_error`, `blocked`, `fixture_only`.

## Citation metadata contract

Every normalized citation record must expose these stable fields:

- `provider`: current value `tencent_lke_rag`
- `rag_doc_ref`: external document reference, never raw text
- `node_id` / `node_type`: graph thin node identity
- `law_name`: law or technical-standard display name
- `article_no`: law article number when available
- `tech_spec_no`: technical-standard number when available
- `citation_title`: safe title from node or RAG metadata
- `citation_locator`: most specific safe locator available
- `source_hash`: source or metadata hash
- `resolved_at`: resolution date
- `raw_cached`: always `false`
- `cache_policy`: current value `metadata_only`
- `retrieval_probe`: current value `RetrieveKnowledge`
- `report_usage_policy`: output policy for report generation

`citation_locator` must not stay at `source-level` when RetrieveKnowledge metadata or the graph node provides a safer, more specific locator. The resolver should prefer:

1. explicit metadata locator;
2. law article number;
3. technical-standard number;
4. section or heading metadata;
5. page metadata such as `ChunkPageNumbers`;
6. `source-level` only when the above are all missing.

When a citation remains `source-level`, `reports/rag-citation-resolution-report.md` must list it with a reason. This is not a failure by itself, but it is an ETO/governance review queue.

Current real smoke boundary:

- Default `pnpm verify:all` does not call the external Tencent RAG real smoke.
  Contract validation, graph build, leak checks, API tests, and synthetic intake
  smoke must stay green without Tencent SecretId/network access.
- `pnpm verify:external` or `pnpm verify:rag:real` runs the graph external
  verification lane: `pnpm external:verify`. By default the lane requires only
  `GRAPH-RAG-REAL-SMOKE`; additional gates can be made fail-closed with
  `GRAPH_EXTERNAL_REQUIRED_GATES=all` or a comma-separated gate subset.
- For the RAG gate, the lane performs credential/config preflight, then runs
  `pnpm rag:resolve` followed by `pnpm rag:real:gate` when the external
  environment is configured.
- The external lane writes `reports/external-verification-lane.json` and `.md`.
  These reports record only environment variable names/configured booleans,
  step status, sanitized errors, citation counts, and promotion posture. They
  must not record secret values, raw RAG `Content`, full law text, or full
  technical-standard text.
- A real smoke failure such as missing SecretId, invalid SecretKey, quota, or
  network timeout means the Tencent external dependency is not verified. It does
  not by itself indicate a contract/intake regression.
- A passing external lane marks `GRAPH-RAG-REAL-SMOKE` as an
  environment-scoped blocking candidate after repeat evidence and an ADR
  cutover. It does not promote the default ontology or graph gates by itself.
- ADR-0012 accepts the owner-repo cutover boundary: `pnpm verify:external` may
  be blocking only in a credentialed/data-bearing external CI lane, while
  default `pnpm verify:all` remains independent from Tencent availability.
  The same lane now reserves fail-closed surfaces for EcoCheck live graph push,
  real aggregate plus ETO blind review, and government-confirmed lineage import.

Previously verified smoke:

- TokenHub DeepSeek chat: `tokenhub-chat` passes with `deepseek-v4-flash-202605`.
- Tencent API 3.0 embedding: credentials work, but `GetEmbedding` may fail when the account resource package is exhausted.
- RAG retrieval: `RetrieveKnowledge` passes through TC3 signing with `TENCENT_LKE_SECRET_ID` / `TENCENT_LKE_SECRET_KEY` and returns `Records` metadata for both configured knowledge bases.

`TENCENT_LKEAP_RAG_API_KEY` remains reserved for Bearer-token RAG endpoints, but Bearer direct calls to `lkeap.tencentcloudapi.com` are not the verified path in this project. Tencent ADP is not part of this project's knowledge-base path; citation retrieval is direct RAG suite retrieval, and generation/checking is handled by TokenHub DeepSeek.

## Cache boundary

The resolver may keep only title and metadata summaries from RetrieveKnowledge. `Content`, raw response bodies, full law text, and full technical-standard text must not be cached in graph packages, shared exports, or citation reports. `excerpt` defaults to an empty string until a separately reviewed safe-short-excerpt policy is approved.
