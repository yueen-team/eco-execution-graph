# P1 14 天危废精品切片最终交付报告

## 完成清单

- 5 个精品 issue_type: yes (5 张 internal 执行卡)
- 5 张 shared 执行卡: yes (5 张)
- 图谱包: yes (67 nodes / 95 edges / 4 sources)
- shared 导出包: yes (37 nodes / 65 edges / 2 sources)
- 私有层泄漏检测: reports/private-leak-check.md
- 双向缺口报告: reports/gap-report-hazardous-waste.md
- P0.5 月报段落对比: reports/monthly-report-comparison-hazardous-waste.md
- 监管口径一致性检查: reports/regulatory-consistency-check.md
- 云南环保踩雷地图: reports/yunnan-pitfall-map.md
- 政府演示脚本: reports/government-demo-script-hazardous-waste.md
- UI 呈现证据说明: reports/render-proof/README.md

## 运行命令

```powershell
pnpm bdd:export
pnpm graph:build
pnpm graph:export:shared
pnpm gap:report
pnpm graph:quality
pnpm monthly:compare
pnpm pitfall:map
pnpm regulatory:check
pnpm ui:build
pnpm verify:all
```

## 产物路径

- `data/candidates/issue_type_registry.json`
- `data/candidates/graph_seed_p1_hazardous_waste.json`
- `data/candidates/cards/internal_cards.json`
- `data/candidates/cards/shared_cards.json`
- `data/exports/demo_hazardous_waste_internal/`
- `data/exports/shared_hazardous_waste_v1/`
- `graph-ui/dist/`

## 降级项与真实接入建议

- 当前法规全文由 `rag_doc_ref` 占位,未接腾讯云知识引擎实时取文。
- 当前现场事件为合成 demo snapshot,真实 EcoCheck outbox 接入后应替换 source_ref 和 evidence_count。
- 当前 UI render proof 已包含桌面、移动和 shared 切换截图;正式演示前可按同一路径补录屏。
- 当前法条口径均为 `internal_reviewed`,政府确认后才能晋级 `official_confirmed`。

## 泄漏检测结论

- shared 包只保留 shared 记录和法条瘦引用。
- private runtime 节点、证据判断标准、整改模板、报告表达和 pitfall_instance 未进入 shared 图谱。

## 政府演示路径

1. 打开 UI,先从法条入口展示 obligation → issue_type。
2. 切到问题入口,展示 5 个危废精品问题和证据类别。
3. 切换 shared/internal,说明看得见带不走。
4. 打开缺口报告和踩雷地图,解释政府侧价值。
5. 打开月报对比,说明同一张图如何回到企业服务闭环。

## 未完成项

- 无真实上游 outbox、真实 RAG、政府 lineage 交换源接入;本阶段以结构真实的合成 demo 打穿闭环。
