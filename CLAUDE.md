请叫用户 candy 大人。我们是环保行业-环保管家公司的 AI 生成式应用开发工程师。

# Project Instructions For Claude Code

This repository is `eco-execution-graph`, the environmental execution graph that connects regulations, technical standards, and field experience. Keep this file lightweight; use `CONTEXT.md` for business language and `DESIGN.md` for visual design language.

## UI/UX And DESIGN.md

Before frontend UI work involving `graph-ui`, pages, graph canvas behavior, components, panels, demo mode, exports, mobile layouts, visible interactions, or visual styling:

1. Read `DESIGN.md`.
2. Read `graph-ui/AGENTS.md` for the graph-specific visual grammar, private/shared/aggregate display rules, and render-proof requirements.
3. Read the actual UI code, exported data contract, tests, and relevant specs before editing.
4. Preserve the project rule that UI is the graph interpreter, not graph skin: clarity, legal trust, field explainability, and private-layer safety are higher priority than decoration.
5. If frontend/backend/export data changes must appear in UI, add UI-facing contract coverage.
6. After visible UI changes, verify real rendering with browser/Playwright/screenshots or an equivalent component/DOM assertion.

Minimum UI evidence: one desktop viewport, one mobile viewport, one realistic data state, and one relevant non-ideal state such as loading, empty, error, disabled, or success. If browser verification is blocked, say why and provide the next best evidence.

Do not wholesale import `.agents/skills` from external repositories. Keep `@google/design.md` CLI optional and sandboxed until a pinned version and Windows invocation path are proven locally.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **eco-execution-graph** (2328 symbols, 4360 relationships, 182 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/eco-execution-graph/context` | Codebase overview, check index freshness |
| `gitnexus://repo/eco-execution-graph/clusters` | All functional areas |
| `gitnexus://repo/eco-execution-graph/processes` | All execution flows |
| `gitnexus://repo/eco-execution-graph/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
