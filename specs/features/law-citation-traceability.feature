# language: zh-CN
功能: 法规引用可追溯与降级
  作为报告与卡片的消费者
  我需要每个法规引用可追溯且在依据不足时正确降级
  以避免错引法条与"管理建议包装成法律要求"(CONTEXT.md §5, ADR-0003)

  场景: 法条引用必须带条款号且全文来自 RAG
    假如 一张执行卡引用了 law_article 节点
    那么 引用必须包含法规名与条款号
    而且 条款全文必须凭节点的 rag_doc_ref 从腾讯云知识引擎获取
    而且 图谱节点内不得存储条款全文

  场景: 法规知识库不可用时降级
    假如 腾讯云知识引擎检索失败或不可用
    那么 输出不得引用具体法律条文原文
    而且 应使用降级表达并标注"法规依据待人工核对"

  场景: 管理经验类问题禁止表述为违法
    假如 一个 issue_type 没有任何 "regulated_by" 或 "manifests_as" 入边
    那么 该问题在卡片与报告中必须归类为"管理经验类问题"
    而且 表述中不得出现"违反"、"不符合 XX 法"等定性用语

  场景: 结论可回溯
    假如 任何输出中出现"问题 → 法条"的判断
    那么 对应的边必须存在且带 source_ref 与 confidence
    而且 对应边必须带 legal_basis_status

  场景: 法律依据状态控制表述
    假如 legal_basis_status 是 "official_confirmed"
    那么 对外报告可以使用"依据"或"根据"表述
    假如 legal_basis_status 是 "internal_reviewed"
    那么 对外报告只能使用"参考相关要求"表述
    假如 legal_basis_status 是 "candidate"
    那么 该依据只能作为内部提示,不得对外引用
    假如 legal_basis_status 是 "disputed"
    那么 输出必须进入人工审核
    假如 legal_basis_status 是 "no_legal_basis"
    那么 输出只能写管理建议,不得写"违法"或"违反"
