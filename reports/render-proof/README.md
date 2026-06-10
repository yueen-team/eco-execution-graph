# Render Proof · Hazardous Waste Ego Graph

- build: `pnpm ui:build`
- app entry: `graph-ui/index.html`
- demo data: `graph-ui/public/demo-data/graph.json` and `graph-ui/public/demo-data/cards.json`
- expected initial render: top metrics show node/edge/card counts and center node `固体废物污染环境防治法 第七十七条`.
- expected primary action: click `共有` view; private runtime nodes disappear and status text changes to shared export boundary.
- expected node action: click any graph node; right execution card updates title, tier badge, facts and confidence list.
- expected constrained viewport: at width below 760px, rail, graph and execution card stack vertically without text overlap.
- screenshot: `reports/render-proof/desktop-internal.png`
- screenshot: `reports/render-proof/mobile-internal.png`
- screenshot: `reports/render-proof/desktop-shared.png`
- interaction assertion: after clicking `共有`, `#viewStatus` is `共有视图: private 节点已物理隐藏,只保留共有口径。`
- manual demo command: `pnpm --dir graph-ui preview -- --port 4173` then open `http://127.0.0.1:4173/`.
