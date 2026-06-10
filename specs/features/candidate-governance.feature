# language: zh-CN
功能: CANDIDATE 治理膜
  作为知识质量的守门人
  我需要 ingest 产物默认候选、晋级必经人审
  以延续 spl/eco-kb 的治理纪律(ADR-0004)

  场景: 现场事件入图默认 CANDIDATE
    当 ingest 消费一条 EcoCheck semantic_event v2 事件
    那么 产生的所有节点、边、溯源记录的 review_status 必须是 "CANDIDATE"

  场景: 晋级必须有人工审核记录
    假如 一条记录从 "CANDIDATE" 变为 "HUMAN_REVIEWED" 或 "APPROVED_BASELINE"
    那么 必须存在审核人与审核时间记录
    而且 审核人不得是自动流程

  场景: CANDIDATE 不进共有包
    当 导出共有包
    那么 包内记录的 review_status 必须是 "APPROVED_BASELINE"

  场景: 不写 Yunnan 正式库
    假如 任何图谱数据被推送到外部系统
    那么 目标不得是 Yunnan ConfirmedDataset
    而且 核算相关信号只能以"提示"形式输出
