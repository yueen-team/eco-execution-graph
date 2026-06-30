---
version: alpha
name: Eco Execution Graph
description: Visual contract for the environmental execution graph, graph-ui cockpit, and demo-ready explanation system.
colors:
  canvas: "#111827"
  surface: "#172033"
  surface-muted: "#202A3E"
  surface-raised: "#243149"
  on-surface: "#E6EDF3"
  on-surface-muted: "#A9B6C6"
  border: "#3A465C"
  primary: "#065F46"
  on-primary: "#FFFFFF"
  law: "#1D4E89"
  standard: "#5B6B7F"
  scenario: "#0F766E"
  risk: "#C2410C"
  issue: "#B42318"
  evidence: "#4F83B8"
  rectification: "#0F8B6F"
  pitfall: "#A855F7"
  aggregate: "#38BDF8"
  private-mask: "#465568"
typography:
  page-title:
    fontFamily: Noto Sans SC
    fontSize: 24px
    fontWeight: 650
    lineHeight: 32px
    letterSpacing: 0
  panel-title:
    fontFamily: Noto Sans SC
    fontSize: 16px
    fontWeight: 650
    lineHeight: 24px
    letterSpacing: 0
  body-md:
    fontFamily: Noto Sans SC
    fontSize: 14px
    fontWeight: 400
    lineHeight: 22px
    letterSpacing: 0
  label-sm:
    fontFamily: Noto Sans SC
    fontSize: 12px
    fontWeight: 550
    lineHeight: 18px
    letterSpacing: 0
  data-sm:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 18px
    letterSpacing: 0
rounded:
  sm: 4px
  md: 6px
  lg: 8px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  panel: 16px
components:
  app-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-surface}"
    padding: "{spacing.lg}"
  graph-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.panel}"
  execution-card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.panel}"
  badge-shared:
    backgroundColor: "#DFF6EC"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
  badge-private:
    backgroundColor: "#E5EAF0"
    textColor: "{colors.private-mask}"
    rounded: "{rounded.sm}"
  badge-aggregate:
    backgroundColor: "#E0F2FE"
    textColor: "{colors.aggregate}"
    rounded: "{rounded.sm}"
---

## Overview

The interface is an environmental现场执行驾驶舱. It explains how regulations, standards, field problems, evidence,整改, reports, and common pitfalls connect.

The product should feel like ecological technology plus legal trust plus field expertise. It is not a generic knowledge-graph demo, not a political big-screen dashboard, and not a decorative network visualization. UI is the interpreter of the graph.

The first screen should help government partners, ETO/ESO reviewers, and internal operators answer: what does this legal obligation look like at the enterprise现场, what evidence supports it, what can be shared, and what remains private capability.

## Colors

Use a restrained dark graphite base with semantic colors for graph meaning.

- Green-teal represents environmental scenes, shared capability, and closed-loop progress.
- Deep blue represents law and authority.
- Blue-gray represents technical standards, source references, and evidence archives.
- Amber/orange represents pollution sources or risk release points.
- Warm red represents concrete issues requiring handling.
- Purple is reserved for pitfall and misunderstanding patterns, not general decoration.
- Cyan is reserved for aggregate/statistical signals.

Color must carry graph semantics. Do not add decorative gradients, particles, glow, or glass effects unless they explain a real state.

## Typography

Use Chinese-first typography. Headings should be sober and operational: `法规落地路径`, `现场问题`, `证据类型`, `整改方向`, `共有视图`, `私有能力占位`.

Source references, confidence values, node IDs, timestamps, counts, and export status should use tabular or monospace numerals. Ordinary users should see human-readable labels before machine IDs.

## Layout

Use a cockpit layout:

- Top status bar: product name, domain, distilled events, node/edge counts, and view mode.
- Left navigation: entry by law, field issue, industry/scenario, gap report, and demo mode.
- Center canvas: ego graph, default one-hop and at most two-hop expansion.
- Right panel: execution card linked to the selected node/path.
- Bottom or drawer area: source_ref, confidence, legal_basis_status, review_status, and export/tier state.

Avoid full-graph force-directed views as the main operating surface. They may appear only as a short opening visual if the view returns to an interpretable ego graph.

## Elevation & Depth

Hierarchy comes from panels, borders, semantic badges, and selected-path emphasis. Use shadows sparingly. Never place private content into the frontend bundle and hide it with CSS; shared view safety starts at the data package.

## Shapes

Nodes should look like semantic objects, not identical circles. Law, issue, evidence, rectification, pitfall, aggregate, and private placeholders need distinguishable shapes, iconography, or badge treatment.

Corners stay restrained: 4px to 8px. Avoid pill-shaped everything. Pills are acceptable for status chips and filters.

## Components

Graph nodes and edges must translate `node_type` and `edge_type` into human-readable Chinese labels. Edge detail must show relationship meaning, source_ref, confidence, legal_basis_status, review_status, tier, and last_verified_at when available.

Execution cards are graph slices. Clicking a graph node should move the execution card to the relevant section; clicking card sections should highlight the related graph path.

Shared/private/aggregate boundaries must be visible. Shared view may show private capability counts or placeholders, but not private details.

## Do's and Don'ts

- Do make law-to-field paths understandable within 30 seconds.
- Do make source_ref, confidence, tier, legal_basis_status, and review_status easy to inspect.
- Do keep private/shared/aggregate boundaries visually and physically safe.
- Do verify UI changes with render proof, not only build output.
- Don't show law article full text inside graph nodes.
- Don't fake outbox or distillation counters.
- Don't use a full graph hairball as the primary UI.
- Don't use color, motion, or opening animation without business meaning.
- Don't make dashboards look like generic政务大屏 or hacker-style network art.
