# Frontend Render Proof

## Scope

- Project: eco-execution-graph / graph-ui
- Page/route: `http://127.0.0.1:4173/app.html?director=1`
- User role: 张主任演示只读视图
- Viewports: desktop 1440x960, mobile 390x844
- Date: 2026-06-15T07:07:00

## Runtime Evidence

| Checkpoint | Route/Page | Assertion | Evidence | Result |
|---|---|---|---|---|
| initial render | `/app.html?director=1` | 演示首幕可见,不是空壳 | `reports/render-proof-hazardous-slice/desktop-director-first-card.png` | PASS |
| phase-two catalog | `/app.html?director=1` 第 6 幕 | 可见“危废全量切片目录”,并显示 31 张危废切片、5 张阶段一、26 张阶段二 | `reports/render-proof-hazardous-slice/desktop-hazardous-catalog.png` | PASS |
| primary action | 点击目录首条切片 | 目录点击后切回图谱执行卡状态,可见“当前图谱动作” | `reports/render-proof-hazardous-slice/desktop-catalog-row-clicked.png` | PASS |
| mobile layout | `/app.html?director=1` 第 6 幕 | 移动端目录可见,关键数字和说明未白屏 | `reports/render-proof-hazardous-slice/mobile-hazardous-catalog.png` | PASS |

## Screenshot Paths

- `reports/render-proof-hazardous-slice/desktop-director-first-card.png`
- `reports/render-proof-hazardous-slice/desktop-hazardous-catalog.png`
- `reports/render-proof-hazardous-slice/desktop-catalog-row-clicked.png`
- `reports/render-proof-hazardous-slice/mobile-hazardous-catalog.png`
- `reports/render-proof-hazardous-slice/manifest.json`

## Commands

```powershell
pnpm --dir graph-ui build
pnpm --dir graph-ui preview -- --port 4173
```

Screenshot automation used Codex bundled Playwright `1.60.0` after restoring the missing `playwright-core@1.60.0` dependency in the local Codex runtime cache.

## Residual Risk

- 本次 proof 证明本地构建可见; CloudBase 静态包仍需在下一次部署后做线上路径复核。
- 云南踩雷图和月报对比仍未进入 safe_to_show,等待真实 EcoCheck 聚合数据与 ETO 盲评。
