# ADR-0010: 演示 UI 保持原生栈,React 化设置明确重评估门槛

日期:2026-06-11
状态:已接受

## 背景

graph-ui v2(指挥舱风格重做)选型时评估了 React 生态(shadcn/ui、Radix、Tremor、React Flow、Graphin)。
这些库的组件质量高,但全部要求引入 React;当前 UI 体量小(6 个源文件),
所需组件(tabs、badge、抽屉、tooltip、搜索、统计卡)均为原生可控的简单件。

## 决定

1. v2 保持 Vite + 原生 ES 模块 + Cytoscape.js,新增 cytoscape-dagre/dagre(MIT)做分层布局。
2. 不引入 React 与任何组件库;shadcn/Tremor/G6 仅作视觉参照,DataHub 仅作信息架构参照。
3. "法条落地路径"用 DOM 卡片 + CSS 连接线实现,不引入 React Flow(只读解释路径,无编排需求)。
4. 字体不打包:演示机已系统安装 Noto Sans SC / Noto Serif SC,CSS 用字体栈回退
   (Microsoft YaHei / Source Han Serif)。换演示机时需先安装这两套字体。

## React 化重评估门槛(满足任一即重评)

- 出现第二个前端消费者(如政府侧门户、企业侧报告页);
- 需要 ≥3 个真复杂交互组件(虚拟化大表格、多面板实时联动、命令面板等);
- ego 视图范式被推翻,需要全图探索引擎(届时一并评估 Sigma.js,见 ADR-0006)。

## 后果

- 零框架依赖,构建产物 541KB(Cytoscape 占大头),离线演示可用。
- 组件手写,样式纪律靠 styles.css 的 design token 维持;改版成本集中在 CSS。
