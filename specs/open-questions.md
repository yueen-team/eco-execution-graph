# 开放问题与待确认口径

| # | 问题 | 当前默认 | 决策人 | 状态 |
|---|---|---|---|---|
| Q1 | C 刀法依赖执法大队工具细节,能否拿到? | 拿不到则按主任口头描述做模拟对照界面 | candy(前置动作) | OPEN |
| Q2 | pitfall 节点默认 tier=shared 还是 private? | 已拆为 pitfall_class(shared)/pitfall_pattern_stat(aggregate)/pitfall_instance(private) | candy | CLOSED 2026-06-10 |
| Q3 | 演示部署形态:本地笔记本 / 内网 / 云端只读站? | 本地笔记本(零依赖,ADR-0006 顺带满足) | candy | OPEN |
| Q4 | 政府 lineage 数据实际格式 | 按 docs/api/lineage-exchange.md v0 谈 | 双方对接 | OPEN |
| Q5 | pollutant_id 标准化字典引用方式(同库/同步表/接口) | 继承蒸馏 v2 spec O1,倾向同步表 | candy + Yunnan 侧 | OPEN |
| Q6 | 危废域首批样板卡法条清单(固废法/危废贮存标准 GB18597/识别标志规范等优先级) | 第一轮 5 张精品卡 + 15 张半成品卡,由 candy 与 ETO 圈定 | candy + ETO | OPEN |
| Q7 | 聚合层最小样本数阈值 | ≥5 家(ARCHITECTURE §6.3) | candy | 默认生效,可调 |
| Q8 | 演示中"蒸馏计数器"接真实 outbox 统计还是预生成快照? | 真实统计的离线快照(演示无网依赖,且不造假) | candy | OPEN |
| Q9 | P0.5 上下文装配离线验证的 ETO 评分表 | 对比旧 AI 直接写 vs 图谱装配后写,看专家感、可追溯、法律降级、报告自然度 | candy + ETO | OPEN |
| Q10 | 图谱质量评分阈值 | P1 默认 high confidence: confidence >= 0.8 且含 LAW_MAPPING_REVIEWED/ETO_CONFIRMED 等原因 | candy + ETO | OPEN |
| Q11 | 云南环保高频踩雷地图第一版区域粒度 | 默认州市级;县区级需额外确认样本数与脱敏风险 | candy | OPEN |
| Q12 | 监管口径一致性检查器风险等级 | 默认 blocking/warning/info 三档 | candy + ETO | OPEN |
