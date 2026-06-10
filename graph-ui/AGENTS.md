# graph-ui 子模块指南

## 模块边界

Cytoscape.js + Vite 的 ego 视图驾驶舱。**只读消费 `data/exports/` 的包**,不写任何数据。

## 核心交互模型(ADR-0009)

状态 = 当前中心节点 + 展开深度(1-2 跳)+ 边类型过滤器 + 视图模式。

| 必做 | 说明 |
|---|---|
| ego 展开 | 点节点 → 设为中心 → 取邻域子图 |
| tier 徽章 | shared/private/aggregate 三色标识 |
| confidence 着色 | 边按置信度渐变;展示 confidence_evidence("被现场验证 N 次") |
| 视图切换 | 内部全量 ↔ 共有视图一键切换(ADR-0008,切换本身是演示环节) |
| 蒸馏计数器 | 真实 outbox 统计的离线快照(specs Q8),不造假 |
| 演示模式 | C 刀法对照叙事:执法工具"升级前 / 升级后" |

## 禁区

- 不做全图力导向主视图(最多 3 秒开场动画)。
- 演示数据中的企业必须是合成样本;接入真实导出包前检查包类型(demo_package)。
- UI 改动交付必须有实际呈现证据(frontend-render-proof:截图/录屏)。

## 验证

`pnpm ui:build` 进 verify all;视觉验收人工 + 截图留 `reports/`。
