# 一阶段实施计划 · 危废精品切片冲刺

- 周期:14 天
- 目标:用 5 张危废精品执行卡证明"政府演示 + ETO 认可 + 月报变好 + 私有层安全 + 图谱可扩域"
- 原则:不追 20-30 张完整精品卡;不引入图数据库;不把执行卡做成手工内容库;不把 shared 当完整能力层。

## 成功标准

1. 主任团队能在 5 分钟内理解"你们有法条,我们补现场;你们有工具,我们补场景"。
2. ETO 认可图谱装配后的月报段落明显优于普通 AI 直接写。
3. 5 张精品卡均由图谱切片渲染,不是独立手写内容库。
4. shared 导出包通过零泄漏验证,private 判断标准、整改模板、报告表达不出。
5. 监管口径一致性检查器能抓出错引、违法化、证据链断裂、候选依据外用等风险。

## 14 天切片

| 时间 | 任务 | 产物 | 验证 |
|---|---|---|---|
| D1-D2 | 定 5 个精品 issue_type | 危废标签不规范、危废台账不完整、贮存分区不清、识别标志缺失、转移/入库记录不一致 | candy + ETO 确认 |
| D2-D3 | 建 issue_type registry + aliases | `issue_type` canonical、aliases、维度、风险说明 | 同义问题可归一 |
| D3-D5 | 绑定高置信法条/规范 | 每个 issue_type 绑定 1-3 个 `regulated_by` / `manifests_as` 边 | 只保留 high-confidence,带 `legal_basis_status` |
| D4-D7 | 建图谱质量评分字段 | `confidence_reason`、`evidence_count`、`last_verified_at`、`reviewer_role`、`staleness_risk` | `graph-quality-scoring.feature` 通过 |
| D5-D8 | 生成 5 张内部全量执行卡 + 5 张 shared 执行卡 | 内部版含证据判断/整改/报告表达;shared 版只给证据类别、概念字段、统计 | 卡片均能追溯到图节点/边/source |
| D7-D9 | 做双向缺口报告 | 法条无现场覆盖、现场问题无法条依据、高频踩雷排行 | 不输出 `pitfall_instance` 或企业细节 |
| D8-D10 | 做 P0.5 月报段落对比 | 合成企业 + 3 条危废问题 → 普通 AI vs 图谱装配 AI | ETO 评分表 |
| D9-D11 | 做监管口径一致性检查器雏形 | 离线 checker + 风险码 | 能抓 5 类核心风险 |
| D10-D12 | 做 ego 图谱最小演示 | 点法条、点问题、点行业三种入口 | frontend-render-proof 截图 |
| D12-D13 | 生成 shared 导出包与泄漏检测 | `shared_package` + manifest + hash | `verify leak` 通过 |
| D13-D14 | 彩排政府演示叙事 | "升级前/升级后"脚本 + 讲解路径 | 5 分钟讲通 |

## 第一阶段产物清单

- 5 个精品 `issue_type` registry + aliases;
- 5 张内部全量执行卡;
- 5 张 shared 执行卡;
- 15 张半成品执行卡骨架;
- 1 份双向缺口报告;
- 1 个 shared 导出包;
- 1 个 ego 图谱最小演示;
- 1 份月报段落对比报告;
- 1 个监管口径一致性检查器离线雏形;
- 1 份图谱质量评分字段覆盖报告;
- 1 组 frontend-render-proof 截图。

## 明确非目标

- 不做 13 个环保维度铺开;
- 不做图数据库;
- 不做完整地图大屏;
- 不接正式 EcoCheck runtime;
- 不把 private 证据判断标准、整改模板、报告表达交付到 shared 包;
- 不把执行卡作为手工内容库维护。

## 停止条件

- 任何 shared 导出泄漏 private node / edge / source;
- 任何报告把 `no_legal_basis` 问题写成违法;
- 5 张精品卡无法从图谱 trace 回放;
- ETO 认为图谱装配版报告没有明显优于普通 AI;
- 连续 3 次修复同一验证失败仍失败。
