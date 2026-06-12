# language: zh-CN
功能: 政府法典沿革迁移
  作为生态环境法典行业现场执行图谱的维护者
  我需要把旧法条到新法典条款的沿革关系写成可校验的关系边
  以便法典生效后能够迁移引用,同时避免把占位样例说成真实政府数据

  场景: 契约支持六类真实沿革关系
    当 系统检查政府 lineage 契约
    那么 支持的关系必须包含 replaced_by、amended_by、split_into、merged_into、inherits_from、conflicts_with
    而且 不得把 lineage 只保存为 lineage_ref 字符串

  场景: 契约样例可校验但不冒充真实导入
    假如 当前只有 contract_fixture 样例,没有 government_confirmed 数据集
    当 系统生成 lineage readiness 报告
    那么 契约样例必须通过
    而且 真实政府 lineage 导入必须标记为 blocked

  场景: 冲突口径不自动迁移
    假如 lineage 记录的关系是 conflicts_with
    那么 系统不得自动迁移对外报告引用
    而且 必须进入人工审核清单
