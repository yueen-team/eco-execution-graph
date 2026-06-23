# ADR-0012 GRAPH-RAG-REAL-SMOKE external cutover

- Status: Accepted
- Date: 2026-06-23

## Context

ADR-0003 keeps Tencent RAG real smoke outside the default `verify:all` path
because normal schema, graph, leak, and API checks must run without Tencent
credentials or network availability.

The external evidence now has two passes:

- `codex/graph-rag-external-lane`: `pnpm verify:external` runs
  `pnpm external:verify`, writes `reports/external-verification-lane.json` /
  `.md`, and passed with embedding, TokenHub, and RAG retrieve all green.
- Clean `main` worktree at commit `0555cca`: existing `pnpm verify:external`
  also passed against the real Tencent environment.

EcoCheck live graph push has one synthetic pass against
`https://www.yueen.cc/container-eco-execution-graph/api/ecocheck/field-events`.
That is useful integration evidence, but it is not part of this RAG cutover.
Real aggregate data, ETO blind review, and government lineage real import remain
unavailable and intentionally out of scope.

## Decision

`GRAPH-RAG-REAL-SMOKE` may become a blocking check only in a credentialed
external verification lane owned by `eco-execution-graph`.

Allowed command:

```powershell
pnpm verify:external
```

After the external-lane branch lands, this command delegates to:

```powershell
pnpm external:verify
```

The default local and CI command remains:

```powershell
pnpm verify:all
```

`verify:all` must not depend on Tencent SecretId, TokenHub API keys, knowledge
base ids, CloudBase, WeCom, or government datasets.

## Secret And Report Boundary

The credentialed lane fails closed when required Tencent/RAG/TokenHub
configuration is absent, invalid, quota-exhausted, or unreachable.

Reports may store only:

- environment variable names and configured booleans;
- step names, exit status, and sanitized error summaries;
- citation counts and locator/source-level review queue counts;
- safe metadata summaries already written by the RAG resolver.

Reports must not store:

- secret values, bearer tokens, connection strings, or raw environment values;
- raw RAG `Content`, full law text, or full technical-standard text;
- enterprise-identifiable data, GPS, raw attachments, or private review content.

## CI Policy

A CI job may be configured as blocking only when all required secrets are
available to that job and its logs are redacted. If the CI environment does not
provide those secrets, the external job must be skipped or marked not
applicable; it must not block `verify:all`.

When credentials are present, any failed external smoke blocks that external
lane. This indicates "Tencent external dependency not verified" and does not by
itself imply graph schema, ontology contract, or intake regression.

## Rollback

If the external lane produces false failures or provider instability, remove the
CI job from the blocking set and keep `pnpm verify:external` as an explicit
operator-run evidence command. Do not weaken graph schema, ontology contract,
private-leak, or regulatory checks to compensate for live service instability.

## Out Of Scope

- EcoCheck real aggregate rows and ETO blind review.
- Government-confirmed lineage import.
- CloudBase/WeCom live login and storage diagnostics.
- Promotion of any global ontology gate.
