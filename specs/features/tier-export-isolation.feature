# language: zh-CN
功能: 三层授权导出隔离
  作为图谱的治理者
  我需要共有包和聚合包对私有层物理隔离
  以保证商业壁垒与企业数据红线(ADR-0002, CONTEXT.md §3)

  背景:
    假如 图谱中存在 tier 为 "shared"、"private"、"aggregate" 的节点和边

  场景: 共有包导出物理过滤私有层
    当 以 tier_filter "shared" 导出共有包
    那么 包内任何记录的 tier 都必须是 "shared"
    而且 包内不得出现节点类型 "enterprise"、"facility"、"issue_instance"、"evidence_requirement"、"rectification_template"、"report_expression"
    而且 manifest 必须声明 tier 过滤方式与各文件 sha256

  场景: 私有端点的边不得进入共有包
    假如 一条边的任一端点节点 tier 为 "private"
    那么 该边的 tier 必须为 "private"
    而且 该边不得出现在共有包中

  场景: 聚合包满足最小样本数
    当 导出聚合统计包
    那么 包内只允许节点类型 "stat_signal"
    而且 每条统计记录的样本企业数必须大于等于 5

  场景: 泄漏即构建失败
    假如 导出过程中检测到任何 tier 不符记录
    那么 导出必须失败并输出违规记录清单
    而且 不得产生部分导出文件
