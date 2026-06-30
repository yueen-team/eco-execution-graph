# graph-ui 子模块指南

> UI 任务先读仓库根目录 `DESIGN.md`;本文件提供 graph-ui 的领域视觉语法和验收细则。若两者冲突,以本文件的私有层安全、图谱解释性和 render-proof 要求为准。

## 模块边界

Cytoscape.js + Vite 的 ego 视图驾驶舱。**只读消费 `data/exports/` 的包**，不写任何数据。

`graph-ui` 的目标不是“把图数据画出来”，而是把 **“法条如何落到真实企业现场”** 变成可被政府、ETO、ESO、企业负责人共同理解的视觉解释系统。

> 产品原则：**UI 不是图谱的皮肤，UI 是图谱的解释器。** 颜值、功能、可解释性必须合一。

---

## 核心交互模型（ADR-0009）

状态 = 当前中心节点 + 展开深度（1-2 跳）+ 边类型过滤器 + 视图模式。

| 必做 | 说明 |
|---|---|
| ego 展开 | 点节点 → 设为中心 → 取邻域子图 |
| tier 徽章 | shared/private/aggregate 三色标识 |
| confidence 着色 | 边按置信度渐变；展示 confidence_evidence（“被现场验证 N 次”） |
| 视图切换 | 内部全量 ↔ 共有视图一键切换（ADR-0008，切换本身是演示环节） |
| 蒸馏计数器 | 真实 outbox 统计的离线快照（specs Q8），不造假 |
| 演示模式 | C 刀法对照叙事：执法工具“升级前 / 升级后” |

---

## UI 设计总目标

第一版不是做“知识图谱大屏”，而是做 **环保现场执行驾驶舱**。

它需要同时回答 5 个问题：

1. 这条法规为什么重要？
2. 它在企业现场长什么样？
3. 我们凭什么这样判断？
4. 哪些内容可以共有，哪些内容是我方私有壁垒？
5. 它如何反哺 EcoCheck 小程序和月度体检报告？

### 5 秒 / 30 秒 / 5 分钟验收

| 时间 | 用户感受 | UI 必须做到 |
|---:|---|---|
| 5 秒 | “这不是普通后台，这是成熟产品。” | 视觉高级、布局克制、品牌统一、节点不乱飞 |
| 30 秒 | “我看懂了法条和现场之间的关系。” | 从法条/问题/行业任一入口能展开 1 条清晰路径 |
| 5 分钟 | “这套系统可信，而且有护城河。” | 能看到 source_ref、confidence、tier、legal_basis_status、审核状态、私有层遮罩、缺口报告 |

---

## 视觉风格建议

### 气质定位

建议走：

```text
生态科技 + 法律可信 + 专家系统 + 现场温度
```

避免走：

```text
政务蓝大屏堆数据 / 黑客风毛线球 / 科研原型 / 老后台表格
```

### 推荐色彩方向

| 用途 | 建议 | 说明 |
|---|---|---|
| 背景 | 深海蓝 / 石墨黑 / 雾面灰 | 稳重、专业、适合政府演示 |
| 主品牌色 | 森林深绿 `#065F46` | 生态、环保、公司品牌连续性 |
| 法规节点 | 深蓝 / 石墨蓝 | 法律、权威、稳定 |
| 技术规范 | 冷灰蓝 | 标准、规程、方法 |
| 行业/场景 | 环保绿 | 现实生产活动 |
| 污染源/污染物 | 琥珀 / 橙黄 | 风险释放点，不要过度警报化 |
| 现场问题 | 珊瑚红 / 暖红 | 异常、需要处理 |
| 证据 | 半透明蓝灰 | 可追溯、档案、照片 |
| 整改 | 青绿色 | 闭环、恢复、改善 |
| 踩雷点 | 紫色 / 玫红 | 误解、脱节点、培训价值 |

### 视觉克制原则

- 色彩只服务语义，不做装饰性渐变污染。
- 动效只服务解释，不做无意义粒子、漂浮、旋转。
- 节点数量少而精，默认只展开 1 跳，最多 2 跳。
- 所有“酷”的效果都必须能解释业务含义，否则删掉。

---

## 推荐页面布局

```text
┌──────────────────────────────────────────────────────────────┐
│ 顶部状态栏：项目名 / 危废域 / 本月蒸馏事件 / 节点与边统计 / 视图模式 │
├───────────────┬─────────────────────────────┬────────────────┤
│ 左侧导航       │ 中央 ego 图谱画布             │ 右侧执行卡       │
│ - 按行业看     │ - 当前中心节点                │ - 法条义务       │
│ - 按法条看     │ - 1-2 跳邻域                  │ - 现场表现       │
│ - 按问题看     │ - 边类型过滤                  │ - 证据类型       │
│ - 缺口报告     │ - tier/confidence 视觉编码     │ - 整改方向       │
│ - 演示模式     │ - 点击节点联动执行卡            │ - 踩雷点         │
├───────────────┴─────────────────────────────┴────────────────┤
│ 底部/抽屉：source_ref / RAG 引文状态 / review_status / 导出状态 │
└──────────────────────────────────────────────────────────────┘
```

### 三个主入口

| 入口 | 适合用户 | 展开逻辑 |
|---|---|---|
| 按法条看 | 主任团队、执法工具团队 | law_article → law_obligation → issue_type → pitfall_class/evidence_category/rectification/report |
| 按现场问题看 | ETO、ESO、内部审核 | issue_type → law_obligation → law_article + evidence/rectification/report |
| 按行业/场景看 | 企业负责人、培训场景 | industry → process_scenario → pollution_source → pollutant → standard/law/issue |

---

## 节点视觉语法

节点不能全部画成普通圆点。建议把节点做成“语义物件”。

| node_type | UI 形态 | 图标建议 | 展示重点 |
|---|---|---|---|
| industry | 圆角矩形 / 厂区轮廓 | Factory / Building2 | 行业名称、适用场景数 |
| process_scenario | 胶囊卡片 | Workflow / Route | 场景名称、发生环节 |
| pollution_source | 六边形 / 源点 | Factory / Flame / Wind | 产污节点 |
| pollutant | 小圆点组 / 分子感 | Cloud / Droplets | 污染物名称 |
| standard_limit | 标尺卡片 | Ruler / Gauge | 标准名称、限值类型 |
| tech_spec | 文档卡片 | BookOpen / FileText | 技术规范名称 |
| law_article | 稳重文书卡片 | Scale / Landmark / FileText | 法规名、条款号、effective_status |
| law_obligation | 义务条款块 | ShieldCheck | 适用对象、触发条件、管理要求 |
| issue_type | 风险卡片 | TriangleAlert | 标准问题名、风险等级、出现频次 |
| pitfall_class | 闪电/裂缝节点 | Zap / AlertCircle | 共有级常见误解、脱节点说明 |
| pitfall_pattern_stat | 统计波纹卡 | BarChart3 / TrendingUp | 聚合踩雷频次、复发率 |
| pitfall_instance | 锁形事件卡 | Lock / AlertCircle | 企业级踩雷实例；内部视图才展示 |
| evidence_category | 档案/相机卡 | Camera / FileCheck | 可共有证据类别 |
| evidence_field_requirement | 字段清单卡 | ListChecks / FileCheck | 概念级字段要求；细则按 tier 控制 |
| evidence_judgment_standard | 锁形审核卡 | Lock / ShieldCheck | 证据判断标准；只内部展示 |
| rectification_template | 闭环箭头卡 | RefreshCw / CheckCircle | 整改方向；内部视图才展示模板 |
| report_expression | 文案片段卡 | MessageSquareText | 报告表达；内部视图才展示内容 |
| stat_signal | 统计波纹卡 | BarChart3 / TrendingUp | 区域/行业聚合信号 |

---

## 边视觉语法

边不是“线”，边是“判断关系”。UI 中必须把 `edge_type` 翻译成人能读懂的关系动词。

| edge_type | UI 文案 | 视觉建议 |
|---|---|---|
| occurs_in | 发生于 | 绿色细实线 |
| emits | 产生/排放 | 琥珀色流向线 |
| limited_by | 受限于 | 蓝灰规则线 |
| regulated_by | 受法规约束 | 深蓝权威线 |
| obligation_of | 属于条款 | 深蓝细线 |
| manifests_as | 现场表现为 | 高亮主路径线，演示重点 |
| evidenced_by | 需要证据 | 半透明蓝灰线；shared 只到证据类别/概念字段，private 到判断标准 |
| rectified_by | 通过整改闭环 | 青绿色闭环线 |
| reported_as | 报告表述为 | 紫灰线 |
| pitfall_of | 常被误解/踩雷 | 紫色虚线或闪电线 |
| replaced_by / amended_by / split_into / merged_into / inherits_from / conflicts_with | 沿革/继承/冲突 | 蓝色虚线，带版本标记 |
| supports_stat | 汇入统计 | 波纹线 / 聚合标识 |

### confidence 编码

| confidence | 表达方式 |
|---:|---|
| ≥ 0.85 | 实线、较粗、亮度高，显示“高置信” |
| 0.60–0.85 | 中等实线，显示“已审核/待更多验证” |
| < 0.60 | 虚线、半透明，显示“候选/待审核” |
| 被整改验证提升 | 边上增加绿色闭环点 |
| 被驳回或冲突 | 边上增加警示折点，点击后进入审核说明 |

---

## tier 与私有层展示规则

三层授权必须可视化，不能只写在数据字段里。

| tier | UI 表达 | 规则 |
|---|---|---|
| shared | 绿色“可共有”徽章 / 实线外圈 | 可进入软著、培训、执法工具共有包 |
| private | 锁形徽章 / 磨砂遮罩 | 演示“看得见、带不走”；共有包物理过滤 |
| aggregate | 波纹/统计徽章 | 只显示区域/行业统计，不出现个体企业 |

### 共有视图下的 private 占位

共有视图不是把私有能力完全删空，而是显示“现场感存在、判定能力不交付”：

```text
证据类别：现场照片、台账记录、标签照片、转移联单
字段要求：需核对产生日期、危废类别、责任人（概念级）
```

真正私有能力只显示数量占位：

```text
证据标准：已建立 12 条（私有能力，不进入共有包）
整改模板：已建立 8 条（私有能力，不进入共有包）
报告表达：已建立 5 条（私有能力，不进入共有包）
```

禁止在共有视图中展示：

- 证据判断细则；
- 真实证据样例；
- ETO 审核笔记；
- 整改模板全文；
- 报告表达模板全文；
- 单个企业数据或可反推企业身份的数据；
- 真实企业照片、真实台账、真实排查记录。

---

## 执行卡联动规则

执行卡不是独立内容库，而是图切片渲染。UI 必须体现“图谱 ↔ 执行卡”双向联动。

| 操作 | 结果 |
|---|---|
| 点图谱节点 | 右侧执行卡滚动到对应章节 |
| 点执行卡“现场表现” | 图谱高亮 issue_type 与 manifests_as 边 |
| 点执行卡“法规依据” | 图谱高亮 law_article / law_obligation |
| 点执行卡“证据类型” | 图谱高亮 evidence_category / evidence_field_requirement，若触达 private 标准则显示遮罩说明 |
| 点执行卡“踩雷点” | 图谱高亮 pitfall_of 边；共有视图显示 pitfall_class/聚合统计,内部视图可看 pitfall_instance |
| 点边 | 底部/右侧抽屉展示 source_ref、confidence_evidence、legal_basis_status、review_status |

### 执行卡推荐结构

```text
1. 法条义务：条款号 / 义务谓词 / 适用对象 / 触发条件
2. 现场表现：高频问题类型 / 典型场景 / 常见误解
3. 证据类型：照片、台账、记录、标签等类别；共有视图展示概念级字段要求,内部视图展示判断标准
4. 整改方向：内部视图展示模板，共有视图展示“已建立标准”占位
5. 报告表达：内部视图展示语言模板，共有视图展示“已有表达规则”占位
6. 可信度：source_ref / confidence / 被现场验证次数 / 最近审核时间
7. 导出状态：shared / private / aggregate 标记
```

---

## 演示模式设计

演示模式服务主任团队，不服务普通后台操作。它必须有叙事节奏。

### C 刀法：执法工具升级前 / 升级后

| 幕 | 画面 | 目的 |
|---:|---|---|
| 1 | “升级前”：只有法条文本和案例检索 | 让对方承认现有工具缺现场 |
| 2 | 点击“接入现场执行图谱” | 引出我方价值 |
| 3 | 法条展开到行业、场景、污染源、问题类型 | 展示法规落地 |
| 4 | 高频问题与踩雷点出现 | 展示现场经验不是资料库能生成的 |
| 5 | 证据/整改/报告表达以遮罩出现 | 展示私有能力，但不交付私有层 |
| 6 | 缺口报告：法条无现场覆盖 / 现场问题无法条依据 / 踩雷排行 | 给政府侧培训和工具升级抓手 |
| 7 | 切换共有视图 | 展示软著/培训/执法工具可交付边界 |

### 开场动画限制

允许最多 3 秒开场动画，用于表现“现场经验汇聚成图”。开场结束必须回到 ego 视图，不允许让全图力导向成为主操作界面。

---

## 缺口报告 UI

缺口报告必须做成一等页面，不要藏在下载文件里。

| 模块 | 展示内容 | 价值 |
|---|---|---|
| 法条无现场覆盖 | law_obligation 无 manifests_as 出边 | 指出合规盲区 |
| 现场问题无法条依据 | issue_type 无 regulated_by 出边 | 区分管理经验与法律要求，避免 AI 错引法 |
| 高频踩雷排行 | pitfall_class 密度 / pitfall_pattern_stat 出现频次 / 行业分布 | 政府培训弹药 |
| 区域/行业统计 | stat_signal 聚合趋势 | 政策与监管资源配置依据 |
| 本月新增蒸馏 | outbox 离线快照 | 证明图谱是活的，不是一次性编纂 |

缺口报告页面必须保留一键导出 shared 版报告的入口，且导出前必须通过私有层零泄漏检查。

---

## 推荐技术组合与参考项目

### 第一版正式组合

| 模块 | 建议 | 说明 |
|---|---|---|
| 主图谱画布 | Cytoscape.js | 当前架构已选；适合 ego 图谱、边筛选、节点/边样式、点击展开 |
| 构建工具 | Vite | 当前架构已选；轻量、开发快 |
| 布局算法 | Cytoscape 内置布局 + dagre/elkjs 备选 | 层级路径复杂后再引入 |
| 图标系统 | Lucide | 统一语义图标，提升可解释性 |
| UI 组件 | 原生 CSS/轻组件优先；若 React 化再考虑 shadcn/ui + Radix | 当前不必为了组件库重写架构 |
| 演示图表 | 可先自绘；后续考虑 Tremor / visx | 用于缺口报告和统计页 |
| 质量说明面板 | 原生面板优先 | 展示 confidence_reason、evidence_count、last_verified_at、reviewer_role、staleness_risk |

### GitHub / 开源参考

| 项目 | 地址 | 用法建议 |
|---|---|---|
| Cytoscape.js | https://github.com/cytoscape/cytoscape.js | 主图谱画布；正式依赖 |
| AntV G6 | https://github.com/antvis/G6 | 参考节点、边、Combo、主题和图分析产品感 |
| Graphin | https://github.com/antvis/Graphin | 参考“左筛选 + 中央图 + 右详情”的 React 图分析布局 |
| xyflow / React Flow | https://github.com/xyflow/xyflow | 参考“法条 → 现场 → 证据 → 整改 → 报告”的路径解释视图 |
| Sigma.js | https://github.com/jacomyal/sigma.js | 后期节点上万、需要 WebGL 大图探索时再评估 |
| shadcn/ui | https://github.com/shadcn-ui/ui | 参考高级卡片、抽屉、Badge、Command 搜索、Tabs |
| Radix UI Primitives | https://github.com/radix-ui/primitives | 参考可访问性、Popover、Dialog、Tooltip、Context Menu |
| Lucide | https://github.com/lucide-icons/lucide | 语义图标系统 |
| Dagre | https://github.com/dagrejs/dagre | 有向层级布局备选 |
| ELKjs | https://github.com/kieler/elkjs | 更复杂的分层布局、端口布局、边路由备选 |
| react-force-graph | https://github.com/vasturiano/react-force-graph | 只参考 3 秒开场视觉，不做主视图 |
| DataHub | https://github.com/datahub-project/datahub | 参考 lineage、资产详情、治理状态、可信度面板的产品范式 |

### 不建议第一版引入

| 项目/能力 | 原因 |
|---|---|
| Neo4j / Graphiti | ADR-0006 未解锁前不上图数据库；第一刀规模不需要 |
| GitNexus 作为领域图谱 UI | GitNexus 适合代码导航，不适合环保领域图谱；可借鉴交互美学 |
| react-force-graph 作为主 UI | 容易变成毛线球，解释性差 |
| 大而全 BI 大屏框架 | 会把产品气质带偏成“政务汇报大屏”，不利于现场执行解释 |

---

## 组件拆分建议

```text
graph-ui/
├── src/
│   ├── app/                  # 初始化、路由、视图模式
│   ├── data/                 # 只读加载 data/exports 包
│   ├── graph/                # Cytoscape 初始化、layout、style、events
│   ├── semantics/            # node_type / edge_type / tier / confidence 映射
│   ├── components/
│   │   ├── TopStatusBar.ts/js
│   │   ├── LeftNavigator.ts/js
│   │   ├── EgoGraphCanvas.ts/js
│   │   ├── ExecutionCardPanel.ts/js
│   │   ├── EvidenceTraceDrawer.ts/js
│   │   ├── GapReportPanel.ts/js
│   │   └── DemoModeController.ts/js
│   ├── styles/
│   │   ├── tokens.css        # 颜色、字号、间距、阴影
│   │   ├── graph.css         # 节点/边/徽章样式
│   │   └── layout.css        # 驾驶舱布局
│   └── main.ts/js
└── reports/render-proof/     # 截图/录屏证据；不提交真实敏感数据
```

### 语义映射文件建议

建议单独建立：

```text
src/semantics/nodeVisualMap.ts
src/semantics/edgeVisualMap.ts
src/semantics/tierVisualMap.ts
src/semantics/confidenceVisualMap.ts
```

不要把颜色、图标、标签名散落在组件里。语义映射集中管理，后续改视觉不会破坏业务逻辑。

---

## 交互细节要求

### 搜索与聚焦

- 必须支持按节点名称搜索；
- 搜索结果要显示 node_type、tier、review_status；
- 选择结果后设为中心节点，并重建 ego 子图；
- 不允许搜索结果直接暴露 private 节点细节；内部视图除外。

### 过滤器

至少支持：

```text
edge_type
node_type
tier
confidence 区间
review_status
是否包含 pitfall
是否包含 private 占位
```

### 节点详情

节点详情默认只显示摘要。点击“查看溯源”才展开 source_ref 与审核记录，避免首屏信息过载。

### 边详情

点击边时必须显示：

```text
edge_type
业务解释文案
source_ref
confidence
confidence_evidence
legal_basis_status
review_status
tier
last_verified_at（如有）
```

---

## 可解释性验收标准

任何 UI 改动至少满足以下标准：

| 验收项 | 必须回答的问题 |
|---|---|
| 视觉语义 | 用户不读说明，能否区分法条、问题、证据、整改、踩雷点？ |
| 路径解释 | 用户能否从一条法条看见它如何落到现场？ |
| 证据解释 | 用户能否看见这个判断的 source_ref 和 confidence？ |
| 授权解释 | 用户能否看见 shared/private/aggregate 的边界？ |
| 演示解释 | 主任团队能否在 5 分钟内理解“升级前/升级后”？ |
| 安全解释 | 共有视图是否完全不泄漏 private 内容？ |

---

## frontend-render-proof 要求

UI 改动交付必须有实际呈现证据，不能只说“构建通过”。

至少保留：

```text
reports/render-proof/YYYYMMDD-graph-main.png
reports/render-proof/YYYYMMDD-card-panel.png
reports/render-proof/YYYYMMDD-shared-view.png
reports/render-proof/YYYYMMDD-demo-mode.mp4（涉及演示路径时）
```

截图必须覆盖：

1. 默认 ego 图谱；
2. 节点点击后右侧执行卡联动；
3. 边点击后 source_ref / confidence / quality 抽屉；
4. 内部全量 ↔ 共有视图切换；
5. private 内容在共有视图下被遮罩或过滤；
6. 缺口报告页面；
7. 边质量说明面板；
8. 监管口径一致性检查器结果。

---

## 禁区

- 不做全图力导向主视图（最多 3 秒开场动画）。
- 演示数据中的企业必须是合成样本；接入真实导出包前检查包类型（demo_package）。
- UI 改动交付必须有实际呈现证据（frontend-render-proof：截图/录屏）。
- 不把 private 节点/边内容塞进前端 bundle 后再靠 CSS 隐藏；共有包必须在数据层物理过滤。
- 不伪造蒸馏计数器；模拟数据必须明确标注“模拟”。
- 不在图节点里展示法条全文；全文只通过 RAG 引文面板按需获取。
- 不为了炫酷牺牲交互可解释性；看不懂的动效一律删除。

---

## 验证

`pnpm ui:build` 进 verify all；视觉验收人工 + 截图留 `reports/`。

建议新增 UI 专项验收清单：

```text
pnpm ui:build
pnpm verify:all
人工验收：frontend-render-proof 6 张/段证据齐全
人工验收：共有视图 private 内容不可见且不可从前端数据中恢复
人工验收：主任演示模式 5 分钟路径可讲通
```
