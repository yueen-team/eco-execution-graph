// ETO 审核副驾「十律」· P1 LLM critic(语义层,错配 1/3/6/7)
//
// 隔离纪律(docs/api/eto-review-copilot.md §8.1 / §11.5):
//   - 唯一副作用是 callDeepSeek 那一次 fetch;其余全是纯函数,便于 stub 注入单测、离线运行。
//   - review-copilot.js 绝不 import 本模块;server.js 作为编排根,通过依赖注入(copilotLlm)接入。
//   - 无 key / configured=false → {findings:[], available:false},verify:all 永不触网(守 ADR-0012)。
//
// 红线(docs/api/eto-review-copilot.md §11.4,candy 已定 2026-06-28):
//   - 私有判断标准(evidence_judgment_standard / rectification_template / ETO 审核笔记 / 企业名称快照)
//     一律不进外部 LLM prompt。送出前断言投影 payload 不含 private-tier 且不命中 graph-context FORBIDDEN_KEYS,
//     命中即抛(fail-closed,不发送)。
//   - advisory-only:LLM 只产结构化异议,绝不写审核状态。
//   - 开口必带 trace:缺 trace 或 trace 不在本次 graph context 内的 finding 一律丢弃(复用 dropTracelessFindings)。
//   - RAG 无原文:法条语义异议(law_not_applicable)降级为「需人工复核法条」,门禁→partial,绝不伪造原文。
//   - 任何网络/解析/红线异常:抛给上层,server.js 退回纯确定性 backbone,绝不 500、绝不 upsert。

import { assertRedlineClean, scanForbidden } from "./graph-context.js";
import { dropTracelessFindings } from "./review-copilot.js";

const DEFAULT_BASE_URL = "https://tokenhub.tencentmaas.com/v1";
const DEFAULT_MODEL = "deepseek-v4-flash-202605";
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_MAX_TOKENS = 1500;

// §4 中归 LLM critic 负责的错配码(1/3/6/7);确定性 backbone 已覆盖其余律,这里只收 LLM 语义层。
const LLM_ALLOWED_CODES = new Set([
  "issue_type_mismatch",   // #1 归类错配
  "law_not_applicable",    // #3 法条不适用(需 RAG 原文)
  "evidence_insufficient", // #6 证据不足(语义补强)
  "duplicate_mergeable",   // #7 语义重复可合并
]);
const SEVERITY_BY_CODE = {
  issue_type_mismatch: "warning",
  law_not_applicable: "warning",
  evidence_insufficient: "warning",
  duplicate_mergeable: "info",
};
const DIMENSION_BY_CODE = {
  issue_type_mismatch: "归类",
  law_not_applicable: "法律",
  evidence_insufficient: "证据",
  duplicate_mergeable: "归类",
};
const ALLOWED_SEVERITY = new Set(["blocking", "warning", "info"]);

// §11.4 私有判断层键名:与 graph-context.js / review-store.js FORBIDDEN_KEYS 同源,这里显式再列一遍,
// 以便 payload 命中时给出「私有判断字段」的清晰报错(双闸的第二道)。
const PRIVATE_TIER_KEYS = new Set([
  "evidence_judgment_standard",
  "rectification_template",
  "review_note",
  "eto_note",
  "eto_review_note",
  "enterprise_name",
  "company_name",
  "企业名称快照",
  "证据判断标准",
  "整改模板",
  "eto审核笔记",
]);

const SYSTEM_PROMPT = [
  "你是「十律」ETO 审核副驾的语义研判模块,是上游守门人,不是答题机。严格遵守四条铁律:",
  "1) advisory-only:你只产异议,永不替 ETO 裁决,绝不输出审核状态或结论。",
  "2) 开口必带 trace:每条异议必须挂 node_ids 或 edge_ids,且必须落在【已审核图谱上下文】里真实存在的节点/边上;引不出 trace 就不要产这条异议。严禁虚构法条节点。",
  "3) 降级是机器门禁:当【法条原文可用】为 false 时,不得对法条适用性下硬结论,只能提示需人工复核;不得写「违反/违法/依据/根据」等硬法措辞。",
  "4) 私有不进判断:输入已脱敏,你看不到企业名/GPS/照片/法条全文;不要臆造这些信息。",
  "",
  "你只允许产出以下四类错配码,且只看语义层(确定性规则层已另行覆盖法条状态/缺定位/聚合/置信等):",
  "- issue_type_mismatch:建议问题类型与现场问题摘要语义不符。",
  "- law_not_applicable:候选法条在本场景不适用(需法条原文支撑,缺原文时降级为需人工复核)。",
  "- evidence_insufficient:证据无法支撑该问题类型应有项。",
  "- duplicate_mergeable:与图谱已有问题类型语义重复,给出图谱内的合并目标 node_id。",
  "",
  "只输出 JSON 对象,形如:",
  '{"异议":[{"错配码":"issue_type_mismatch","严重度":"warning","判断维度":"归类","一句话":"...","证据":"...","建议修正":"...","trace":{"node_ids":["issue:..."],"edge_ids":[],"source_refs":[]}}]}',
  "没有异议时输出 {\"异议\":[]}。不要输出任何 JSON 以外的解释文字。",
].join("\n");

function isPlaceholder(value) {
  return !value || value.includes("your-") || value.includes("填入");
}

/** 同 storageConfigFromEnv / wecomConfigFromEnv 模式:从 env 解析 TokenHub DeepSeek 配置。 */
export function llmConfigFromEnv(env = process.env) {
  const apiKey = env.TENCENT_TOKENHUB_API_KEY || env.TENCENT_LKEAP_API_KEY || "";
  const baseUrl = (env.TENCENT_TOKENHUB_BASE_URL || env.TENCENT_LKEAP_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = env.TENCENT_TOKENHUB_DEEPSEEK_MODEL || env.TENCENT_LKEAP_DEEPSEEK_MODEL || DEFAULT_MODEL;
  return {
    configured: !isPlaceholder(apiKey),
    baseUrl,
    model,
    apiKey,
  };
}

function nodesOf(graphContext) {
  return graphContext?.graph_context?.nodes || [];
}

function edgesOf(graphContext) {
  return graphContext?.graph_context?.edges || [];
}

/** 候选脱敏白名单投影:绝不传原始 item,只取这些非私有字段。 */
export function projectCandidate(item) {
  const it = item || {};
  const evidence = it["证据摘要"] || {};
  return {
    "审核编号": it["审核编号"] ?? null,
    "区域": it["区域"] ?? null,
    "行业": it["行业"] ?? null,
    "环保维度": it["环保维度"] ?? null,
    "建议问题类型": it["建议问题类型"] ?? null,
    "问题类型引用": it["问题类型引用"] ?? null,
    "现场问题摘要": it["现场问题摘要"] ?? null,
    "现场表现": Array.isArray(it["现场表现"]) ? it["现场表现"].map((value) => String(value)) : [],
    "整改要求": it["整改要求"] ?? null,
    "整改结果": it["整改结果"] ?? null,
    "证据摘要": {
      "证据数量": Number(evidence["证据数量"] ?? 0),
      "证据类型": Array.isArray(evidence["证据类型"]) ? evidence["证据类型"].map((value) => String(value)) : [],
    },
    "法条规范候选": (it["法条规范候选"] || []).map((candidate) => ({
      "引用编号": candidate?.["引用编号"] ?? null,
      "名称": candidate?.["名称"] ?? null,
    })),
  };
}

/** 已审核图谱上下文投影:buildGraphContextResponse 已 slim + 红线干净,这里只挑研判必需的段。 */
function projectGraphContext(graphContext) {
  const ctx = graphContext || {};
  return {
    "上下文门禁": ctx.machine_gate_status || ctx.status || "pass",
    nodes: nodesOf(ctx),
    edges: edgesOf(ctx),
    law_refs: ctx.law_refs || [],
    tech_spec_refs: ctx.tech_spec_refs || [],
    blocked_refs: ctx.blocked_refs || [],
  };
}

/** RAG 引文只取脱敏元数据(标题/定位/相关性),正文恒不进 prompt(probe 层已 sanitize)。 */
function projectCitations(citations) {
  return (Array.isArray(citations) ? citations : []).map((citation) => ({
    rag_doc_ref: citation?.rag_doc_ref ?? citation?.node_id ?? null,
    title: citation?.title ?? citation?.law_name ?? null,
    locator: citation?.locator ?? citation?.article_no ?? citation?.citation_locator ?? null,
    score: citation?.score ?? citation?.relevance ?? null,
    has_excerpt: Boolean(citation?.excerpt),
  }));
}

function scanPrivateTier(value, pathLabel = "$", hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanPrivateTier(item, `${pathLabel}[${index}]`, hits));
    return hits;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_TIER_KEYS.has(String(key).toLowerCase())) hits.push(`${pathLabel}.${key}`);
      scanPrivateTier(item, `${pathLabel}.${key}`, hits);
    }
  }
  return hits;
}

/** 双闸断言:① graph-context 红线扫描(键名 + 值模式);② private-tier 判断字段显式拦截。命中即抛,不发送。 */
function assertPromptClean(payload) {
  // 第一闸复用 /api/graph/context 同一道红线扫描(键名 + 值模式)。
  const redline = [...new Set(scanForbidden(payload))];
  // 第二闸:private-tier 判断字段(含中文键)显式拦截,给出清晰报错。
  const privateHits = [...new Set(scanPrivateTier(payload))];
  if (redline.length || privateHits.length) {
    throw new Error(`副驾 LLM payload 命中私有/红线字段,已 fail-closed 不发送:${[...redline, ...privateHits].join(",")}`);
  }
}

/**
 * 组装 DeepSeek messages。
 * system 含四铁律 + 输出 JSON schema;user 含【脱敏白名单投影】候选 + 已审核 graph context + citation 元数据。
 * 关键红线:送出前断言 payload 不含 private-tier 且不命中 graph-context FORBIDDEN_KEYS,命中即抛。
 */
export function buildCopilotPrompt({ item, graphContext, citations = [] }) {
  const candidate = projectCandidate(item);
  const graph = projectGraphContext(graphContext);
  const citationMeta = projectCitations(citations);
  const ragAvailable = citationMeta.some((citation) => citation.has_excerpt);
  const userPayload = {
    "候选": candidate,
    "已审核图谱上下文": graph,
    "法条引用元数据": citationMeta,
    "法条原文可用": ragAvailable,
    "说明": ragAvailable ? null : "法条原文不可用,涉及法条适用性的判断必须降级为需人工复核,不得据原文断言。",
  };
  assertPromptClean(userPayload); // 命中即抛(fail-closed,绝不发送)
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(userPayload, null, 2) },
  ];
}

/**
 * 唯一触网点:调 TokenHub DeepSeek(OpenAI 兼容),AbortController 超时。
 * 解析 choices[0].message.content -> JSON.parse;任何网络/解析异常抛出,由上层 catch 退回 backbone。
 */
export async function callDeepSeek({ messages, env = process.env, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, maxTokens = DEFAULT_MAX_TOKENS } = {}) {
  const config = llmConfigFromEnv(env);
  if (!config.configured) throw new Error("TokenHub DeepSeek API key 未配置");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`DeepSeek 调用失败:HTTP ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek 响应缺少 choices[0].message.content");
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeLlmFinding(raw) {
  if (!raw || typeof raw !== "object") return null;
  const code = String(raw["错配码"] || raw.code || "").trim();
  if (!code) return null;
  const trace = raw.trace || {};
  return {
    "错配码": code,
    "严重度": ALLOWED_SEVERITY.has(raw["严重度"]) ? raw["严重度"] : (SEVERITY_BY_CODE[code] || "info"),
    "判断维度": raw["判断维度"] || DIMENSION_BY_CODE[code] || "归类",
    "一句话": String(raw["一句话"] || raw.summary || "").trim(),
    "检出方式": "llm",
    "证据": String(raw["证据"] || raw.evidence || "").trim(),
    "建议修正": String(raw["建议修正"] || raw.fix || "").trim(),
    "trace": {
      node_ids: Array.isArray(trace.node_ids) ? trace.node_ids.map((id) => String(id)) : [],
      edge_ids: Array.isArray(trace.edge_ids) ? trace.edge_ids.map((id) => String(id)) : [],
      source_refs: Array.isArray(trace.source_refs) ? trace.source_refs.map((id) => String(id)) : [],
    },
    "采纳状态": "未决",
  };
}

/**
 * schema 校验 LLM 原始输出:
 *   - 只保留错配码 ∈ LLM_ALLOWED_CODES;
 *   - 复用 dropTracelessFindings 口径丢弃缺 trace / trace 越界的 finding;
 *   - 防幻觉法条:LLM finding 必须锚定本次 graph context 内真实 node/edge(不接受仅 source_refs 兜底)。
 */
export function parseFindings(rawText, graphContext) {
  let parsed = rawText;
  if (typeof rawText === "string") {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return [];
    }
  }
  const rawFindings = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.["异议"])
      ? parsed["异议"]
      : Array.isArray(parsed?.findings)
        ? parsed.findings
        : [];
  const ctx = graphContext || { graph_context: { nodes: [], edges: [] } };
  const normalized = rawFindings
    .map((finding) => normalizeLlmFinding(finding))
    .filter((finding) => finding && LLM_ALLOWED_CODES.has(finding["错配码"]));
  return dropTracelessFindings(normalized, ctx).filter((finding) => {
    const trace = finding.trace || {};
    return (trace.node_ids?.length || 0) + (trace.edge_ids?.length || 0) > 0;
  });
}

/**
 * 编排:无 key → {available:false} 只走 backbone;RAG 不可用 → 法条语义异议降级标记;
 * 任何异常(含私有红线命中)→ 抛给上层退 backbone。
 * ragFetch 为可选注入参(默认 null,即 RAG 不可用):缺原文时不硬编网络取文。
 */
export async function llmCritique({ item, graphContext, env = process.env, fetchImpl = fetch, ragFetch = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const config = llmConfigFromEnv(env);
  if (!config.configured) {
    return { findings: [], available: false, rag_available: false, degraded_note: null };
  }

  // RAG 取文(可选注入);默认不可用 → 涉法条语义异议降级,绝不伪造原文。
  let citations = [];
  let ragAvailable = false;
  if (typeof ragFetch === "function") {
    try {
      const fetched = await ragFetch({ item, graphContext });
      citations = Array.isArray(fetched) ? fetched : (fetched?.citations || []);
      ragAvailable = citations.some((citation) => citation?.excerpt) || fetched?.available === true;
    } catch {
      citations = [];
      ragAvailable = false;
    }
  }

  const messages = buildCopilotPrompt({ item, graphContext, citations }); // 私有红线断言在内,命中即抛(不发送)
  const raw = await callDeepSeek({ messages, env, fetchImpl, timeoutMs });
  let findings = parseFindings(raw, graphContext);

  let degradedNote = null;
  if (!ragAvailable) {
    // 缺原文:法条适用性语义异议(law_not_applicable)降级为「需人工复核法条」,不据原文断言。
    findings = findings.map((finding) => (finding["错配码"] === "law_not_applicable"
      ? {
          ...finding,
          "严重度": "warning",
          "建议修正": "RAG 法条原文不可用,需人工复核该法条在本场景是否适用,暂不作硬性法律认定。",
          "_rag_degraded": true,
        }
      : finding));
    if (findings.some((finding) => finding["错配码"] === "law_not_applicable")) {
      degradedNote = "RAG 法条原文不可用,涉及法条适用性的语义异议已降级为需人工复核,未据原文断言。";
    }
  }

  return { findings, available: true, rag_available: ragAvailable, degraded_note: degradedNote };
}

// 红线复用:供 server.js 合并后再过一次,确保 LLM 文本未带入私有泄漏。
export { assertRedlineClean };
