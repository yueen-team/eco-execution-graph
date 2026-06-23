# ADR-0012 GRAPH-RAG-REAL-SMOKE external cutover

- Status: Accepted
- Date: 2026-06-23

## Context

ADR-0003 keeps Tencent RAG real smoke outside the default `verify:all` path
because normal schema, graph, leak, and API checks must run without Tencent
credentials or network availability.

The external evidence now has two RAG passes:

- `codex/graph-rag-external-lane`: `pnpm verify:external` runs
  `pnpm external:verify`, writes `reports/external-verification-lane.json` /
  `.md`, and passed with embedding, TokenHub, and RAG retrieve all green.
- Clean `main` worktree at commit `0555cca`: existing `pnpm verify:external`
  also passed against the real Tencent environment.

EcoCheck live graph push has a synthetic pass against
`https://www.yueen.cc/container-eco-execution-graph/api/ecocheck/field-events`.
The smoke script now supports `--mark-synthetic-not-for-graph`, so future live
smokes can automatically mark synthetic review rows as `不入图` after POST.
That evidence is useful for the broader external lane, but it does not promote
EcoCheck aggregate statistics or ETO blind review by itself.

Real aggregate data, ETO blind review, and government lineage real import remain
unavailable. They are still modeled as explicit external gates so that a future
credentialed/data-bearing environment can fail closed without another governance
redesign.

## Decision

`GRAPH-RAG-REAL-SMOKE` may become a blocking check only in a credentialed
external verification lane owned by `eco-execution-graph`.

The same lane is also the reserved cutover surface for:

- `ECOCHECK-GRAPH-PUSH-REAL-SMOKE`
- `ECOCHECK-AGGREGATE-ETO-BLIND-REVIEW`
- `GOVERNMENT-LINEAGE-REAL-IMPORT`

Allowed command:

```powershell
pnpm verify:external
```

After the external-lane branch lands, this command delegates to:

```powershell
pnpm external:verify
```

By default, the lane requires only `GRAPH-RAG-REAL-SMOKE`, because that is the
only gate with repeat real-environment evidence. A CI job or operator can make
additional gates blocking by setting:

```powershell
GRAPH_EXTERNAL_REQUIRED_GATES=all
```

or a comma-separated subset of gate ids. Required gates fail closed: missing
credentials, missing real aggregate inputs, missing government-confirmed lineage
datasets, failed synthetic cleanup, or failed ETO blind review evidence returns a
non-zero external lane result.

The default local and CI command remains:

```powershell
pnpm verify:all
```

`verify:all` must not depend on Tencent SecretId, TokenHub API keys, knowledge
base ids, CloudBase, WeCom, or government datasets.

## Secret And Report Boundary

The credentialed lane fails closed when the configuration or data required by a
selected gate is absent, invalid, quota-exhausted, unreachable, or fails safety
checks.

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

When a gate is selected as required, any failed or blocked external evidence
blocks that external lane. This indicates "selected external dependency not
verified" and does not by itself imply graph schema, ontology contract, or
intake regression.

## Rollback

If one external dependency produces false failures, remove that gate id from
`GRAPH_EXTERNAL_REQUIRED_GATES` and keep `pnpm verify:external` as an explicit
operator-run evidence command. Do not weaken graph schema, ontology contract,
private-leak, or regulatory checks to compensate for live service instability.

## Out Of Scope

- CloudBase/WeCom live login and storage diagnostics.
- Promotion of any global ontology gate.
