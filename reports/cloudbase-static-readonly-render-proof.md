# CloudBase 只读静态包渲染证据

- 生成脚本: `scripts/prepare_cloudbase_static_readonly.ps1`
- 本地预览地址: `http://127.0.0.1:4174/?director=1`
- 截图: `reports/render-proof-ui-v2/cloudbase-readonly-director-settled.png`
- 数据检查: `reports/render-proof-ui-v2/cloudbase-readonly-data-proof.json`

## 结论

CloudBase 静态只读包已锁定 shared 演示模式,主任演示主线可以渲染。

数据检查结果:

- `readonly_shared`: true
- `allowed_dataset`: `shared_product_v1`
- 节点数: 483
- 关联边数: 977
- 执行卡数: 90
- private 节点: 0
- private 关联边: 0
- private 节点类型: 0
- `monthly-comparison.json`: 未进入包

## 已知提示

打包后的前端代码仍包含内部术语标签字典,用于本地内部模式复用。静态包报告将其记录为 `code_warnings`,但不会阻断部署;阻断条件以 JSON 数据泄漏、密钥、原始 RAG 响应为准。
