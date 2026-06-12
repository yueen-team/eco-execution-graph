# 现场经验入图审核台渲染证据

- status: `pass`
- target: `http://127.0.0.1:5192/?workspace=review`
- evidence: Playwright 截图覆盖待审核列表、详情、点击通过后的状态变化、移动端窄屏。
- api_persistence: `pass`;浏览器点击"通过，进入聚合候选"后,脚本重新 GET `graph-api` 审核详情,确认状态和审核意见已持久化。

## Screenshots

- `desktop-waiting-list.png`:待审核列表。
- `desktop-detail.png`:审核详情。
- `desktop-approved-state.png`:早期本地状态切换截图,仅保留为视觉基线。
- `mobile-review.png`:移动端窄屏。
- `api-backed-approved-state.png`:真实 API 数据模式下点击通过后的截图,并有后端持久化校验。
