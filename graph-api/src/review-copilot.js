// ETO 审核副驾「十律」· P0 确定性 backbone
//
// 纯函数,零网络、零 LLM、零腾讯云依赖,可进 verify:all 离线 lane。
// 它在 ETO 下结论前:
//   1. 补足(buildSupplement):铺齐超出单人记忆的上下文(法条现状/跨企业分布/证据应有项/踩雷点/判例)。
//   2. 纠正(detectMismatches):产出 7 个确定性错配码(蓝图 §4 中可规则离线检出的部分)。
// 四条铁律(docs/api/eto-review-copilot.md §3 / §11):
//   - 副驾不裁决只提异议:整体研判.建议方向 可为 null,绝不写审核状态。
//   - 开口必带 trace:每条异议 trace.node_ids/edge_ids 必须落在本次 graphContext 内,否则丢弃。
//   - 降级是机器门禁:门禁镜像 graphContext.machine_gate_status;守门人比消费者保守(downgradeGuidance)。
//   - 私有零泄漏:返回前过 assertRedlineClean,命中即抛,不返回泄漏。
//
// 复用既有件(不新增图基建,不改其行为):
//   - graph-context.js  → assertRedlineClean(红线闸,与 /api/graph/context 同一道)
//   - review-store.js   → groupKey(跨企业 join 键,与 buildPitfallBatch 聚合口径一致)
// 与 graph-ui/src/review.js 的 closureState / isMatchedIssue / recommendedKind 同义,保证前后端口径一致。

import { assertRedlineClean } from "./graph-context.js";
import { groupKey } from "./review-store.js";

const COPILOT_VERSION = "copilot.v1";

// 守门人比消费者保守:graph-context 把 internal_reviewed 视作 CONFIRMED,
// 但副驾只有 official_confirmed 才允许在「建议修正」里写硬法表达(违反/依据/根据)。
const STRONG_LEGAL_STATUS = "official_confirmed";
const HARD_LAW_RE = /违反|违法|不符合.{0,6}法|依据|根据/;
// 表现为个案 / 不宜聚合的自然语言信号(与 review.js recommendedKind 同义)。
const NARROW_CASE_RE = /个案|过窄|样本不足|不适合(进入)?聚合/;
// graph-context blocked_refs 里属于「定位缺失」类、应升级为 missing_law_locator 异议的 reason。
// 注:not_in_publication_bundle_or_source_level(未在发布包 / source-level 无具体定位)与
// legal_basis_status=candidate|disputed|missing 这几类按设计只经「上下文门禁 + 降级说明」呈现,
// 不另产 missing_law_locator,避免与门禁口径重复;此为有意取舍,非遗漏。
const LOCATOR_REASONS = new Set([
  "missing_rag_doc_ref",
  "missing_article_no_or_locator",
  "missing_standard_no_or_locator",
]);
const EVIDENCE_NODE_TYPES = new Set(["evidence_field_requirement", "evidence_category"]);

const EFFECTIVE_STATUS_LABEL = {
  in_force: "现行有效",
  deprecated: "已废止",
  superseded: "已被替代",
  pending: "待生效",
  unconfirmed: "待确认",
  conflict: "状态冲突",
  unknown: "状态未知",
};

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.99, value));
}

function nodesOf(graphContext) {
  return graphContext?.graph_context?.nodes || [];
}

function edgesOf(graphContext) {
  return graphContext?.graph_context?.edges || [];
}

/** 法条有效状态归一(candy 授权口径):中英文同义词 → 稳定机器码。unknown 不触发任何异议。 */
export function normalizeEffectiveStatus(value) {
  const v = normalizeText(value);
  if (!v) return "unknown";
  if (/已废止|废止|作废|repealed|abolished/.test(v)) return "deprecated";
  if (/被替代|已被替代|被取代|已被取代|superseded|replaced/.test(v)) return "superseded";
  if (/待生效|未生效|征求意见|draft|pending/.test(v)) return "pending";
  if (/现行有效|现行|在施行|in[ _]?force|effective/.test(v)) return "in_force";
  if (/待确认|未确认|unconfirmed/.test(v)) return "unconfirmed";
  if (/冲突|conflict/.test(v)) return "conflict";
  return "unknown";
}

/** law_status_risk 严重度:deprecated/superseded→blocking;pending/unconfirmed/conflict→warning;其它→null(不产异议)。 */
function lawStatusSeverity(statusCode) {
  if (statusCode === "deprecated" || statusCode === "superseded") return "blocking";
  if (statusCode === "pending" || statusCode === "unconfirmed" || statusCode === "conflict") return "warning";
  return null;
}

// ---- 与 review.js 同义的判断逻辑(口径一致,不跨包 import 前端模块) ----

/** 是否已归一到图谱问题类型。哨兵 "issue:pending"/待归一 视为未匹配。 */
function isMatchedIssue(item) {
  const ref = item?.["问题类型引用"];
  return Boolean(ref) && !/pending|待归一/i.test(ref);
}

/** 整改闭环判断,与 review.js closureState 同义:ok=true 已闭环,false 未闭环/被驳回,null 待确认。 */
function closureState(item) {
  const taskStatus = item?.["整改历史摘要"]?.["任务状态"] || "";
  const result = item?.["整改结果"] || "";
  const rejects = Number(item?.["整改历史摘要"]?.["驳回次数"] || 0);
  if (/未形成闭环|被驳回|驳回|REJECTED/i.test(result) || rejects > 0) return { ok: false, label: "整改未闭环" };
  if (/VERIFIED|已通过|已闭环/i.test(taskStatus) || /已通过/.test(result)) return { ok: true, label: "整改已闭环" };
  return { ok: null, label: "整改状态待确认" };
}

/** 解析本条候选对应的 issue 节点 id(backbone 用 问题类型引用,否则回落到 graph context 命中的 root)。 */
function resolveIssueRef(item, graphContext) {
  const ref = item?.["问题类型引用"];
  const nodes = nodesOf(graphContext);
  if (ref && !/pending|待归一/i.test(ref) && nodes.some((node) => node.node_id === ref)) return ref;
  return graphContext?.root_nodes?.[0]?.node_id || (ref && !/pending|待归一/i.test(ref) ? ref : null);
}

function issueTrace(issueRef) {
  return { node_ids: issueRef ? [issueRef] : [], edge_ids: [], source_refs: [] };
}

/** 候选自身的来源 source_ref(脱敏 src:hash),供尚未入图的候选作 trace 兜底(feature 允许 source_refs 作 trace)。 */
function candidateSourceRef(item) {
  return item?.["技术追溯"]?.["来源记录编号"]
    || item?.["现场问题追溯编号"]
    || item?.["事件编号"]
    || null;
}

function nodeInContext(graphContext, nodeId) {
  return Boolean(nodeId) && nodesOf(graphContext).some((node) => node.node_id === nodeId);
}

function newFinding(partial) {
  return {
    "错配码": partial["错配码"],
    "严重度": partial["严重度"],
    "判断维度": partial["判断维度"],
    "一句话": partial["一句话"],
    "检出方式": "rule",
    "证据": partial["证据"],
    "建议修正": partial["建议修正"],
    "trace": partial["trace"] || { node_ids: [], edge_ids: [], source_refs: [] },
    "采纳状态": "未决",
  };
}

/**
 * 守门人降级:把可能含硬法表达的「建议修正」按法律依据状态降级。
 * 只有 official_confirmed 允许保留「违反/依据/根据」;internal_reviewed 及更弱一律改写为管理建议。
 * 返回字符串(用于 异议.建议修正)。
 */
export function downgradeGuidance(legalBasisStatus, { guidance = "", soft } = {}) {
  const status = normalizeText(legalBasisStatus);
  const fallback = soft || "改写为管理建议,不要使用硬法措辞;补 official_confirmed 法条候选后再升级表达。";
  if (status === STRONG_LEGAL_STATUS) return guidance;
  if (HARD_LAW_RE.test(guidance)) return fallback;
  return guidance;
}

/**
 * 该问题类型「证据应有项」:从本次 graph context 内、与 issue 直接相连的
 * evidence_field_requirement / evidence_category 节点派生(节点名即应有项)。
 * 返回 [{ node_id, name, edge_ids }]。
 */
export function evidenceRequirementFor(graphContext, issueRef) {
  if (!issueRef) return [];
  const nodes = nodesOf(graphContext);
  const edges = edgesOf(graphContext);
  const edgesByNeighbor = new Map();
  for (const edge of edges) {
    if (edge.from === issueRef) {
      if (!edgesByNeighbor.has(edge.to)) edgesByNeighbor.set(edge.to, []);
      edgesByNeighbor.get(edge.to).push(edge.edge_id);
    } else if (edge.to === issueRef) {
      if (!edgesByNeighbor.has(edge.from)) edgesByNeighbor.set(edge.from, []);
      edgesByNeighbor.get(edge.from).push(edge.edge_id);
    }
  }
  return nodes
    .filter((node) => EVIDENCE_NODE_TYPES.has(node.node_type) && edgesByNeighbor.has(node.node_id))
    .map((node) => ({ node_id: node.node_id, name: node.name, edge_ids: edgesByNeighbor.get(node.node_id) }));
}

function normalizePitfall(pitfallRows) {
  if (!pitfallRows) return { rows: [], sampleLimited: [] };
  if (Array.isArray(pitfallRows)) return { rows: pitfallRows, sampleLimited: [] };
  return {
    rows: Array.isArray(pitfallRows.rows) ? pitfallRows.rows : [],
    sampleLimited: Array.isArray(pitfallRows.sample_limited) ? pitfallRows.sample_limited : [],
  };
}

function pitfallRecordKey(record) {
  return [
    record.region,
    record.industry,
    record.dimension,
    record.issue_type_ref,
    record.law_or_spec_ref,
  ].join("|");
}

/** 用 groupKey(item) 在 buildPitfallBatch 结果里定位本组的跨企业样本。 */
function matchPitfall(item, pitfallRows) {
  const { rows, sampleLimited } = normalizePitfall(pitfallRows);
  const key = groupKey(item);
  const row = rows.find((record) => pitfallRecordKey(record) === key);
  const limited = sampleLimited.find((record) => pitfallRecordKey(record) === key);
  const sampleSize = Number(row?.sample_size ?? limited?.sample_size ?? 0);
  return { key, row, limited, sampleSize };
}

// ---- 7 个确定性错配检测器(蓝图 §4 中可规则离线检出的部分) ----

function detectManagementAdviceMiscast(item, graphContext, issueRef) {
  const lawCandidates = item?.["法条规范候选"] || [];
  const noLawCandidate = lawCandidates.length === 0;
  // no_legal_basis 只看与本候选直接相关的边(issueRef + 其法条候选节点),
  // 邻域里无关法律边的 no_legal_basis 不得污染「有据候选」,否则会误报最高危 blocking。
  const relevantNodeIds = new Set(
    [issueRef, ...lawCandidates.map((candidate) => candidate?.["引用编号"] || candidate?.["node_id"])].filter(Boolean),
  );
  const noLegalBasisEdge = edgesOf(graphContext).some((edge) => (
    normalizeText(edge.legal_basis_status) === "no_legal_basis"
    && (relevantNodeIds.has(edge.from) || relevantNodeIds.has(edge.to))
  ));
  if (!noLawCandidate && !noLegalBasisEdge) return [];
  const text = `${item?.["现场问题摘要"] || ""} ${item?.["整改要求"] || ""}`;
  const hardLaw = HARD_LAW_RE.test(text);
  // trace 兜底:尚未入图的新模式问题类型 issueRef 不在本次上下文 → 用候选来源 source_ref 挂 trace,
  // 以免最高危 blocking「管理经验被法律化」(新模式 + 硬法误用)被 trace 闸静默丢弃。
  const trace = nodeInContext(graphContext, issueRef)
    ? issueTrace(issueRef)
    : { node_ids: [], edge_ids: [], source_refs: [candidateSourceRef(item)].filter(Boolean) };
  return [newFinding({
    "错配码": "management_advice_miscast_as_law",
    "严重度": hardLaw ? "blocking" : "info",
    "判断维度": "归类",
    "一句话": hardLaw
      ? "该问题无法条依据,通过后只能写管理建议,不得写成「违反 / 依据 XX 法」。"
      : "无法条依据,通过后只能作管理建议,不得对外写违反 / 依据。",
    "证据": noLawCandidate ? "法条规范候选为空" : "本次图谱匹配法律边 legal_basis_status=no_legal_basis",
    "建议修正": downgradeGuidance(noLegalBasisEdge ? "no_legal_basis" : "", {
      guidance: "改写为管理建议;或补 official_confirmed 法条候选后再升级表达。",
      soft: "改写为管理建议;或补 official_confirmed 法条候选后再升级表达。",
    }),
    "trace": trace,
  })];
}

function detectLawStatusRisk(graphContext) {
  const findings = [];
  const edges = edgesOf(graphContext);
  for (const node of nodesOf(graphContext)) {
    if (node.node_type !== "law_article") continue;
    const statusCode = normalizeEffectiveStatus(node.attrs?.effective_status);
    const severity = lawStatusSeverity(statusCode);
    if (!severity) continue;
    const relatedEdges = edges.filter((edge) => edge.from === node.node_id || edge.to === node.node_id);
    const sourceRefs = [...new Set(relatedEdges.map((edge) => edge.source_ref).filter(Boolean))];
    const label = EFFECTIVE_STATUS_LABEL[statusCode] || statusCode;
    findings.push(newFinding({
      "错配码": "law_status_risk",
      "严重度": severity,
      "判断维度": "法律",
      "一句话": severity === "blocking"
        ? `候选绑定法条「${node.name}」当前为${label},不得作为现行依据。`
        : `候选绑定法条「${node.name}」当前为${label},需人工复核现状与沿革取代关系。`,
      "证据": `effective_status=${node.attrs?.effective_status ?? "未标注"}(归一=${statusCode})`,
      "建议修正": severity === "blocking"
        ? "改绑现行有效法条,或在补足里标注沿革后降级为管理建议。"
        : "人工复核该法条现状与 replaced_by / amended_by 取代关系后再定表达强度。",
      "trace": { node_ids: [node.node_id], edge_ids: relatedEdges.map((edge) => edge.edge_id), source_refs: sourceRefs },
    }));
  }
  return findings;
}

function detectMissingLawLocator(graphContext) {
  const nodeIds = new Set(nodesOf(graphContext).map((node) => node.node_id));
  const findings = [];
  for (const ref of graphContext?.blocked_refs || []) {
    if (!LOCATOR_REASONS.has(ref.reason)) continue;
    const trace = ref.trace && (ref.trace.node_ids || ref.trace.edge_ids)
      ? ref.trace
      : { node_ids: nodeIds.has(ref.node_id) ? [ref.node_id] : [], edge_ids: [], source_refs: [] };
    findings.push(newFinding({
      "错配码": "missing_law_locator",
      "严重度": "warning",
      "判断维度": "法律",
      "一句话": `法条「${ref.title}」缺少条款号 / 定位或 RAG 文档引用,暂不能作为确定依据。`,
      "证据": `blocked_refs.reason=${ref.reason}`,
      "建议修正": "补齐条款号 / 标准号与 rag_doc_ref 后再升级为依据,否则按管理建议处理。",
      "trace": trace,
    }));
  }
  return findings;
}

function detectEvidenceInsufficient(item, graphContext, issueRef) {
  const required = evidenceRequirementFor(graphContext, issueRef);
  if (!required.length) return [];
  const haveTypes = (item?.["证据摘要"]?.["证据类型"] || []).map(normalizeText).filter(Boolean);
  const count = Number(item?.["证据摘要"]?.["证据数量"] ?? 0);
  const missing = required.filter((req) => {
    const name = normalizeText(req.name);
    return !haveTypes.some((type) => type.includes(name) || name.includes(type));
  });
  const tooLow = count < required.length;
  if (!missing.length && !tooLow) return [];
  const traceNodeIds = [issueRef, ...required.map((req) => req.node_id)].filter(Boolean);
  const traceEdgeIds = [...new Set(required.flatMap((req) => req.edge_ids || []))];
  return [newFinding({
    "错配码": "evidence_insufficient",
    "严重度": "warning",
    "判断维度": "证据",
    "一句话": missing.length
      ? `证据缺少该问题类型应有项:${missing.map((req) => req.name).join("、")}。`
      : `证据数量(${count})低于该问题类型应有证据项数(${required.length})。`,
    "证据": `应有项=${required.map((req) => req.name).join("、")};现有证据类型=${haveTypes.join("、") || "无"};证据数量=${count}`,
    "建议修正": "补齐缺失证据项,或退回补充后再入图。",
    "trace": { node_ids: traceNodeIds, edge_ids: traceEdgeIds, source_refs: [] },
  })];
}

function detectAggregationRisk(item, pitfallRows, issueRef) {
  const { key, sampleSize, row, limited } = matchPitfall(item, pitfallRows);
  const narrative = NARROW_CASE_RE.test(item?.["现场问题摘要"] || "");
  // 区分两态:只有真正命中本组的跨企业分布(落在 sample_limited,或 row 明确 <5 家)才算「样本确实不足」;
  // 未注入 / 未命中跨企业数据时 sampleSize 退化为 0 属「样本未知」,不得据此对每条候选过度告警并压制 approve。
  const sampleShort = Boolean(limited) || Boolean(row && sampleSize < 5);
  if (!sampleShort && !narrative) return [];
  return [newFinding({
    "错配码": "aggregation_risk",
    "严重度": "warning",
    "判断维度": "聚合",
    "一句话": narrative
      ? "候选表现为个案,通过进聚合会扭曲区域统计。"
      : `跨企业样本企业数(${sampleSize})不足 5 家,暂不宜进入聚合统计。`,
    "证据": `groupKey=${key};样本企业数=${sampleSize}`,
    "建议修正": "先作内部案例留存,样本满 5 家企业后再评估是否进入聚合候选。",
    "trace": issueTrace(issueRef),
  })];
}

function detectConfidenceStale(item, issueRef) {
  const closure = closureState(item);
  if (closure.ok !== false) return [];
  return [newFinding({
    "错配码": "confidence_stale",
    "严重度": "info",
    "判断维度": "置信",
    "一句话": "整改未闭环 / 已被驳回,本条置信不应维持在高位。",
    "证据": `整改结果=${item?.["整改结果"] || "未提供"};驳回次数=${Number(item?.["整改历史摘要"]?.["驳回次数"] || 0)}`,
    "建议修正": "确认整改是否应退回补充;闭环后再评估置信。",
    "trace": issueTrace(issueRef),
  })];
}

function detectPitfallCandidate(item, graphContext, pitfallRows, peers, issueRef) {
  if (!issueRef) return [];
  const edges = edgesOf(graphContext);
  const neighborIds = new Set();
  for (const edge of edges) {
    if (edge.from === issueRef) neighborIds.add(edge.to);
    if (edge.to === issueRef) neighborIds.add(edge.from);
  }
  const pitfallNode = nodesOf(graphContext).find((node) => /pitfall/.test(node.node_type) && neighborIds.has(node.node_id));
  if (!pitfallNode) return [];
  const { sampleSize } = matchPitfall(item, pitfallRows);
  const peerCount = Array.isArray(peers) ? peers.length : 0;
  const acrossEnterprises = sampleSize >= 2 || peerCount >= 2;
  if (!acrossEnterprises) return [];
  const relatedEdges = edges.filter((edge) => (
    (edge.from === issueRef && edge.to === pitfallNode.node_id)
    || (edge.to === issueRef && edge.from === pitfallNode.node_id)
  ));
  return [newFinding({
    "错配码": "pitfall_candidate",
    "严重度": "info",
    "判断维度": "聚合",
    "一句话": `该问题已关联踩雷点「${pitfallNode.name}」且跨多家出现,关注是否升级为踩雷点而非一次性。`,
    "证据": `pitfall_class=${pitfallNode.node_id};样本企业数=${sampleSize};判例数=${peerCount}`,
    "建议修正": "评估是否登记 / 升级为踩雷点,沉淀为跨企业经验。",
    "trace": { node_ids: [pitfallNode.node_id], edge_ids: relatedEdges.map((edge) => edge.edge_id), source_refs: [] },
  })];
}

/** 全部 7 个确定性错配码,返回未过 trace 闸的原始异议数组。 */
export function detectMismatches({ item, graphContext, pitfallRows = null, peers = [], issueRef } = {}) {
  const ctx = graphContext || { graph_context: { nodes: [], edges: [] } };
  const ref = issueRef || resolveIssueRef(item, ctx);
  return [
    ...detectManagementAdviceMiscast(item, ctx, ref),
    ...detectLawStatusRisk(ctx),
    ...detectMissingLawLocator(ctx),
    ...detectEvidenceInsufficient(item, ctx, ref),
    ...detectAggregationRisk(item, pitfallRows, ref),
    ...detectConfidenceStale(item, ref),
    ...detectPitfallCandidate(item, ctx, pitfallRows, peers, ref),
  ];
}

/**
 * trace 闸:丢弃缺 trace、或 trace 引用了本次 graphContext 之外节点/边的异议。
 * node_ids 必须是 graph_context.nodes 子集,edge_ids 必须是 edges 子集(source_refs 不受图约束)。
 */
export function dropTracelessFindings(findings, graphContext) {
  const nodeIds = new Set(nodesOf(graphContext).map((node) => node.node_id));
  const edgeIds = new Set(edgesOf(graphContext).map((edge) => edge.edge_id));
  return (findings || []).filter((finding) => {
    const trace = finding?.trace;
    if (!trace) return false;
    const nIds = trace.node_ids || [];
    const eIds = trace.edge_ids || [];
    const srcs = trace.source_refs || [];
    if (!nIds.length && !eIds.length && !srcs.length) return false;
    if (nIds.some((id) => !nodeIds.has(id))) return false;
    if (eIds.some((id) => !edgeIds.has(id))) return false;
    return true;
  });
}

/** 整体研判:就绪度 + 建议方向(可 null,绝不写审核状态;样本不足 / 个案绝不 approve)。 */
export function readinessFrom(item, mismatches) {
  const findings = mismatches || [];
  const hasBlocking = findings.some((finding) => finding["严重度"] === "blocking");
  const hasWarning = findings.some((finding) => finding["严重度"] === "warning");
  const hasAggregationRisk = findings.some((finding) => finding["错配码"] === "aggregation_risk");
  const 就绪度 = hasBlocking ? "bad" : (hasWarning || findings.length) ? "warn" : "ok";

  const closure = closureState(item);
  let 建议方向 = null;
  if (hasBlocking) {
    建议方向 = null; // 守门人遇拦截级异议不替 ETO 表态,把裁决交还。
  } else if (closure.ok === false) {
    建议方向 = "return";
  } else if (NARROW_CASE_RE.test(item?.["现场问题摘要"] || "") || hasAggregationRisk) {
    建议方向 = "internal"; // 个案 / 样本不足:绝不 approve。
  } else {
    const matched = isMatchedIssue(item);
    const evidenceCount = Number(item?.["证据摘要"]?.["证据数量"] ?? 0);
    const hasLaw = (item?.["法条规范候选"] || []).length > 0;
    建议方向 = matched && evidenceCount >= 2 && closure.ok === true && hasLaw && !hasWarning ? "approve" : null;
  }
  // advisory-only 红线兜底:任何聚合误导风险下都不得给 approve。
  if (hasAggregationRisk && 建议方向 === "approve") 建议方向 = null;

  const 一句话 = hasBlocking
    ? "存在必须先处置的拦截级异议,请勿直接通过。"
    : findings.length
      ? `检出 ${findings.length} 条待核异议,建议逐条核对后再裁决。`
      : "归类与法条均就位,证据可支撑,可直接判断。";

  return {
    "就绪度": 就绪度,
    "建议方向": 建议方向,
    "一句话": 一句话,
    "副驾自评置信": clamp01(findings.length ? 0.55 + 0.1 * findings.length : 0.5),
  };
}

/** 补足上下文(全部确定性检索,零 LLM)。 */
export function buildSupplement({ item, graphContext, pitfallRows = null, peers = [], issueRef } = {}) {
  const ctx = graphContext || { graph_context: { nodes: [], edges: [] } };
  const ref = issueRef || resolveIssueRef(item, ctx);
  const issueNode = nodesOf(ctx).find((node) => node.node_id === ref) || ctx.root_nodes?.[0] || null;

  const lawStatus = nodesOf(ctx)
    .filter((node) => node.node_type === "law_article")
    .map((node) => {
      const statusCode = normalizeEffectiveStatus(node.attrs?.effective_status);
      return {
        "node_id": node.node_id,
        "article_no": node.attrs?.article_no || "",
        "effective_status": statusCode,
        "沿革警示": lawStatusSeverity(statusCode) ? `${EFFECTIVE_STATUS_LABEL[statusCode] || statusCode},请核对取代关系` : null,
      };
    });

  const { row, limited, sampleSize } = matchPitfall(item, pitfallRows);
  const recurrence = Number(row?.recurrence_rate ?? limited?.recurrence_rate ?? 0);

  const neighborIds = new Set();
  for (const edge of edgesOf(ctx)) {
    if (edge.from === ref) neighborIds.add(edge.to);
    if (edge.to === ref) neighborIds.add(edge.from);
  }
  const pitfallLinks = nodesOf(ctx)
    .filter((node) => /pitfall/.test(node.node_type) && neighborIds.has(node.node_id))
    .map((node) => ({ "node_id": node.node_id, "kind": node.node_type }));

  return {
    "命中问题类型": issueNode ? { "node_id": issueNode.node_id, "name": issueNode.name } : null,
    "法条现状": lawStatus,
    "证据应有项": evidenceRequirementFor(ctx, ref).map((req) => req.name),
    "跨企业分布": {
      "样本企业数": sampleSize,
      "复发率": recurrence,
      "是否够聚合": sampleSize >= 5,
    },
    "踩雷点关联": pitfallLinks,
    // 判例按 §7 形状白名单投影,拒绝调用方多带的私有键(证据判断标准 / 整改模板 / ETO 审核笔记等),
    // 不让私有判断上下文随判例透传(与 assertRedlineClean 双保险)。
    "判例": (Array.isArray(peers) ? peers : []).map((peer) => ({
      "审核编号": peer?.["审核编号"] ?? null,
      "结论": peer?.["结论"] ?? null,
      "时间": peer?.["时间"] ?? null,
    })),
  };
}

function degradeNote(graphContext) {
  const gate = graphContext?.machine_gate_status || graphContext?.status || "pass";
  if (gate === "pass") return null;
  const blocked = (graphContext?.blocked_refs || []).length;
  return `图谱上下文门禁为 ${gate}(blocked_refs ${blocked} 条):涉及法条的异议按管理建议处理,不得写成确定法律依据。`;
}

function mergeTrace(findings, graphContext, issueRef) {
  const nodeIds = new Set(nodesOf(graphContext).map((node) => node.node_id));
  const outNodes = new Set();
  const outEdges = new Set();
  const outSrcs = new Set();
  if (issueRef && nodeIds.has(issueRef)) outNodes.add(issueRef);
  for (const finding of findings) {
    (finding.trace?.node_ids || []).forEach((id) => outNodes.add(id));
    (finding.trace?.edge_ids || []).forEach((id) => outEdges.add(id));
    (finding.trace?.source_refs || []).forEach((id) => outSrcs.add(id));
  }
  return { node_ids: [...outNodes], edge_ids: [...outEdges], source_refs: [...outSrcs] };
}

/**
 * 组装确定性「副驾意见」(§7 形状)。返回前过 assertRedlineClean,命中即抛,不返回泄漏。
 * advisory-only:整体研判.建议方向 可为 null,绝不写审核状态。
 */
export function buildCopilotBackbone({ item, graphContext, pitfallRows = null, peers = [], now = new Date().toISOString() } = {}) {
  const ctx = graphContext || { graph_context: { nodes: [], edges: [] } };
  const issueRef = resolveIssueRef(item, ctx);
  const rawFindings = detectMismatches({ item, graphContext: ctx, pitfallRows, peers, issueRef });
  const findings = dropTracelessFindings(rawFindings, ctx);
  const supplement = buildSupplement({ item, graphContext: ctx, pitfallRows, peers, issueRef });
  const readiness = readinessFrom(item, findings);
  const gate = ctx.machine_gate_status || ctx.status || "pass";

  const output = {
    "审核编号": item?.["审核编号"] || null,
    "副驾版本": COPILOT_VERSION,
    "生成时间": now,
    "上下文门禁": gate,
    "整体研判": readiness,
    "补足": supplement,
    "异议": findings,
    "降级说明": degradeNote(ctx),
    "trace": mergeTrace(findings, ctx, issueRef),
    "_redline_clean": true,
  };
  assertRedlineClean(output);
  return output;
}
