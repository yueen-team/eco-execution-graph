# 现场经验入图审核台 · 两步制审核与合并校验渲染证据

- status: `pass`
- target: `http://127.0.0.1:5198/?workspace=review`(vite dev,`/api` 经新增代理转发到 graph-api 8787)
- 持久化校验:浏览器操作后直接读取 staging JSONL 比对,并刷新页面确认 UI 呈现一致。
- PNG 按 `.gitignore` 不入库,本文件与 `manifest.json`(sha256)入库。

## Screenshots

- `api-waiting-list.png`:API 数据模式待审核列表,无演示横幅,左栏含「已通过(待聚合)」新状态。
- `api-two-step-armed.png`:两步制——选中「通过,进入聚合候选」(环保绿选中态),已填审核意见,提交按钮激活,hint 提示状态去向。
- `api-submitted-notice.png`:提交后绿色内联通知「已写入 private staging」,tab 计数更新,提交按钮复位。
- `api-reload-persisted.png`:刷新页面后状态保持(待审核 1 / 已通过(待聚合) 1)。
- `api-merge-validation-error.png`:选「合并到已有问题类型」未填目标直接提交,红色内联校验提示,不再使用 window.alert。
- `api-merge-success.png`:填入图谱已有问题类型(datalist 候选)后合并成功。
- `mobile-review.png`:390px 窄屏,tab 双列、卡片无溢出。
- `demo-fallback-banner.png`:graph-api 停止后回落演示数据,琥珀横幅「不会落库」。
- `cn-labels-panel.png`:图谱主界面英文枚举中文化(已审核基线 / ETO 已确认 / 私有运行层括注),DOM 快照核对无裸英文枚举残留。
- `landing-hero.png`:着陆页首屏,真实 P1 图谱生长背景 + 实时数字带(483/977/90/54 取自共有导出包,非写死)。
- `landing-bottom.png`:授权红线三层 + 行动区 + 页脚诚实声明与 ICP 占位。
- `landing-mobile.png`:390px 着陆页,无溢出。
- `login-page.png`:企业微信扫码登录页(无手机号/邮箱注册,令牌为折叠应急通道)。

## 落库比对记录

```
已通过(待聚合) / 意见:标签字段缺失属实,证据链完整,同意入图参与聚合。
已进入聚合候选 / 合并目标:issue:hw:label-incomplete
```
