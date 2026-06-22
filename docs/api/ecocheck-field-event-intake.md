# EcoCheck 候选现场经验接收契约 v0

## 定位

EcoCheck 负责现场业务事实确认,graph Web 端负责现场经验入图审核、聚合准入和导出隔离。EcoCheck 推送过来的记录默认只是候选现场经验,只能进入 graph private staging。

## 接收接口

`POST /api/ecocheck/field-events`

云托管环境必须设置 `ECO_GRAPH_API_TOKEN`;服务启动时会校验生产或 CloudBase 环境是否配置该变量,未配置不得启动。设置后请求头必须携带:

```http
Authorization: Bearer <ECO_GRAPH_API_TOKEN>
```

请求体支持两类 EcoCheck payload:

- `ecocheck.semantic_event.v2`:现场问题、审核、整改事实候选。
- `ecocheck.profile_gap_confirmed.v1`:企业画像缺口确认,只进入画像缺口治理记录,不进入现场问题/整改聚合统计。

共享 schema 第一版落在
`E:\eco-ontology\schemas\semantic_event.v2.schema.json` 和
`E:\eco-ontology\schemas\profile_gap_confirmed.v1.schema.json`;graph 本仓通过
`pnpm ontology:validate:report-only` 以 report-only 模式校验
`data/fixtures/ecocheck-field-event-fixture.json`、
`data/fixtures/ecocheck-profile-gap-confirmed-fixture.json` 和现有 graph 导出实例,报告写入
`reports/ontology-contract-report-only-validation.json` / `.md`。该命令只记录 drift,不阻断现有 verify。

`semantic_event.v2` 第一版只读取以下最小字段:

```jsonc
{
  "schema_version": "ecocheck.semantic_event.v2",
  "event_type": "RECTIFICATION_VERIFIED",
  "source_system": "EcoCheck",
  "occurred_at": "2026-06-12T09:30:00+08:00",
  "field_issue_uid": "synthetic-issue-001",
  "business_key": "synthetic-inspection-001",
  "source_context": {
    "company_id": "internal-only",
    "company_name": "仅内部审核页可见",
    "region": "昆明市",
    "industry_type": "汽车维修",
    "permit_type": "排污登记"
  },
  "standard_issue_type_candidate": {
    "issue_type_ref": "issue:hw:label-incomplete",
    "name": "危废标签内容不完整"
  },
  "environmental_risk_category": {
    "dimension": "危险废物管理"
  },
  "observed_signals": ["标签缺少产生日期"],
  "risk_impact_summary": "危废包装容器标签字段缺失,现场追溯困难。",
  "evidence_chain": {
    "evidence_count": 2,
    "evidence_types": ["现场照片", "台账记录"]
  },
  "rectification": {
    "requirement": "补齐标签字段,并与台账记录保持一致。",
    "status": "已通过"
  },
  "recheck_points": ["复核标签字段"],
  "ai_regulatory_references": [
    { "ref": "law:swl:art77", "title": "固体废物污染环境防治法 第七十七条" }
  ]
}
```

`profile_gap_confirmed.v1` 第一版只读取以下最小字段:

```jsonc
{
  "schema_version": "ecocheck.profile_gap_confirmed.v1",
  "event_type": "COMPANY_PROFILE_GAP_CONFIRMED",
  "business_key": "synthetic-profile-gap-001",
  "company_id": "synthetic-company-profile-gap-001",
  "gap_dimension": "危险废物管理",
  "eso_decision": "PRESENT",
  "site_verification": "ESO_CONFIRMED_APPLICABLE",
  "knowledge_approval_basis": "approved_show_if_rules_v1_0",
  "recall_basis": {
    "rule_ref": "SHOWIF::SCN_HAZWASTE_STORAGE_TRANSFER::FIRST",
    "sanitized_reason": "现场确认企业存在危废暂存和转移场景"
  }
}
```

`business_key` 是 graph intake 的幂等键。若 EcoCheck 暂时仍在 transport envelope 中携带该值,进入 blocking 前必须保证 graph 请求体 root 或显式 envelope 可见同一个值;当前 graph 已保留 root `business_key` 到审核记录和技术追溯。

## 接收后状态

graph 必须生成一条中文审核记录:

- 当前审核状态:`待审核`
- 是否允许进入聚合:`false`
- 存储位置:`private staging`

该记录不得直接写入 aggregate,也不得进入 shared 导出。

`profile_gap_confirmed.v1` 生成的记录必须标记为 `事件类别=profile_gap_confirmed`,默认 `仅保留内部案例`,并保持 `是否允许进入聚合=false`。

## 拒绝规则

接口必须拒绝以下内容:

- 法条全文或 RAG 原文正文;
- 真实附件路径、云存储路径、照片 URL;
- GPS、经纬度或其他现场定位原始值;
- 密钥、Token、鉴权头;
- 原始企业报告全文;
- 任何准备直接对外导出的企业级明细。

## 审核结论

`POST /api/review/field-events/:id/decision`

允许的审核结论:

- `通过，进入聚合候选`
- `仅保留内部案例`
- `退回补充`
- `合并到已有问题类型`
- `不入图`

只有 `通过，进入聚合候选` 和 `合并到已有问题类型` 可以把 `是否允许进入聚合` 置为 `true`。

状态语义:

- `已通过(待聚合)`:ETO 直接确认可入图,并允许进入聚合统计;"待聚合"提示尚需同组合满 5 家企业才会真正出现在聚合行里。
- `已进入聚合候选`:ETO 选择合并到已有问题类型后进入聚合候选,聚合时按合并目标问题类型归并。

## 聚合批次

`POST /api/aggregate/pitfall-batches`

聚合维度固定为:

- 区域
- 行业
- 环保维度
- 问题类型
- 法条/规范引用

输出行固定为:

```jsonc
{
  "region": "昆明市",
  "industry": "汽车维修",
  "dimension": "危险废物管理",
  "issue_type_ref": "issue:hw:label-incomplete",
  "law_or_spec_ref": "law:swl:art77",
  "sample_size": 5,
  "event_count": 5,
  "recurrence_rate": 1.0,
  "rectification_difficulty": "low",
  "eto_reviewed_count": 5,
  "last_verified_at": "2026-06-12T10:00:00+08:00",
  "source_ref": "src:ecocheck-aggregate:pitfall-map:2026-06",
  "batch_id": "pitfall-map:2026-06"
}
```

`sample_size < 5` 的组合只能进入样本不足池,不得输出 aggregate 行。

## 部署边界

- `graph-ui/` 继续部署到 CloudBase 静态托管。
- `graph-api/` 部署到 CloudBase 云托管,必须设置 `ECO_GRAPH_API_TOKEN`、`ECO_GRAPH_ENV=production` 或 `ECO_GRAPH_DEPLOY_TARGET=cloudbase`。
- `graph-ui` 调用有锁后端时必须通过 CloudBase 网关或同源代理传递内部鉴权,不得把长期服务密钥硬编码进静态前端。
- 第一版文件化 `data/private-staging/` 只允许本地或单实例试运行。CloudBase 云托管建议设置 `ECO_GRAPH_STORAGE_DRIVER=mysql`,由 `graph-api` 启动脚本自动建表、补齐缺失列和索引,避免容器重启或扩缩导致审核记录丢失。
- CloudBase 只读 shared 静态包不装载审核数据。

## 请求大小

`graph-api` 默认限制单次请求体不超过 1 MiB。可通过 `ECO_GRAPH_MAX_BODY_BYTES` 调整,但不得用它接收原始照片、附件或报告全文。
