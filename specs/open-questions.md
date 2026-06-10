# 开放问题与待确认口径

| # | 问题 | 当前默认 | 决策人 | 状态 |
|---|---|---|---|---|
| Q1 | C 刀法依赖执法大队工具细节,能否拿到? | 拿不到则按主任口头描述做模拟对照界面 | candy(前置动作) | OPEN |
| Q2 | pitfall 节点默认 tier=shared 还是 private? | shared(培训/执法弹药价值),实例可改 private | candy | OPEN |
| Q3 | 演示部署形态:本地笔记本 / 内网 / 云端只读站? | 本地笔记本(零依赖,ADR-0006 顺带满足) | candy | OPEN |
| Q4 | 政府 lineage 数据实际格式 | 按 docs/api/lineage-exchange.md v0 谈 | 双方对接 | OPEN |
| Q5 | pollutant_id 标准化字典引用方式(同库/同步表/接口) | 继承蒸馏 v2 spec O1,倾向同步表 | candy + Yunnan 侧 | OPEN |
| Q6 | 危废域首批 20-30 张卡的法条清单(固废法/危废贮存标准 GB18597/识别标志规范等优先级) | P1 启动时由 candy 与 ETO 圈定 | candy + ETO | OPEN |
| Q7 | 聚合层最小样本数阈值 | ≥5 家(ARCHITECTURE §6.3) | candy | 默认生效,可调 |
| Q8 | 演示中"蒸馏计数器"接真实 outbox 统计还是预生成快照? | 真实统计的离线快照(演示无网依赖,且不造假) | candy | OPEN |
