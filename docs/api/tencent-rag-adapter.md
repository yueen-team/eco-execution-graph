# Tencent RAG Adapter

`resolve_citation(...)` is represented by `pipeline/rag_resolve.py` for P2P3. It resolves citation metadata for `law_article`, `tech_spec`, and `standard_limit` nodes without writing full text into graph packages.

Status values: `resolved`, `not_found`, `ambiguous`, `api_error`, `blocked`, `fixture_only`.

Current verified smoke:

- TokenHub DeepSeek chat: `tokenhub-chat` passes with `deepseek-v4-flash-202605`.
- Tencent API 3.0 embedding: credentials work, but `GetEmbedding` may fail when the account resource package is exhausted.
- RAG retrieval: `RetrieveKnowledge` passes through TC3 signing with `TENCENT_LKE_SECRET_ID` / `TENCENT_LKE_SECRET_KEY` and returns `Records` metadata for both configured knowledge bases.

`TENCENT_LKEAP_RAG_API_KEY` remains reserved for Bearer-token RAG endpoints, but Bearer direct calls to `lkeap.tencentcloudapi.com` are not the verified path in this project. ADP app citation retrieval is a fallback path only.
