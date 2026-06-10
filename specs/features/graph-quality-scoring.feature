# language: zh-CN
功能: 图谱质量评分
  作为图谱审核者和政府演示讲解者
  我需要每条边不只给 confidence 分数,还给出质量解释
  以证明关联来自现场、审核与整改闭环,而不是模型臆测

  场景: 每条边必须带质量解释字段
    当 构建任意图谱边
    那么 边必须包含 confidence_reason、evidence_count、last_verified_at、reviewer_role、staleness_risk
    而且 confidence_reason 至少包含一个来源原因

  场景: 高置信法律映射边的来源要求
    假如 一条 regulated_by 或 manifests_as 边 confidence 大于等于 0.8
    那么 confidence_reason 必须包含 "LAW_MAPPING_REVIEWED" 或 "GOVERNMENT_CONFIRMED"
    而且 reviewer_role 不得是 "UNKNOWN"

  场景: 陈旧风险进入审核提示
    假如 一条边 staleness_risk 是 "high"
    那么 卡片和报告生成不得静默使用该边
    而且 输出必须标注需要人工复核

  场景: 整改成效解释置信度
    假如 confidence_reason 包含 "RECTIFICATION_VERIFIED"
    那么 confidence_evidence 必须包含 verified_count
    而且 verified_count 必须大于 0
