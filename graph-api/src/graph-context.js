import fs from "node:fs/promises";
import path from "node:path";

const APPROVED_REVIEW_STATUSES = new Set(["APPROVED_BASELINE", "HUMAN_REVIEWED", "approved", "human_reviewed"]);
const PUBLIC_TIERS = new Set(["shared", "aggregate"]);
const LEGAL_EDGE_TYPES = new Set(["regulated_by", "manifests_as", "obligation_of", "limited_by"]);
const CONFIRMED_LEGAL_STATUSES = new Set(["official_confirmed", "internal_reviewed"]);
const REF_NODE_TYPES = new Set(["law_article", "tech_spec", "standard_limit"]);
export const FORBIDDEN_KEYS = new Set([
  "content",
  "raw_text",
  "full_text",
  "original_text",
  "article_text",
  "enterprise_name",
  "company_name",
  "gps",
  "photo_path",
  "raw_report",
  "attachment_url",
  "photo_url",
  "secretid",
  "secretkey",
  "api_key",
  "token",
  "authorization",
  // §11.4 private-tier 判断字段:私有判断标准 / 整改模板 / ETO 审核笔记一律不得进 shared 上下文或外部 LLM。
  // (注:"eto_review_note_summary" 是已脱敏摘要,精确键名不在此列,不受影响。)
  "evidence_judgment_standard",
  "rectification_template",
  "review_note",
  "eto_note",
  "eto_review_note",
  // P1 私有脱敏纵深:企业名称快照是 private-tier 业务数据,绝不进副驾意见 / 外部 LLM payload。
  // (副驾 backbone 与 LLM 投影本就只取脱敏白名单,这里把红线闸也补上,双保险。)
  "企业名称快照",
  // 输出闸与 copilot-llm.js PRIVATE_TIER_KEYS 对称:私有判断字段的中文键变体也一并拦,
  // 让「送 LLM 前的 prompt 闸」与「副驾意见输出闸」用同一套私有键口径(纵深对称)。
  "证据判断标准",
  "整改模板",
  "eto审核笔记",
]);
// 里程碑1 红线分域:把值模式拆成「法条全文」与「密钥/PII」两域,二者并集仍是原全集。
//   - LAW_TEXT_VALUE_PATTERNS:法条原文/整段全文。允许进【送 LLM 的 citation 段】供研判,
//     但【绝不】进副驾输出 / 图 / shared / report(输出闸仍用全集拦)。
//   - SECRET_PII_VALUE_PATTERNS:密钥 / 企业 / 坐标 / 照片 / 附件 URL。任何段都禁,citation 段也禁。
export const LAW_TEXT_VALUE_PATTERNS = [
  /本法全文|全文如下|第一条.{20,}第二条/s,
  /RAG 原文正文/i,
];
export const SECRET_PII_VALUE_PATTERNS = [
  /BEGIN PRIVATE KEY/i,
  /\bAKID[A-Za-z0-9]{8,}/,
  /https?:\/\/[^\s"]*(myqcloud|cos|attachment|evidence|photo)/i,
  /经度|纬度|GPS/i,
];
// 默认全集:assertRedlineClean / scanForbidden 仍扫全集 → 输出闸强度不变(法条全文+私有都禁)。
const FORBIDDEN_VALUE_PATTERNS = [...LAW_TEXT_VALUE_PATTERNS, ...SECRET_PII_VALUE_PATTERNS];

const STANDARD_RE = /\b(?:GB|GB\/T|HJ|HJ\/T|DB\d{2}|DB\d{2}\/T|T\/[A-Z0-9]+)\s*[0-9][0-9A-Za-z./-]*(?:[-—－][0-9]{2,4})?\b/i;

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isApproved(record) {
  return PUBLIC_TIERS.has(record?.tier) && APPROVED_REVIEW_STATUSES.has(record?.review_status);
}

function safeAttrs(node) {
  const attrs = node?.attrs && typeof node.attrs === "object" ? node.attrs : {};
  const allowed = [
    "law_name",
    "article_no",
    "obligation_summary",
    "effective_status",
    "rag_doc_ref",
    "standard_no",
    "tech_spec_no",
    "summary",
    "inspection_type",
    "score_item",
    "applicable_when",
    "industry",
    "dimension",
    "show_if_keys",
    // 副驾「十律」补足消费(加性,非私有):lineage_ref 供法条沿革取代关系定位;
    // last_verified_at 供 confidence_stale「时间陈旧」分支判断核验时效。二者均为元数据,不是法条全文。
    "lineage_ref",
    "last_verified_at",
  ];
  return Object.fromEntries(allowed.filter((key) => attrs[key] !== undefined).map((key) => [key, attrs[key]]));
}

/** 维度精确过滤: 节点 attrs.dimension 与 EcoCheck 24 维键 1:1 对应(含复合维度如 solid_waste_hazardous_waste)。 */
function dimensionMatches(node, dim) {
  if (!dim) return true;
  const d = normalizeText(node.attrs?.dimension);
  if (d && (d === dim || d.includes(dim) || dim.includes(d))) return true;
  const showIf = normalizeText(node.attrs?.show_if_keys);
  if (showIf && showIf.includes(dim)) return true;
  const applicable = normalizeText(node.attrs?.applicable_when);
  return Boolean(applicable && applicable.includes(dim));
}

/** 行业过滤: 匹配 attrs.industry(中文类目)或 applicable_when(含"行业代码5265"形式)。 */
function industryMatches(node, ind) {
  if (!ind) return true;
  const industry = normalizeText(node.attrs?.industry);
  if (industry && industry.includes(ind)) return true;
  const applicable = normalizeText(node.attrs?.applicable_when);
  return Boolean(applicable && applicable.includes(ind));
}

function slimNode(node) {
  return {
    node_id: node.node_id,
    node_type: node.node_type,
    name: node.name,
    tier: node.tier,
    review_status: node.review_status,
    attrs: safeAttrs(node),
  };
}

function slimEdge(edge) {
  return {
    edge_id: edge.edge_id,
    from: edge.from,
    to: edge.to,
    edge_type: edge.edge_type,
    tier: edge.tier,
    review_status: edge.review_status,
    source_ref: edge.source_ref,
    legal_basis_status: edge.legal_basis_status,
    confidence: edge.confidence,
    confidence_reason: edge.confidence_reason,
  };
}

function nodeSearchText(node) {
  return [
    node.node_id,
    node.node_type,
    node.name,
    ...asArray(node.aliases),
    node.attrs?.law_name,
    node.attrs?.article_no,
    node.attrs?.standard_no,
    node.attrs?.tech_spec_no,
  ].map(normalizeText).join(" ");
}

function standardNo(node) {
  const explicit = node.attrs?.standard_no || node.attrs?.tech_spec_no;
  if (explicit) return String(explicit).replace(/[—－]/g, "-").trim();
  const match = STANDARD_RE.exec(node.name || "");
  return match ? match[0].replace(/[—－]/g, "-").trim() : null;
}

function ragDocRef(node) {
  return node.attrs?.rag_doc_ref || node.rag_doc_ref || "";
}

function traceFor(node, edge) {
  return {
    node_ids: [node.node_id],
    edge_ids: edge ? [edge.edge_id] : [],
    source_refs: edge?.source_ref ? [edge.source_ref] : [],
  };
}

// 共享递归扫描:键名恒用全集 FORBIDDEN_KEYS;值模式由调用方按域注入(全集 / 仅密钥PII)。
function scanValues(value, valuePatterns, pathLabel, violations) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanValues(item, valuePatterns, `${pathLabel}[${index}]`, violations));
    return violations;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) violations.push(`${pathLabel}.${key}`);
      scanValues(item, valuePatterns, `${pathLabel}.${key}`, violations);
    }
    return violations;
  }
  if (typeof value === "string") {
    for (const pattern of valuePatterns) {
      if (pattern.test(value)) violations.push(pathLabel);
    }
  }
  return violations;
}

// 输出/上下文闸:键名 + 全集值模式(法条全文 + 密钥/PII 都拦)。强度不变。
export function scanForbidden(value, pathLabel = "$", violations = []) {
  return scanValues(value, FORBIDDEN_VALUE_PATTERNS, pathLabel, violations);
}

// citation 段闸:键名用完整 FORBIDDEN_KEYS,值模式【仅】SECRET_PII_VALUE_PATTERNS(排除法条全文)。
// → 允许法条原文进 citation 段,但仍禁私有/企业/密钥/坐标/照片。
export function scanCitationForbidden(value, pathLabel = "$", violations = []) {
  return scanValues(value, SECRET_PII_VALUE_PATTERNS, pathLabel, violations);
}

export function assertRedlineClean(payload) {
  const violations = [...new Set(scanForbidden(payload))];
  if (violations.length) throw new Error(`图谱上下文包含不得输出的字段:${violations.join(",")}`);
}

function isPublicationItemAllowed(item) {
  if (!item || typeof item !== "object") return false;
  if (!item.rag_doc_ref) return false;
  if (!new Set(["approved", "human_reviewed"]).has(item.review_status)) return false;
  if (!CONFIRMED_LEGAL_STATUSES.has(item.legal_basis_status)) return false;
  if (!item.citation_locator || item.citation_locator === "source-level") return false;
  if (item.cache_policy !== "metadata_only") return false;
  if (item.raw_cached !== false) return false;
  return true;
}

function publicationAllowedRefs(publication) {
  return new Set((publication?.items || []).filter(isPublicationItemAllowed).map((item) => item.rag_doc_ref));
}

function privateSourceRefs(graph) {
  return new Set((graph.sources || [])
    .filter((source) => source?.tier === "private" || source?.review_status === "CANDIDATE")
    .map((source) => source.source_id)
    .filter(Boolean));
}

function sourceAllowed(edge, blockedSources) {
  return !edge.source_ref || !blockedSources.has(edge.source_ref);
}

function legalEdgesForNode(node, edges) {
  return edges.filter((edge) => LEGAL_EDGE_TYPES.has(edge.edge_type) && (edge.from === node.node_id || edge.to === node.node_id));
}

function buildSlimRef(node, edge) {
  const ref = {
    node_id: node.node_id,
    node_type: node.node_type,
    title: node.name,
    rag_doc_ref: ragDocRef(node),
    legal_basis_status: edge?.legal_basis_status || "candidate",
    source_ref: edge?.source_ref || "",
    trace: traceFor(node, edge),
  };
  if (node.node_type === "law_article") {
    ref.law_name = node.attrs?.law_name || node.name;
    ref.article_no = node.attrs?.article_no || "";
  } else {
    ref.standard_no = standardNo(node);
  }
  return ref;
}

function addBlocked(blockedRefs, node, reason, edge) {
  blockedRefs.push({
    node_id: node.node_id,
    node_type: node.node_type,
    title: node.name,
    rag_doc_ref: ragDocRef(node),
    reason,
    legal_basis_status: edge?.legal_basis_status || "candidate",
    trace: traceFor(node, edge),
  });
}

function contextStatus(rootNodes, blockedRefs) {
  if (!rootNodes.length) return "blocked";
  return blockedRefs.length ? "partial" : "pass";
}

export async function loadGraphContextInputs({ graphPath, publicationPath } = {}) {
  const graph = JSON.parse(await fs.readFile(graphPath, "utf8"));
  let publication = { items: [] };
  if (publicationPath) {
    try {
      publication = JSON.parse(await fs.readFile(publicationPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { graph, publication };
}

export function buildGraphContextResponse({
  graph,
  publication = { items: [] },
  nodeId = "",
  query = "",
  industry = "",
  dimension = "",
  depth = 2,
  limit = 80,
} = {}) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error("缺少有效图谱数据");
  }
  const maxDepth = clampNumber(depth, 2, 0, 3);
  const maxNodes = clampNumber(limit, 80, 1, 200);
  const nodesById = new Map(graph.nodes.filter(isApproved).map((node) => [node.node_id, node]));
  const blockedSources = privateSourceRefs(graph);
  const edges = graph.edges.filter((edge) => (
    isApproved(edge)
    && sourceAllowed(edge, blockedSources)
    && nodesById.has(edge.from)
    && nodesById.has(edge.to)
  ));

  const normalizedQuery = normalizeText(query);
  const normalizedIndustry = normalizeText(industry);
  const normalizedDimension = normalizeText(dimension);

  let rootNodes = [];
  if (nodeId) {
    const root = nodesById.get(nodeId);
    if (root) rootNodes = [root];
  } else if (normalizedQuery || normalizedIndustry || normalizedDimension) {
    // industry/dimension 为精确过滤(按图谱节点 attrs 标注),q 为全文模糊; 三者按 AND 组合。
    const maxRoots = (normalizedIndustry || normalizedDimension) ? 12 : 5;
    rootNodes = [...nodesById.values()]
      .filter((node) => {
        if (normalizedQuery && !nodeSearchText(node).includes(normalizedQuery)) return false;
        if (!dimensionMatches(node, normalizedDimension)) return false;
        if (!industryMatches(node, normalizedIndustry)) return false;
        return true;
      })
      .slice(0, maxRoots);
  } else {
    throw new Error("必须提供 node_id 或 q 或 industry/dimension");
  }

  const selectedNodeIds = new Set(rootNodes.map((node) => node.node_id));
  const selectedEdgeIds = new Set();
  let frontier = new Set(selectedNodeIds);
  for (let step = 0; step < maxDepth && selectedNodeIds.size < maxNodes; step += 1) {
    const next = new Set();
    for (const edge of edges) {
      const touchesFrontier = frontier.has(edge.from) || frontier.has(edge.to);
      if (!touchesFrontier) continue;
      selectedEdgeIds.add(edge.edge_id);
      for (const nodeIdOfEdge of [edge.from, edge.to]) {
        if (!selectedNodeIds.has(nodeIdOfEdge) && selectedNodeIds.size < maxNodes) {
          selectedNodeIds.add(nodeIdOfEdge);
          next.add(nodeIdOfEdge);
        }
      }
    }
    frontier = next;
    if (!frontier.size) break;
  }

  const contextNodes = [...selectedNodeIds].map((id) => nodesById.get(id)).filter(Boolean);
  const contextEdges = edges.filter((edge) => selectedEdgeIds.has(edge.edge_id));
  const allowedRagRefs = publicationAllowedRefs(publication);
  const publicationGateEnabled = Array.isArray(publication?.items);
  const lawRefs = [];
  const techSpecRefs = [];
  const blockedRefs = [];
  const seenRefs = new Set();

  for (const node of contextNodes.filter((item) => REF_NODE_TYPES.has(item.node_type))) {
    const refKey = `${node.node_type}:${node.node_id}`;
    if (seenRefs.has(refKey)) continue;
    seenRefs.add(refKey);
    const legalEdges = legalEdgesForNode(node, contextEdges);
    const conflicting = legalEdges.find((edge) => !CONFIRMED_LEGAL_STATUSES.has(edge.legal_basis_status));
    const edge = legalEdges.find((item) => CONFIRMED_LEGAL_STATUSES.has(item.legal_basis_status)) || legalEdges[0];
    const ref = buildSlimRef(node, edge);
    if (conflicting) {
      addBlocked(blockedRefs, node, `legal_basis_status=${conflicting.legal_basis_status || "missing"}`, conflicting);
      continue;
    }
    if (!ref.rag_doc_ref) {
      addBlocked(blockedRefs, node, "missing_rag_doc_ref", edge);
      continue;
    }
    if (!CONFIRMED_LEGAL_STATUSES.has(ref.legal_basis_status)) {
      addBlocked(blockedRefs, node, `legal_basis_status=${ref.legal_basis_status}`, edge);
      continue;
    }
    if (node.node_type === "law_article" && !ref.article_no) {
      addBlocked(blockedRefs, node, "missing_article_no_or_locator", edge);
      continue;
    }
    if (node.node_type !== "law_article" && !ref.standard_no) {
      addBlocked(blockedRefs, node, "missing_standard_no_or_locator", edge);
      continue;
    }
    if (publicationGateEnabled && !allowedRagRefs.has(ref.rag_doc_ref)) {
      addBlocked(blockedRefs, node, "not_in_publication_bundle_or_source_level", edge);
      continue;
    }
    if (node.node_type === "law_article") lawRefs.push(ref);
    else techSpecRefs.push(ref);
  }

  const machineGateStatus = contextStatus(rootNodes, blockedRefs);
  const response = {
    status: machineGateStatus,
    approval_basis: "ETO_APPROVED_IN_GRAPH",
    human_review_required: false,
    machine_gate_status: machineGateStatus,
    query: {
      node_id: nodeId || null,
      q: query || null,
      industry: industry || null,
      dimension: dimension || null,
      depth: maxDepth,
      limit: maxNodes,
    },
    root_nodes: rootNodes.map(slimNode),
    graph_context: {
      nodes: contextNodes.map(slimNode),
      edges: contextEdges.map(slimEdge),
    },
    law_refs: lawRefs,
    tech_spec_refs: techSpecRefs,
    blocked_refs: blockedRefs,
    trace: {
      node_ids: contextNodes.map((node) => node.node_id),
      edge_ids: contextEdges.map((edge) => edge.edge_id),
      source_refs: [...new Set(contextEdges.map((edge) => edge.source_ref).filter(Boolean))],
    },
  };
  assertRedlineClean(response);
  return response;
}

export function contextPathsFromRoot(root, env = process.env) {
  return {
    graphPath: env.ECO_GRAPH_CONTEXT_GRAPH_PATH || path.join(root, "data", "exports", "shared_product_v1", "graph.json"),
    publicationPath: env.ECO_GRAPH_CONTEXT_PUBLICATION_PATH || path.join(root, "data", "knowledge-governance", "publications", "ecocheck.json"),
  };
}
