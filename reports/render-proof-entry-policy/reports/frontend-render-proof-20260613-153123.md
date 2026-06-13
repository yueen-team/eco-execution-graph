# Frontend Render Proof

## Scope

- Project: eco-execution-graph / graph-ui
- Page/route: `/eco-execution-graph/`, `/eco-execution-graph/?director=1`, `/eco-execution-graph/login.html`
- User role: external visitor, director demo viewer, internal reviewer
- Viewports: 1366 x 768
- Date: 2026-06-13T15:31:23

## Runtime Evidence

| Checkpoint | Route/Page | Assertion | Evidence | Result |
|---|---|---|---|---|
| initial render | `/eco-execution-graph/` | default entry redirects to `landing.html` and renders the marketing/showcase hero | `default-lands-on-landing.png`, `entry-policy-render-proof.json` | pass |
| primary action | `/eco-execution-graph/?director=1` | legacy director-demo query redirects to `app.html?director=1` and graph canvas is present | `legacy-director-param-opens-app.png`, `entry-policy-render-proof.json` | pass |
| internal entry | `/eco-execution-graph/login.html` | login page renders enterprise WeCom login and token fallback DOM | `login-page-visible.png`, `entry-policy-render-proof.json` | pass |
| console health | all checked routes | no browser console/page errors during proof run | `entry-policy-render-proof.json` | pass |
| production smoke | `https://www.yueen.cc/eco-execution-graph/` | production default entry redirects to `landing.html` with nonblank hero | `cloudbase-default-lands-on-landing.png`, `cloudbase-entry-policy-render-proof.json` | pass |

## Screenshot Paths

- E:\eco-execution-graph\reports\render-proof-entry-policy\default-lands-on-landing.png
- E:\eco-execution-graph\reports\render-proof-entry-policy\legacy-director-param-opens-app.png
- E:\eco-execution-graph\reports\render-proof-entry-policy\login-page-visible.png
- E:\eco-execution-graph\reports\render-proof-entry-policy\cloudbase-default-lands-on-landing.png

## Commands

```powershell
pwsh -ExecutionPolicy Bypass -File scripts/prepare_cloudbase_static_readonly.ps1

# Static preview was served from a local root containing:
# reports/render-proof-entry-policy/local-static-root/eco-execution-graph
# URL tested: http://127.0.0.1:4186/eco-execution-graph/

cloudbase hosting deploy -e yueen-huanbao-1gqfjr5s41e61180 -r ap-shanghai graph-ui/dist-cloudbase-static-readonly dist-cloudbase-static-readonly
```

## Residual Risk

- If a browser still shows the old graph page at `/eco-execution-graph/`, clear the local browser cache or hard refresh; production HTTP and Playwright smoke already receive the new index.
