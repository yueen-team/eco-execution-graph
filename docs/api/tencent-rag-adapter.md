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

Current verified smoke:

- TokenHub DeepSeek chat: `tokenhub-chat` passes with `deepseek-v4-flash-202605`.
- Tencent API 3.0 embedding: credentials work, but `GetEmbedding` may fail when the account resource package is exhausted.
- RAG retrieval: `RetrieveKnowledge` passes through TC3 signing with `TENCENT_LKE_SECRET_ID` / `TENCENT_LKE_SECRET_KEY` and returns `Records` metadata for both configured knowledge bases.

`TENCENT_LKEAP_RAG_API_KEY` remains reserved for Bearer-token RAG endpoints, but Bearer direct calls to `lkeap.tencentcloudapi.com` are not the verified path in this project. ADP app citation retrieval is a fallback path only.

## Cache boundary

The resolver may keep only title and metadata summaries from RetrieveKnowledge. `Content`, raw response bodies, full law text, and full technical-standard text must not be cached in graph packages, shared exports, or citation reports. `excerpt` defaults to an empty string until a separately reviewed safe-short-excerpt policy is approved.
