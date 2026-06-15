# 危废全量切片阶段一/二完成报告

## 结论

本轮已经把危废演示从“5 张精品卡”升级为“5 张精品开场 + 危废专题全量目录”。

- 阶段一:主任开场精品 5 张,继续作为 5 分钟演示主线。
- 阶段二:危废专题全量目录 26 张,用于证明危废相关候选已经形成规模化切片。
- 当前危废相关候选 31 个,已形成 31 张执行卡切片,未覆盖 0 个。
- 合并展示切片保留在目录中证明覆盖,但不单独包装成主任主线。

## 本轮改动

1. 执行卡生成层新增危废全量识别和目录字段:
   - 危废切片范围
   - 危废切片阶段
   - 危废切片角色
   - 危废切片顺序
   - 危废切片展示策略

2. 新增产物:
   - `reports/hazardous-waste-slice-catalog.json`
   - `reports/hazardous-waste-slice-catalog.md`
   - `reports/render-proof-hazardous-slice/manifest.json`
   - `reports/frontend-render-proof-20260615-070700.md`

3. 主任演示顺序升级:
   - `reports/director-demo-card-sequence.json` 现在同时包含阶段一和阶段二。
   - `reports/zhang-director-product-demo-script.md` 已说明先讲 5 张,再切危废全量目录。

4. Web 演示升级:
   - `graph-ui/src/demo.js` 不再只靠硬编码 5 张卡。
   - 前端优先读取 `director_demo_order`。
   - 新增“危废全量切片目录”演示幕。

## 验证

- `pnpm cards:generate:full`:通过。
- `pnpm bdd:export`:通过。
- `python -m unittest discover -s tests -p "test_*.py"`:40 项通过。
- `pnpm leak:full`:通过, private 泄漏 0。
- `pnpm regulatory:check:full`:通过,监管口径 findings 0。
- `pnpm --dir graph-ui build`:通过。
- Playwright 渲染证明:通过,桌面和移动端均可见危废全量目录。

## 仍不能讲的内容

- 云南踩雷图仍等待真实 EcoCheck 聚合数据。
- 月报对比仍等待 ETO 盲评。
- 政府 lineage 真实导入仍等待政府确认交换文件。
- 不展示真实企业数据、附件路径、原始报告全文、证据判定标准、整改模板、报告表达模板和法条全文。

## 审核建议

ETO 审核时重点看三点:

1. 31 张危废切片里是否还有应合并但未合并的重复问题。
2. 阶段二 26 张目录卡里,哪些可以升级为下一轮主任专题卡。
3. 每张卡的对外表达是否都保持在“建议核查、建议完善、存在管理风险”,没有写成违法认定。
