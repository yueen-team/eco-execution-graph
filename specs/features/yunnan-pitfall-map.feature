# language: zh-CN
功能: 云南环保高频踩雷地图
  作为政府侧培训与监管资源配置的消费者
  我需要看到区域、行业、环保维度、问题类型、法条规范、复发率和整改难度的聚合信号
  以判断基层培训与监管资源应该优先投向哪里

  场景: 踩雷地图只消费聚合层
    当 生成云南环保高频踩雷地图
    那么 输入只能来自 tier 为 "aggregate" 的 stat_signal 或 pitfall_pattern_stat
    而且 不得读取或输出 enterprise、issue_instance、pitfall_instance 或 evidence_instance

  场景: 聚合样本数不足不得输出
    假如 一个区域行业组合的样本企业数小于 5
    那么 该组合不得进入地图或对外报告
    而且 系统只能输出"样本不足,不展示"

  场景: 地图维度必须可追溯到图谱
    当 输出一条踩雷地图信号
    那么 它必须包含区域、行业、环保维度、issue_type、law_article 或 tech_spec、复发率、整改难度
    而且 必须带 source_ref 和生成批次
