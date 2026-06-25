# CloudBase Static Internal Package

- status: `pass`
- package_dir: `graph-ui/dist-cloudbase-static-internal`
- deploy_target: CloudBase static hosting
- access_policy: internal review shell; shared graph only; review data fetched from graph-api after WeCom session
- public_base: `/eco-execution-graph-internal/`
- review_api_base: `https://www.yueen.cc/container-eco-execution-graph`
- file_count: 21

## Safe Data Handling
- Graph JSON and card JSON are overwritten with `shared_product_v1` exports.
- `review-data/` is removed; the audit queue must come from graph-api after WeCom session validation.
- `deploy-policy.json` keeps graph data readonly shared while enabling the review workspace button for authorized sessions.

## Findings
- none

## Code Warnings
- graph-ui/dist-cloudbase-static-internal/app.html: code bundle still contains internal vocabulary labels; data package is checked separately
- graph-ui/dist-cloudbase-static-internal/assets/app-HyIJ0LFW.js: code bundle still contains internal vocabulary labels; data package is checked separately

## Deploy Command
- Upload directory: graph-ui/dist-cloudbase-static-internal
- Target: CloudBase static hosting directory for the internal review route.
- Do not upload graph-ui/dist directly.
