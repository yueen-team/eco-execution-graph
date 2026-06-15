# CloudBase Static Readonly Package

- status: `pass`
- package_dir: `graph-ui/dist-cloudbase-static-readonly`
- deploy_target: CloudBase static hosting
- access_policy: read-only shared demo; no private tier; no real enterprise data; no keys; no raw RAG response
- file_count: 20

## Safe Data Handling
- `full-graph.json` and `graph.json` are overwritten with `shared_product_v1/graph.json`.
- `full-cards.json` and `cards.json` are overwritten with `shared_product_v1/cards.shared.json`.
- `deploy-policy.json` locks the static app to readonly shared mode and disables product/view switching.
- `monthly-comparison.json` is removed because monthly comparison remains blocked until ETO blind review.

## Findings
- none

## Code Warnings
- graph-ui/dist-cloudbase-static-readonly/app.html: code bundle still contains internal vocabulary labels; data package is checked separately
- graph-ui/dist-cloudbase-static-readonly/assets/app-BBPp4RGX.js: code bundle still contains internal vocabulary labels; data package is checked separately
- graph-ui/dist-cloudbase-static-readonly/assets/cytoscape.esm-Rr0APn4h.js: code bundle still contains internal vocabulary labels; data package is checked separately

## Deploy Command
- Upload directory: graph-ui/dist-cloudbase-static-readonly
- Target: CloudBase static hosting.
- Do not upload graph-ui/dist directly.
