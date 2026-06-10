# language: zh-CN
功能: 监管口径一致性检查器
  作为报告质量门禁
  我需要检查报告结论是否错引法条、混淆管理建议与法律要求、缺少证据链或使用过度承诺表达
  以降低对外报告和政府合作中的法律风险

  场景: 检查不存在或不可追溯的法条引用
    假如 报告结论引用了某个法条
    当 运行监管口径一致性检查器
    那么 系统必须确认存在对应 law_article 节点和 source_ref
    而且 找不到时输出 "missing_law_reference" 风险

  场景: 管理经验不得写成违法
    假如 报告结论对应的 issue_type legal_basis_status 是 "no_legal_basis"
    那么 检查器必须拒绝"违法"、"违反"、"不符合 XX 法"等定性表达
    而且 输出 "management_advice_miscast_as_law" 风险

  场景: 候选或争议依据不得对外引用
    假如 报告结论使用的法律判断边 legal_basis_status 是 "candidate" 或 "disputed"
    那么 检查器必须输出阻断级风险
    而且 要求人工审核后才能对外使用

  场景: 证据链缺失必须提示
    假如 报告结论包含问题、法条或整改判断
    但是 trace 中缺少 issue_type、evidence_category 或 source_ref
    那么 检查器必须输出 "missing_evidence_chain" 风险

  场景: 已废止或待确认条款必须降级
    假如 law_article effective_status 不是 "现行有效"
    那么 检查器必须输出 "law_status_risk"
    而且 报告表达不得使用确定性法律依据语气
