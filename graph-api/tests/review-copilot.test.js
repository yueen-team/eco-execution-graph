import test from "node:test";
import assert from "node:assert/strict";
import { buildGraphContextResponse } from "../src/graph-context.js";
import {
  buildCopilotBackbone,
  detectMismatches,
  dropTracelessFindings,
  normalizeEffectiveStatus,
  readinessFrom,
  downgradeGuidance,
  evidenceRequirementFor,
} from "../src/review-copilot.js";

const APPROVED = { tier: "shared", review_status: "APPROVED_BASELINE" };
const CONFIRMED_EDGE = {
  tier: "shared",
  review_status: "APPROVED_BASELINE",
  source_ref: "src:test",
  legal_basis_status: "internal_reviewed",
  confidence: 0.8,
  confidence_reason: ["MANUAL_REVIEWED"],
};

// 主 fixture:已废止法条(命中 law_status_risk deprecated) + issue->obligation->law 两跳
// + evidenced_by 到 evidence_field_requirement 节点(命中 evidence_insufficient)。
function deprecatedGraph() {
  return {
    nodes: [
      { node_id: "issue:hw:label", node_type: "issue_type", name: "危废标签不规范", ...APPROVED },
      { node_id: "obl:hw:label", node_type: "law_obligation", name: "危废标签管理义务", ...APPROVED },
      {
        node_id: "law:swl:art77",
        node_type: "law_article",
        name: "固体废物污染环境防治法 第七十七条",
        ...APPROVED,
        attrs: {
          law_name: "固体废物污染环境防治法",
          article_no: "第七十七条",
          rag_doc_ref: "tencent-lke://law/swl/art77",
          effective_status: "已废止",
        },
      },
      { node_id: "evidence:label-photo", node_type: "evidence_field_requirement", name: "标签照片", ...APPROVED },
    ],
    edges: [
      { edge_id: "edge:regulated:label", from: "issue:hw:label", to: "obl:hw:label", edge_type: "regulated_by", ...CONFIRMED_EDGE },
      { edge_id: "edge:obligation:art77", from: "obl:hw:label", to: "law:swl:art77", edge_type: "obligation_of", ...CONFIRMED_EDGE },
      { edge_id: "edge:evidenced:label", from: "issue:hw:label", to: "evidence:label-photo", edge_type: "evidenced_by", ...CONFIRMED_EDGE },
    ],
  };
}

const DEPRECATED_PUBLICATION = {
  items: [{
    rag_doc_ref: "tencent-lke://law/swl/art77",
    review_status: "approved",
    legal_basis_status: "internal_reviewed",
    citation_locator: "第七十七条",
    cache_policy: "metadata_only",
    raw_cached: false,
  }],
};

function deprecatedContext() {
  return buildGraphContextResponse({
    graph: deprecatedGraph(),
    publication: DEPRECATED_PUBLICATION,
    nodeId: "issue:hw:label",
    depth: 2,
  });
}

// 把现场建议写成硬法表达、法条候选为空、证据缺失、整改未闭环的候选。
function miscastItem() {
  return {
    "审核编号": "review:main001",
    "问题类型引用": "issue:hw:label",
    "建议问题类型": "危废标签不规范",
    "现场问题摘要": "标签缺失,违反固废法相关要求,依据该法应限期整改",
    "整改要求": "限期补齐危废标签",
    "证据摘要": { "证据数量": 0, "证据类型": [] },
    "法条规范候选": [],
    "整改结果": "未形成闭环",
    "整改历史摘要": { "驳回次数": 0, "任务状态": "未形成整改任务" },
    "区域": "华东",
    "行业": "医院",
    "环保维度": "hazardous_waste",
    "合并目标问题类型": "",
    "企业内部标识": "ent-1",
    "当前审核状态": "待审核",
    "是否允许进入聚合": false,
  };
}

// 干净 fixture:现行有效法条 + 法条候选齐备 + 证据充分 + 整改已闭环,detectMismatches 应为空。
function cleanGraph() {
  return {
    nodes: [
      { node_id: "issue:hw:clean", node_type: "issue_type", name: "危废标签不规范", ...APPROVED },
      { node_id: "obl:clean", node_type: "law_obligation", name: "危废标签管理义务", ...APPROVED },
      {
        node_id: "law:clean",
        node_type: "law_article",
        name: "固体废物污染环境防治法 第七十七条",
        ...APPROVED,
        attrs: {
          law_name: "固体废物污染环境防治法",
          article_no: "第七十七条",
          rag_doc_ref: "tencent-lke://law/clean",
          effective_status: "现行有效",
        },
      },
    ],
    edges: [
      { edge_id: "edge:clean:regulated", from: "issue:hw:clean", to: "obl:clean", edge_type: "regulated_by", ...CONFIRMED_EDGE },
      { edge_id: "edge:clean:obligation", from: "obl:clean", to: "law:clean", edge_type: "obligation_of", ...CONFIRMED_EDGE },
    ],
  };
}

const CLEAN_PUBLICATION = {
  items: [{
    rag_doc_ref: "tencent-lke://law/clean",
    review_status: "approved",
    legal_basis_status: "internal_reviewed",
    citation_locator: "第七十七条",
    cache_policy: "metadata_only",
    raw_cached: false,
  }],
};

function cleanContext() {
  return buildGraphContextResponse({
    graph: cleanGraph(),
    publication: CLEAN_PUBLICATION,
    nodeId: "issue:hw:clean",
    depth: 2,
  });
}

function cleanItem() {
  return {
    "审核编号": "review:clean001",
    "问题类型引用": "issue:hw:clean",
    "建议问题类型": "危废标签不规范",
    "现场问题摘要": "标签信息不完整,需补齐台账与标签信息",
    "整改要求": "补齐标签信息",
    "证据摘要": { "证据数量": 3, "证据类型": ["标签照片", "台账记录"] },
    "法条规范候选": [{ "引用编号": "law:clean", "名称": "固废法第七十七条" }],
    "整改结果": "已通过",
    "整改历史摘要": { "驳回次数": 0, "任务状态": "VERIFIED" },
    "区域": "华东",
    "行业": "医院",
    "环保维度": "hazardous_waste",
    "合并目标问题类型": "",
    "企业内部标识": "ent-clean",
    "当前审核状态": "待审核",
    "是否允许进入聚合": false,
  };
}

// groupKey(cleanItem) = 华东|医院|hazardous_waste|issue:hw:clean|law:clean
const CLEAN_PITFALL_ROW = {
  region: "华东",
  industry: "医院",
  dimension: "hazardous_waste",
  issue_type_ref: "issue:hw:clean",
  law_or_spec_ref: "law:clean",
  sample_size: 7,
  recurrence_rate: 1.2,
};

test("(a) 已废止法条命中 law_status_risk 且严重度 blocking", () => {
  const findings = detectMismatches({ item: miscastItem(), graphContext: deprecatedContext() });
  const lawRisk = findings.find((finding) => finding["错配码"] === "law_status_risk");
  assert.ok(lawRisk, "应产出 law_status_risk 异议");
  assert.equal(lawRisk["严重度"], "blocking");
  assert.equal(lawRisk["检出方式"], "rule");
  assert.deepEqual(lawRisk["trace"].node_ids, ["law:swl:art77"]);
});

test("(b) 法条候选为空 + 硬法表达命中 management_advice_miscast_as_law blocking", () => {
  const findings = detectMismatches({ item: miscastItem(), graphContext: deprecatedContext() });
  const miscast = findings.find((finding) => finding["错配码"] === "management_advice_miscast_as_law");
  assert.ok(miscast, "应产出 management_advice_miscast_as_law 异议");
  assert.equal(miscast["严重度"], "blocking");
  assert.match(miscast["建议修正"], /管理建议/);
  // 守门人:建议修正里不得保留硬法表达。
  assert.doesNotMatch(miscast["建议修正"], /违反|依据|根据/);
});

test("(c) 缺 trace 或 trace 不在 graphContext 内的异议被丢弃", () => {
  const ctx = deprecatedContext();
  const findings = [
    { "错配码": "valid_node", "trace": { node_ids: ["issue:hw:label"], edge_ids: [], source_refs: [] } },
    { "错配码": "valid_edge", "trace": { node_ids: [], edge_ids: ["edge:obligation:art77"], source_refs: [] } },
    { "错配码": "no_trace" },
    { "错配码": "empty_trace", "trace": { node_ids: [], edge_ids: [], source_refs: [] } },
    { "错配码": "ghost_node", "trace": { node_ids: ["ghost:not-in-ctx"], edge_ids: [], source_refs: [] } },
    { "错配码": "ghost_edge", "trace": { node_ids: [], edge_ids: ["edge:ghost"], source_refs: [] } },
  ];
  const kept = dropTracelessFindings(findings, ctx);
  assert.deepEqual(kept.map((finding) => finding["错配码"]), ["valid_node", "valid_edge"]);
});

test("(d) normalizeEffectiveStatus 五类映射正确", () => {
  assert.equal(normalizeEffectiveStatus("已废止"), "deprecated");
  assert.equal(normalizeEffectiveStatus("repealed"), "deprecated");
  assert.equal(normalizeEffectiveStatus("已被替代"), "superseded");
  assert.equal(normalizeEffectiveStatus("superseded"), "superseded");
  assert.equal(normalizeEffectiveStatus("待生效"), "pending");
  assert.equal(normalizeEffectiveStatus("征求意见"), "pending");
  assert.equal(normalizeEffectiveStatus("现行有效"), "in_force");
  assert.equal(normalizeEffectiveStatus("待确认"), "unconfirmed");
  assert.equal(normalizeEffectiveStatus("冲突"), "conflict");
  assert.equal(normalizeEffectiveStatus(""), "unknown");
  assert.equal(normalizeEffectiveStatus("某种没见过的状态"), "unknown");
});

test("(e) 样本企业数 < 5 时整体研判不建议 approve", () => {
  const ctx = cleanContext();
  const pitfallRows = { rows: [], sample_limited: [{ ...CLEAN_PITFALL_ROW, sample_size: 3, reason: "样本不足,不展示" }] };
  const findings = detectMismatches({ item: cleanItem(), graphContext: ctx, pitfallRows });
  assert.ok(findings.some((finding) => finding["错配码"] === "aggregation_risk"), "样本不足应命中 aggregation_risk");
  const readiness = readinessFrom(cleanItem(), findings);
  assert.notEqual(readiness["建议方向"], "approve");
  assert.notEqual(readiness["建议方向"], "通过，进入聚合候选");
});

test("(f) 副驾意见私有零泄漏:不含私有键且过 assertRedlineClean 不抛", () => {
  const backbone = buildCopilotBackbone({
    item: miscastItem(),
    graphContext: deprecatedContext(),
    pitfallRows: null,
  });
  const text = JSON.stringify(backbone);
  for (const forbidden of ["enterprise_name", "company_name", "gps", "photo_path", "full_text", "secretkey", "api_key"]) {
    assert.equal(text.includes(forbidden), false, `输出不得含私有键 ${forbidden}`);
  }
  assert.equal(backbone["_redline_clean"], true);
  // advisory-only:存在 blocking 异议时建议方向交还 ETO(null),且绝不写审核状态。
  assert.equal(backbone["整体研判"]["建议方向"], null);
  assert.equal("当前审核状态" in backbone, false);
});

test("(g) 无异议时整体研判就绪度 = ok", () => {
  const backbone = buildCopilotBackbone({
    item: cleanItem(),
    graphContext: cleanContext(),
    pitfallRows: { rows: [CLEAN_PITFALL_ROW], sample_limited: [] },
  });
  assert.equal(backbone["异议"].length, 0);
  assert.equal(backbone["整体研判"]["就绪度"], "ok");
  assert.equal(backbone["上下文门禁"], "pass");
  // 全部就位时副驾可给 approve 方向(对照 e:样本不足时绝不 approve)。
  assert.equal(backbone["整体研判"]["建议方向"], "approve");
});

test("(h) downgradeGuidance:守门人对 internal_reviewed 也加严,只有 official_confirmed 放行硬法表达", () => {
  assert.equal(downgradeGuidance("official_confirmed", { guidance: "应依据该条整改" }), "应依据该条整改");
  assert.doesNotMatch(downgradeGuidance("internal_reviewed", { guidance: "应依据该条整改" }), /依据|根据/);
  assert.doesNotMatch(downgradeGuidance("no_legal_basis", { guidance: "违反 XX 法" }), /违反/);
  // 不含硬法表达的管理建议原样保留。
  assert.equal(downgradeGuidance("candidate", { guidance: "补齐台账记录" }), "补齐台账记录");
});

test("evidenceRequirementFor 从 evidenced_by 邻接节点派生应有项", () => {
  const required = evidenceRequirementFor(deprecatedContext(), "issue:hw:label");
  assert.deepEqual(required.map((req) => req.name), ["标签照片"]);
  const evidenceFinding = detectMismatches({ item: miscastItem(), graphContext: deprecatedContext() })
    .find((finding) => finding["错配码"] === "evidence_insufficient");
  assert.ok(evidenceFinding, "证据缺失应命中 evidence_insufficient");
  assert.equal(evidenceFinding["严重度"], "warning");
  assert.ok(evidenceFinding["trace"].node_ids.includes("evidence:label-photo"));
});

test("(i) 邻域内无关 no_legal_basis 边不得误报有据候选为「管理经验被法律化」", () => {
  const ctx = {
    graph_context: {
      nodes: [
        { node_id: "issue:has-basis", node_type: "issue_type", name: "有据问题" },
        { node_id: "law:valid", node_type: "law_article", name: "某有效法条", attrs: { effective_status: "现行有效" } },
        { node_id: "issue:unrelated", node_type: "issue_type", name: "无关问题" },
        { node_id: "obl:unrelated", node_type: "law_obligation", name: "无关义务" },
      ],
      edges: [
        { edge_id: "e:basis", from: "issue:has-basis", to: "law:valid", edge_type: "obligation_of", legal_basis_status: "official_confirmed" },
        { edge_id: "e:unrelated", from: "issue:unrelated", to: "obl:unrelated", edge_type: "regulated_by", legal_basis_status: "no_legal_basis" },
      ],
    },
  };
  const item = {
    "问题类型引用": "issue:has-basis",
    "法条规范候选": [{ "引用编号": "law:valid", "名称": "某有效法条" }],
    "现场问题摘要": "现场未按要求执行,违反相关法条,依据该法应整改",
    "整改要求": "限期整改",
  };
  const findings = detectMismatches({ item, graphContext: ctx, issueRef: "issue:has-basis" });
  assert.equal(
    findings.some((finding) => finding["错配码"] === "management_advice_miscast_as_law"),
    false,
    "本候选有 official_confirmed 法条,邻域内无关 no_legal_basis 边不得触发误报",
  );
});

test("(j) 未注入跨企业数据(pitfallRows=null)不得对干净候选误产 aggregation_risk", () => {
  const backbone = buildCopilotBackbone({
    item: cleanItem(),
    graphContext: cleanContext(),
    pitfallRows: null,
  });
  assert.equal(
    backbone["异议"].some((finding) => finding["错配码"] === "aggregation_risk"),
    false,
    "样本未知(未注入)不得当作样本<5 误告警",
  );
  // 样本未知不应把可直接判断的干净路径压成 warn/internal。
  assert.equal(backbone["整体研判"]["建议方向"], "approve");
});

test("(k) 尚未入图的硬法误用候选保留 blocking 异议(source_ref 兜底)", () => {
  const ctx = { graph_context: { nodes: [], edges: [] } };
  const item = {
    "审核编号": "review:newpattern001",
    "问题类型引用": "issue:not-in-graph-yet",
    "法条规范候选": [],
    "现场问题摘要": "新型问题,违反某法,依据该法应限期整改",
    "整改要求": "限期整改",
    "技术追溯": { "来源记录编号": "src:newpattern001" },
  };
  const backbone = buildCopilotBackbone({ item, graphContext: ctx, pitfallRows: null });
  const miscast = backbone["异议"].find((finding) => finding["错配码"] === "management_advice_miscast_as_law");
  assert.ok(miscast, "尚未入图的硬法误用必须保留 blocking 异议,不得被 trace 闸静默丢弃");
  assert.equal(miscast["严重度"], "blocking");
  assert.deepEqual(miscast["trace"].source_refs, ["src:newpattern001"]);
  assert.deepEqual(miscast["trace"].node_ids, []);
});

test("(l) 判例按 §7 白名单投影,私有判断字段与企业名不随判例透传", () => {
  const peers = [{
    "审核编号": "review:peer1",
    "结论": "仅保留内部案例",
    "时间": "2026-06-20",
    "evidence_judgment_standard": "私有证据判断标准",
    "rectification_template": "私有整改模板",
    "enterprise_name": "某某环保有限公司",
  }];
  const backbone = buildCopilotBackbone({
    item: cleanItem(),
    graphContext: cleanContext(),
    pitfallRows: { rows: [CLEAN_PITFALL_ROW], sample_limited: [] },
    peers,
  });
  assert.deepEqual(backbone["补足"]["判例"], [
    { "审核编号": "review:peer1", "结论": "仅保留内部案例", "时间": "2026-06-20" },
  ]);
  const text = JSON.stringify(backbone);
  for (const leaked of ["evidence_judgment_standard", "rectification_template", "enterprise_name", "某某环保有限公司"]) {
    assert.equal(text.includes(leaked), false, `判例不得透传 ${leaked}`);
  }
});
