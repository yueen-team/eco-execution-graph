# EcoCheck Graph P0/P1 Closure

- checked_at: `2026-06-22T10:14:23.9770475-04:00`
- cloudbase_env: `yueen-huanbao-1gqfjr5s41e61180`
- graph_api_base_url: `https://www.yueen.cc/container-eco-execution-graph`
- graph_api_service: `graph-api`, status `normal`, updated `2026-06-22 19:17:19`

## Verified

- Token alignment: `pass`.
- Unauthenticated review API: `401`, fail-closed.
- Authenticated review list: `200`.
- Authenticated graph context: `200`, status `pass`.
- EcoCheck synthetic live smoke: `pass`, 5 synthetic semantic events posted and read back from graph review.
- Synthetic post-marking: all 5 records were marked `do_not_promote`; `aggregate_allowed=false`.
- Aggregate pitfall transport: endpoint reachable with `200`; response is `blocked` because there are no approved real aggregate samples yet.
- Tencent RAG real smoke: `pass`; 218 citations resolved, 191 with specific locator and 27 still source-level.

## External Pending

- Government lineage: interface and contract are reserved; real import waits for a `government_confirmed` exchange file.
- Real EcoCheck aggregate pitfall map: transport is verified; full map waits for the app flow and real aggregate data.
- ETO blind review for monthly comparison: waits for app flow and real desensitized monthly samples.

## Not Verified

- CloudBase graph-api storage driver cannot be proven from the current public graph-api surface or CloudBase CLI list output without a dedicated non-secret diagnostics endpoint or console evidence.
- Enterprise WeCom login callback was not exercised because no live扫码 session was initiated in this verification.

## Secrets Policy

- No token or secret value was echoed.
- Raw RAG content/full text was not cached in graph reports.
