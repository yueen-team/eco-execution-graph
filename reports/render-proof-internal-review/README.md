# 内部审核壳渲染证据

- status: `pass`
- target:本地静态服务器分别挂载 `/eco-execution-graph-internal/` 和 `/eco-execution-graph/`,验证真实路径前缀。
- PNG 按 `.gitignore` 不入库,本文件与 `manifest.json` 入库。

## Checks

- `internal-authorized-review.png`:已授权 admin 会话,`?workspace=review` 自动进入现场经验入图审核台,右上角「入图审核」可见。
- `internal-authorized-review-mobile.png`:390px 窄屏下审核台可见,候选卡和审核区进入长滚动布局。
- `internal-unauthorized-hidden.png`:internal 壳未登录时隐藏审核入口和审核台。
- `readonly-shared-review-hidden.png`:public shared 只读包即使带 `?workspace=review` 也继续隐藏审核入口。

## Browser Logs

- 未授权场景的 `/auth/session` 返回 `401` 是预期行为。
- 本地最小静态服务器未伺服 favicon,产生一次 `404`,不影响页面证据。
