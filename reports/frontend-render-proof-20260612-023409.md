# Frontend Render Proof

## Scope

- Project: eco-execution-graph / graph-ui
- Page/route: `http://127.0.0.1:4173/?director=1`
- User role: 张主任演示只读视图
- Viewports: desktop 1440x920, mobile 390x844
- Date: 2026-06-12T02:34:09

## Runtime Evidence

| Checkpoint | Route/Page | Assertion | Evidence | Result |
|---|---|---|---|---|
| initial render | `/?director=1` | 主任演示首幕显示 `card:full:0003` 和审核后 5 张卡主线 | `reports/render-proof-ui-v2/desktop-director-act1.png` | PASS |
| primary action | `/?director=1` | “下一幕”按钮可见,演示条显示第一张卡状态 | `reports/render-proof-ui-v2/desktop-director-act1.png` | PASS |
| honesty boundary | `/?director=1` | 页面提示不进入云南踩雷地图、不演示月报对比、不作违法认定 | `reports/render-proof-ui-v2/director-card-sequence-proof.json` | PASS |
| mobile layout | `/?director=1` | 移动端可进入主任演示,标题和下一幕按钮可见 | `reports/render-proof-ui-v2/mobile-director-act1.png` | PASS |

## Screenshot Paths

- `E:\eco-execution-graph\reports\render-proof-ui-v2\desktop-director-act1.png`
- `E:\eco-execution-graph\reports\render-proof-ui-v2\mobile-director-act1.png`
- `E:\eco-execution-graph\reports\render-proof-ui-v2\director-card-sequence-proof.json`

## Commands

```powershell
pnpm --dir graph-ui build
pnpm --dir graph-ui preview -- --host 127.0.0.1 --port 4173
npx playwright screenshot --viewport-size=1440,920 "http://127.0.0.1:4173/?director=1" reports/render-proof-ui-v2/desktop-director-act1.png
npx playwright screenshot --viewport-size=390,844 "http://127.0.0.1:4173/?director=1" reports/render-proof-ui-v2/mobile-director-act1.png
```

## Residual Risk

- Playwright package is available through `npx playwright`, but not as a local `require("playwright")` dependency, so this proof captures first-render screenshots rather than scripted multi-act screenshots.
- Mobile screenshot proves the route enters director mode and controls are visible; further polish can reduce the bottom demo bar's vertical footprint.
