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
    而且 法条存在但本结论 trace 没有挂接时也必须阻断

  场景: 管理经验不得写成违法
    假如 报告结论对应的 issue_type legal_basis_status 是 "no_legal_basis"
    那么 检查器必须拒绝"违法"、"违反"、"不符合 XX 法"等定性表达
    而且 输出 "management_advice_miscast_as_law" 风险

  场景: 候选或争议依据不得对外引用
    假如 报告结论使用的法律判断边 legal_basis_status 是 "candidate" 或 "disputed"
    那么 检查器必须输出阻断级风险
    而且 要求人工审核后才能对外使用

  场景: 内部审核口径不得写成官方依据
    假如 报告结论使用的法律判断边 legal_basis_status 是 "internal_reviewed"
    当 结论面向企业、政府演示或共有导出
    那么 不得写成"依据"、"根据"、"违法"或"违反"
    而且 必须降级为"参考相关要求"或"建议结合监管口径确认"

  场景: 证据链缺失必须提示
    假如 报告结论包含问题、法条或整改判断
    但是 trace 中缺少 issue_type、evidence_category 或 source_ref
    那么 检查器必须输出 "missing_evidence_chain" 风险
    而且 对外表达必须降级为 "建议核查" 或 "管理建议"

  场景: 已废止或待确认条款必须降级
    假如 law_article effective_status 不是 "现行有效"
    那么 检查器必须输出 "law_status_risk"
    而且 报告表达不得使用确定性法律依据语气

  场景: 过度承诺表达必须阻断
    假如 报告结论出现 "必然合规"、"完全合法"、"保证通过" 或 "无任何风险"
    那么 检查器必须输出 "overcommitted_language" 风险
    而且 建议改写为需结合证据和监管口径确认的表达

  场景: 政府确认口径不一致必须人工审核
    假如 trace 中的 law_article 或法律判断边标记为政府口径不一致
    那么 检查器必须输出 "government_position_mismatch" 风险
    而且 不得直接进入对外报告或主任演示结论
