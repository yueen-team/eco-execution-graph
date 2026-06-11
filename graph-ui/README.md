# graph-ui · 环保现场执行图谱指挥舱

深色指挥舱风格演示前端。原生 Vite + Cytoscape.js(dagre 分层布局),无框架(选型与 React 化门槛见 `docs/adr/0010`)。

## 运行

```bash
pnpm ui:dev      # 开发(根目录执行)
pnpm ui:build    # 构建
pnpm --dir graph-ui preview   # 本地预览构建产物
```

## 演示

- **主任演示**:右上角按钮,或直接打开 `/?director=1`。七幕叙事:
  序幕(图生长回放)→ 只有法条的世界 → 法条落到现场 → 证据链 → 看得见带不走 → 双向盲区雷达 → 回灌月报。
- 键盘:`→`/`空格` 下一幕,`←` 上一幕,`Esc` 退出。
- `/?view=shared` 直接进入共有视图。
- 图谱交互:单击节点看执行卡,**双击以该节点为中心重新展开**,悬停看置信度。

## 数据

`public/demo-data/` 全部由 pipeline 真实导出拷贝而来,UI 不编造任何数字:

| 文件 | 来源 |
|---|---|
| full-graph / full-cards | P2/P3 full internal product |
| full-shared-* | shared_product_v1 物理过滤导出 |
| graph / cards | P1 危废精品切片 |
| gap-report.json | reports/gap-report-full.json |
| monthly-comparison.json | reports/monthly-report-comparison-full.json(诚实标注 synthetic_baseline_demo) |

## 换演示机注意

字体不打包:需要系统安装 **Noto Sans SC** 与 **Noto Serif SC**(否则回退到微软雅黑/宋体,衬线标题质感下降)。渲染证据见 `reports/render-proof-ui-v2/manifest.json`。
