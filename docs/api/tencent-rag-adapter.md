# Tencent RAG Adapter

`resolve_citation(...)` is represented by `pipeline/rag_resolve.py` for P2P3. It resolves citation metadata for `law_article`, `tech_spec`, and `standard_limit` nodes without writing full text into graph packages.

Status values: `resolved`, `not_found`, `ambiguous`, `api_error`, `blocked`, `fixture_only`.

Current implementation uses Tencent LKEAP `GetEmbedding` as real smoke and marks app-layer citation retrieval `blocked` until a published ADP `BotAppKey` is configured.
