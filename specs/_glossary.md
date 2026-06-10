# 术语表(已确认口径)

| 术语 | 定义 | 备注 |
|---|---|---|
| 现场执行图谱 | 法规/规范/现场经验的关联图,本项目产物 | 区别于"资料知识库"(RAG)与"行为规格库"(BDD) |
| 执行卡 | 《法条↔现场执行卡》:以一条法条为根的图切片渲染 | 两个视图:内部全量 / 共有导出 |
| 三层授权 / tier | shared(共有)/ private(私有)/ aggregate(聚合) | 红线见 CONTEXT.md §3,ADR-0002 |
| 看得见、带不走 | 演示展示私有层但不交付 | ADR-0008 |
| 缺边检测 | 法条无现场覆盖 / 现场问题无法条依据 / 踩雷密度排行 | 双向缺口报告的三个组成 |
| 踩雷点(pitfall) | 法规条款被企业普遍误解或与实际场景脱节的知识点 | 一等节点族,ADR-0007 |
| pitfall_class | 可共有的踩雷类型 | 说明"这类问题普遍存在",不含企业实例 |
| pitfall_pattern_stat | 聚合踩雷统计 | 满足最小样本数才可输出 |
| pitfall_instance | 企业级踩雷实例 | private,脱敏也不出 |
| 证据类别 | 可共有的现场证据类型,如现场照片/台账记录/标签照片/转移联单 | 不等于证据判断标准 |
| 证据字段要求 | 证据需核对的字段或概念级要求 | shared 版只出概念级/部分字段 |
| 证据判断标准 | ETO 如何判断证据充分、缺失、矛盾或可整改 | private |
| 焊接点 | issue_type:唯一同时连法条/证据/整改/报告/统计的节点类型 | |
| 现场蒸馏 | ESO/ETO 在三闸口的结构化判断采集 | v2 spec 见 E:\knowledge-graph |
| delta | ESO 初判 vs ETO 终判的差异 + 理由 | 一等专家经验,非日志噪音 |
| 置信靠挣 | confidence 由整改成效回写,非手填 | ADR-0005 |
| 图谱质量评分 | confidence + confidence_reason + evidence_count + last_verified_at + reviewer_role + staleness_risk | 用于解释"为什么可信" |
| staleness_risk | 关联因法规更新、样本过少或长期未验证产生的陈旧风险 | high 时需人工复核 |
| 云南环保高频踩雷地图 | 区域 × 行业 × 环保维度 × 问题类型 × 法条/规范 × 复发率 × 整改难度的聚合视图 | 只消费 aggregate 层 |
| 监管口径一致性检查器 | 对报告结论做法规引用、管理经验、证据链、过度承诺、条款状态的一致性检查 | 先做内部质量门禁 |
| 治理膜 | CANDIDATE 与 APPROVED/正式库之间的人工审核边界 | 继承 spl/eco-kb 纪律 |
| 法条瘦节点 | 只存 ID/条款号/义务谓词/lineage_ref 的 law_article | 全文在腾讯云 RAG,ADR-0003 |
| lineage | 法条沿革关系(单行法 → 生态环境法典) | 政府合作的技术咬合点 |
| 管理经验类问题 | 无法条依据但有管理价值的现场问题 | 报告中禁止表述为违法,CONTEXT §5.3 |
| legal_basis_status | 法律依据口径状态 | official_confirmed/internal_reviewed/candidate/disputed/no_legal_basis |
| 共有包 | tier=shared 物理过滤后的导出包 | 软著/培训/执法工具用 |
| 环保管家智能底座 | 企业侧命名 | 不对外强调图谱技术 |
| 生态环境法典行业现场执行图谱 | 政府侧命名 | 强调法典与现场执行视图 |
| 环保语义操作系统 | 战略层命名 | 同一底座的长期定位 |
| ESO / ETO | 环保服务官(现场)/ 环保技术官(审核) | EcoCheck 角色 |
