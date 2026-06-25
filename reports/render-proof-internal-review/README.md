# 内部审核壳渲染证据

- status: `pass`
- target:本地静态服务器分别挂载 `/eco-execution-graph-internal/` 和 `/eco-execution-graph/`,验证真实路径前缀。
- PNG 按 `.gitignore` 不入库,本文件与 `manifest.json` 入库。

## Checks

- `internal-authorized-review.png`:已授权 admin 会话,`?workspace=review` 自动进入现场经验入图审核台,右上角「入图审核」可见。
- `internal-authorized-review-mobile.png`:390px 窄屏下审核台可见,候选卡和审核区进入长滚动布局。
- `review-local-desktop.png`:1920px 本地预览,新版审核步骤「核对信源/判断归类/提交结论」可见,未出现 synthetic smoke 文案。
- `review-local-mobile.png`:390px 本地预览,新版审核步骤和提交按钮在移动端可见,未出现 synthetic smoke 文案。
- `internal-unauthorized-hidden.png`:internal 壳未登录时隐藏审核入口和审核台。
- `readonly-shared-review-hidden.png`:public shared 只读包即使带 `?workspace=review` 也继续隐藏审核入口。

## Browser Logs

- 未授权场景的 `/auth/session` 返回 `401` 是预期行为。
- 本地最小静态服务器未伺服 favicon,产生一次 `404`,不影响页面证据。
- 新版本地预览截图中拦截 auth/session 为 admin、field-events 为 204 以验证 demo fallback;控制台错误为 0。
