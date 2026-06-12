# CloudBase Static Readonly Package

- status: `pass`
- package_dir: `graph-ui/dist-cloudbase-static-readonly`
- deploy_target: CloudBase static hosting
- access_policy: read-only shared demo; no private tier; no real enterprise data; no keys; no raw RAG response
- file_count: 11

## Safe Data Handling
- ull-graph.json and graph.json are overwritten with shared_product_v1/graph.json.
- ull-cards.json and cards.json are overwritten with shared_product_v1/cards.shared.json.
- deploy-policy.json locks the static app to readonly shared mode and disables product/view switching.
- monthly-comparison.json is removed because monthly comparison remains blocked until ETO blind review.

## Findings
- none

## Code Warnings
- graph-ui/dist-cloudbase-static-readonly/index.html: code bundle still contains internal vocabulary labels; data package is checked separately
- graph-ui/dist-cloudbase-static-readonly/assets/index-DGkVmet2.js: code bundle still contains internal vocabulary labels; data package is checked separately

## Deploy Command
Upload $(@{status=pass; package_dir=graph-ui/dist-cloudbase-static-readonly; deploy_target=CloudBase static hosting; access_policy=read-only shared demo; no private tier; no real enterprise data; no keys; no raw RAG response; source_dist=graph-ui/dist; shared_graph=data/exports/shared_product_v1/graph.json; shared_cards=data/exports/shared_product_v1/cards.shared.json; removed=System.Object[]; overwritten_with_shared=System.Object[]; file_count=11; findings=System.Object[]; code_warnings=System.Object[]; hashes=System.Object[]; generated_at=2026-06-12T02:50:40}.package_dir) to CloudBase static hosting. Do not upload graph-ui/dist directly.
