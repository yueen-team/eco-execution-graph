import test from "node:test";
import assert from "node:assert/strict";
import { buildGraphContextResponse } from "../src/graph-context.js";
import {
  buildCopilotBackbone,
  buildSupplement,
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

test("(m) downgradeGuidance 按状态分路由:candidate/disputed 走人工审核、no_legal_basis 走管理建议,文案自身不含硬法动词", () => {
  const hard = "应依据该法条认定违法并整改";
  assert.match(downgradeGuidance("candidate", { guidance: hard }), /人工审核/);
  assert.match(downgradeGuidance("disputed", { guidance: hard }), /人工审核/);
  assert.match(downgradeGuidance("no_legal_basis", { guidance: hard }), /管理建议/);
  assert.match(downgradeGuidance("internal_reviewed", { guidance: hard }), /参考相关要求|监管口径/);
  // 守门人输出自身也守红线:任何降级文案都不得复述硬法动词。
  for (const status of ["candidate", "disputed", "no_legal_basis", "internal_reviewed", "unknown"]) {
    assert.doesNotMatch(downgradeGuidance(status, { guidance: hard }), /违反|违法|依据|根据/, `${status} 降级文案不得含硬法动词`);
  }
  // official_confirmed 唯一放行硬法表达。
  assert.equal(downgradeGuidance("official_confirmed", { guidance: hard }), hard);
});

test("(n) basis_requires_official_confirmation:internal_reviewed + 硬法表达即便 gate=pass 也触发 warning", () => {
  const ctx = {
    machine_gate_status: "pass",
    blocked_refs: [],
    graph_context: {
      nodes: [
        { node_id: "issue:x", node_type: "issue_type", name: "某问题" },
        { node_id: "law:x", node_type: "law_article", name: "某法条", attrs: { effective_status: "现行有效" } },
      ],
      edges: [
        { edge_id: "e:x", from: "issue:x", to: "law:x", edge_type: "obligation_of", legal_basis_status: "internal_reviewed", source_ref: "src:x" },
      ],
    },
  };
  const item = {
    "问题类型引用": "issue:x",
    "法条规范候选": [{ "引用编号": "law:x" }],
    "现场问题摘要": "现场未按要求执行,依据该法应认定违法",
    "整改要求": "限期整改",
  };
  const findings = detectMismatches({ item, graphContext: ctx, issueRef: "issue:x" });
  const finding = findings.find((entry) => entry["错配码"] === "basis_requires_official_confirmation");
  assert.ok(finding, "internal_reviewed + 硬法表达应产 basis_requires_official_confirmation");
  assert.equal(finding["严重度"], "warning");
  assert.equal(finding["判断维度"], "法律");
  assert.deepEqual(finding["trace"].edge_ids, ["e:x"]);
  assert.doesNotMatch(finding["建议修正"], /违反|违法|依据|根据/);
  // gate=pass 下不得误把它当作管理经验被法律化(后者要无法条依据 + 硬法表达)。
  assert.equal(findings.some((entry) => entry["错配码"] === "management_advice_miscast_as_law"), false);
});

test("(o) candidate_or_disputed_basis:消费 blocked_refs candidate/disputed → warning 且建议进入人工审核", () => {
  const graph = {
    nodes: [
      { node_id: "issue:c", node_type: "issue_type", name: "候选依据问题", ...APPROVED },
      {
        node_id: "law:c",
        node_type: "law_article",
        name: "候选依据法 第一条",
        ...APPROVED,
        attrs: { law_name: "候选依据法", article_no: "第一条", rag_doc_ref: "tencent-lke://law/c" },
      },
    ],
    edges: [
      { edge_id: "edge:c", from: "issue:c", to: "law:c", edge_type: "regulated_by", ...CONFIRMED_EDGE, legal_basis_status: "candidate" },
    ],
  };
  const ctx = buildGraphContextResponse({ graph, publication: { items: [] }, nodeId: "issue:c", depth: 1 });
  assert.ok(ctx.blocked_refs.some((ref) => /^legal_basis_status=candidate/.test(ref.reason)), "应有 candidate blocked_ref");
  const findings = detectMismatches({
    item: { "问题类型引用": "issue:c", "法条规范候选": [], "现场问题摘要": "", "整改要求": "" },
    graphContext: ctx,
    issueRef: "issue:c",
  });
  const finding = findings.find((entry) => entry["错配码"] === "candidate_or_disputed_basis");
  assert.ok(finding, "candidate 依据应产 candidate_or_disputed_basis");
  assert.equal(finding["严重度"], "warning");
  assert.match(finding["建议修正"], /人工审核/);
  assert.equal(finding["trace"].node_ids.includes("law:c"), true);
});

test("(p) confidence_stale 时间陈旧分支:审核时间早于 STALENESS_DAYS → info 且证据含该日期", () => {
  const item = { ...cleanItem(), "审核时间": "2024-01-01T00:00:00Z" };
  const findings = detectMismatches({
    item,
    graphContext: cleanContext(),
    pitfallRows: { rows: [CLEAN_PITFALL_ROW], sample_limited: [] },
    now: "2026-06-28T00:00:00Z",
  });
  const stale = findings.find((entry) => entry["错配码"] === "confidence_stale");
  assert.ok(stale, "陈旧审核时间应命中 confidence_stale");
  assert.equal(stale["严重度"], "info");
  assert.match(stale["证据"], /审核时间=2024-01-01/);
});

test("(q) law_status_risk 下限对齐:非空但未建模状态(已失效)→ warning 状态未识别", () => {
  const ctx = {
    graph_context: {
      nodes: [{ node_id: "law:u", node_type: "law_article", name: "未识别状态法", attrs: { effective_status: "已失效" } }],
      edges: [],
    },
  };
  assert.equal(normalizeEffectiveStatus("已失效"), "unknown");
  const findings = detectMismatches({ item: { "问题类型引用": "law:u" }, graphContext: ctx, issueRef: "law:u" });
  const finding = findings.find((entry) => entry["错配码"] === "law_status_risk");
  assert.ok(finding, "非空未建模状态不得比下游 consistency 更宽松,应命中 law_status_risk");
  assert.equal(finding["严重度"], "warning");
  assert.match(finding["一句话"], /状态未识别/);
});

test("(r) 补足法条现状沿革警示:解析 superseded_by 边填具体取代条款", () => {
  const graph = {
    nodes: [
      { node_id: "issue:s", node_type: "issue_type", name: "旧法问题", ...APPROVED },
      {
        node_id: "law:old",
        node_type: "law_article",
        name: "旧法 第一条",
        ...APPROVED,
        attrs: { law_name: "旧法", article_no: "第一条", rag_doc_ref: "tencent-lke://law/old", effective_status: "已被替代" },
      },
      {
        node_id: "law:new",
        node_type: "law_article",
        name: "新法 第二条",
        ...APPROVED,
        attrs: { law_name: "新法", article_no: "第二条", rag_doc_ref: "tencent-lke://law/new", effective_status: "现行有效" },
      },
    ],
    edges: [
      { edge_id: "edge:reg", from: "issue:s", to: "law:old", edge_type: "regulated_by", ...CONFIRMED_EDGE },
      { edge_id: "edge:super", from: "law:old", to: "law:new", edge_type: "superseded_by", ...CONFIRMED_EDGE },
    ],
  };
  const ctx = buildGraphContextResponse({ graph, publication: { items: [] }, nodeId: "issue:s", depth: 2 });
  const supplement = buildSupplement({ item: { "问题类型引用": "issue:s", "法条规范候选": [] }, graphContext: ctx, issueRef: "issue:s" });
  const oldLaw = supplement["法条现状"].find((law) => law.node_id === "law:old");
  assert.ok(oldLaw, "补足应含旧法条现状");
  assert.match(oldLaw["沿革警示"], /新法 第二条/);
  assert.match(oldLaw["沿革警示"], /law:new/);
});

test("(s) no_law_basis_advisory:无硬法表达的无依据候选产 info,而非误标管理经验被法律化", () => {
  const item = {
    "问题类型引用": "issue:hw:label",
    "法条规范候选": [],
    "现场问题摘要": "现场标签信息建议补充完善",
    "整改要求": "完善标签台账",
  };
  const findings = detectMismatches({ item, graphContext: deprecatedContext(), issueRef: "issue:hw:label" });
  assert.equal(
    findings.some((entry) => entry["错配码"] === "management_advice_miscast_as_law"),
    false,
    "无硬法表达不得误标为管理经验被法律化",
  );
  const advisory = findings.find((entry) => entry["错配码"] === "no_law_basis_advisory");
  assert.ok(advisory, "无依据纯管理建议候选应产 no_law_basis_advisory");
  assert.equal(advisory["严重度"], "info");
  assert.match(advisory["一句话"], /管理建议/);
});
