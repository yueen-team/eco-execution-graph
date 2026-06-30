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

import {
  assertRedlineClean,
  scanForbidden,
  scanCitationForbidden,
  LAW_TEXT_VALUE_PATTERNS,
} from "./graph-context.js";
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

// 法条/标准类节点:法律维度异议或引用了具体法条标识的异议,必须锚定到这些真实节点之一。
const LAW_NODE_TYPES = new Set(["law_article", "law_obligation", "tech_spec", "standard_limit"]);
const LAW_NODE_ID_RE = /^(law|obl|spec|standard|tech):/i;
// 散文里的法条/标准标识:GB/HJ/DB 标准号、《...》书名号、第X条。任一命中即「引用了具体法条/标准」。
const LEGAL_IDENTIFIER_RE = /(?:GB|HJ|DB\d{2}|T)\s*\/?\s*T?\s*\d|《[^》]{2,40}》|第[一二三四五六七八九十百千零〇\d]{1,8}条/i;

/**
 * context 内法条/标准锚点:法条/标准节点 id 集合 + 触达这些节点的边 id 集合(如 obligation_of / regulated_by)。
 * 法律维度异议必须锚定其一(法条节点 或 法条关系边),否则视为虚构法条搭真实无关 trace 便车。
 */
function lawAnchors(graphContext) {
  const nodes = graphContext?.graph_context?.nodes || [];
  const edges = graphContext?.graph_context?.edges || [];
  const nodeIds = new Set(
    nodes
      .filter((node) => LAW_NODE_TYPES.has(node?.node_type) || LAW_NODE_ID_RE.test(String(node?.node_id || "")))
      .map((node) => node.node_id),
  );
  const edgeIds = new Set(
    edges
      .filter((edge) => nodeIds.has(edge?.from) || nodeIds.has(edge?.to))
      .map((edge) => edge.edge_id),
  );
  return { nodeIds, edgeIds };
}

/**
 * 防幻觉法条·语义闸(铁律2 强化):LLM finding 若是法律维度、或散文(一句话/证据/建议修正)里引用了
 * 具体法条/标准标识,必须 trace 锚定到本次已审核 graph context 内真实的法条/标准节点或法条关系边;否则丢弃——
 * 否则 LLM 可把虚构法条号写进散文、把 trace 挂到任一真实但无关节点(如 issue 节点)便车存活。
 * 体现项目「图保证引哪条」原则:引用任何法条,必须能在已审核图谱里指到它。
 */
function lawReferenceAnchored(finding, anchors) {
  const prose = `${finding["一句话"] || ""} ${finding["证据"] || ""} ${finding["建议修正"] || ""}`;
  const citesLegal = finding["判断维度"] === "法律" || LEGAL_IDENTIFIER_RE.test(prose);
  if (!citesLegal) return true;
  const trace = finding.trace || {};
  return (trace.node_ids || []).some((id) => anchors.nodeIds.has(id))
    || (trace.edge_ids || []).some((id) => anchors.edgeIds.has(id));
}

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
  "4) 私有不进判断:输入已脱敏,你看不到企业名/GPS/照片;不要臆造这些信息。",
  "",
  "【法条引用】段会给你已审核来源的法条原文供研判;但你引用法条时只回 locator / article_no(条款定位),",
  "绝不得把法条原文整段回贴进异议的任何字段(一句话/证据/建议修正)。原文供你读懂,不供你复述。",
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

const MAX_EXCERPT_CHARS = 2000;

/**
 * 本次已审核来源闸(§11.3):rag_doc_ref 必须命中本次 graphContext 的 law_refs / tech_spec_refs,
 * 且不在 blocked_refs —— 只有被本轮图谱门禁放行的来源,其法条原文才允许进 citation 段。
 */
function approvedRagRefs(graphContext) {
  const ctx = graphContext || {};
  const allowed = new Set();
  for (const ref of [...(ctx.law_refs || []), ...(ctx.tech_spec_refs || [])]) {
    if (ref?.rag_doc_ref) allowed.add(ref.rag_doc_ref);
  }
  const blocked = new Set((ctx.blocked_refs || []).map((ref) => ref?.rag_doc_ref).filter(Boolean));
  return { allowed, blocked };
}

/**
 * RAG 引文投影:脱敏元数据(标题/定位/相关性)+【法条原文】(已审核来源、逐条红线后才挂)。
 * 红线分域:法条原文只取已审核来源、≤2000 字符截断,并逐条过 scanCitationForbidden + scanPrivateTier;
 * 脏的【丢弃该条原文】(法条原文置 null,降级该条,不整体抛)。键名固定「法条原文」(绝不用 FORBIDDEN_KEYS 内的全文键)。
 */
function projectCitations(citations, graphContext) {
  const { allowed, blocked } = approvedRagRefs(graphContext);
  return (Array.isArray(citations) ? citations : []).map((citation) => {
    const ref = citation?.rag_doc_ref ?? citation?.node_id ?? null;
    const base = {
      rag_doc_ref: ref,
      title: citation?.title ?? citation?.law_name ?? null,
      locator: citation?.locator ?? citation?.article_no ?? citation?.citation_locator ?? null,
      score: citation?.score ?? citation?.relevance ?? null,
      has_excerpt: Boolean(citation?.excerpt),
    };
    const rawExcerpt = typeof citation?.excerpt === "string" ? citation.excerpt.trim() : "";
    // 只取已审核来源:rag_doc_ref ∈ 本次 law_refs/tech_spec_refs 且不在 blocked_refs。
    if (!rawExcerpt || !ref || !allowed.has(ref) || blocked.has(ref)) {
      return { ...base, "法条原文": null };
    }
    const excerpt = rawExcerpt.slice(0, MAX_EXCERPT_CHARS);
    // 逐条红线:citation 段允许法条全文,但禁私有/企业/密钥/坐标/照片;命中即丢弃该条原文(降级,不整体抛)。
    const dirty = scanCitationForbidden(excerpt).length > 0 || scanPrivateTier(excerpt).length > 0;
    return { ...base, "法条原文": dirty ? null : excerpt };
  });
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

/**
 * strict 域断言:对 {候选, 已审核图谱上下文} 跑【完整】红线(scanForbidden 含法条全文模式)+ private-tier 拦截。
 * 这一域绝不允许法条原文,也绝不允许私有判断字段。命中即抛,fail-closed 不发送。
 */
function assertPromptClean(strictPayload) {
  // 第一闸复用 /api/graph/context 同一道红线扫描(键名 + 全集值模式,含法条全文)。
  const redline = [...new Set(scanForbidden(strictPayload))];
  // 第二闸:private-tier 判断字段(含中文键)显式拦截,给出清晰报错。
  const privateHits = [...new Set(scanPrivateTier(strictPayload))];
  if (redline.length || privateHits.length) {
    throw new Error(`副驾 LLM payload 命中私有/红线字段,已 fail-closed 不发送:${[...redline, ...privateHits].join(",")}`);
  }
}

/**
 * citation 段断言(backstop):对法条引用段跑 scanCitationForbidden + scanPrivateTier。
 * 允许法条原文,但禁私有/企业/密钥/坐标/照片;命中即抛,fail-closed。
 * 即便 projectCitations 已逐条丢弃脏原文,这道闸仍兜底拦住任何漏网的私有/密钥/坐标。
 */
export function assertCitationSegmentClean(citations) {
  const redline = [...new Set(scanCitationForbidden(citations))];
  const privateHits = [...new Set(scanPrivateTier(citations))];
  if (redline.length || privateHits.length) {
    throw new Error(`副驾法条引用段命中私有/企业/密钥/坐标字段,已 fail-closed:${[...redline, ...privateHits].join(",")}`);
  }
}

const STRIPPED_LAW_TEXT_PLACEHOLDER = "[已剥离回贴的法条原文;请按 locator / article_no 引用]";
const FINDING_PROSE_KEYS = ["一句话", "证据", "建议修正"];
// ≥ 该长度的连续子串与【本轮真送进 citation 段的法条原文】重合 → 判定逐字回贴。
// 20 字对中文法条是显著连续片段:一般散文不会与某具体法条偶合 20 字,故零误杀;
// 而单条款全文回贴(不命中下方「多条拼接 / 全文标记」正则)只能靠这道内容感知守卫抓住。
const MIN_VERBATIM_RUN_CHARS = 20;

/** 散文命中「多条拼接 / 显式全文标记」整段法条回贴模式(无需已送原文,parseFindings 内也能独立运行)。 */
function proseHitsLawTextPattern(text) {
  return typeof text === "string" && LAW_TEXT_VALUE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * 内容感知:text 是否含任一【本轮真送进 citation 段的法条原文】≥MIN_VERBATIM_RUN_CHARS 的连续子串。
 * 精确实现「原文供研判,不许回流」——不论候选法条是单条还是多条结构,逐字回贴必被抓;
 * 仅引用 locator(如「第七十七条」,<20 字)不会命中,合法保留。
 */
function proseEchoesSentLawText(text, sentLawTexts) {
  if (typeof text !== "string" || text.length < MIN_VERBATIM_RUN_CHARS) return false;
  for (const excerpt of sentLawTexts) {
    if (typeof excerpt !== "string" || excerpt.length < MIN_VERBATIM_RUN_CHARS) continue;
    for (let i = 0; i + MIN_VERBATIM_RUN_CHARS <= excerpt.length; i += 1) {
      if (text.includes(excerpt.slice(i, i + MIN_VERBATIM_RUN_CHARS))) return true;
    }
  }
  return false;
}

/**
 * finding 级引文守卫(收残留,铁律2):剥离 LLM 异议散文里被回贴的法条原文,两道叠加——
 *   ① 模式闸:命中 LAW_TEXT_VALUE_PATTERNS(多条拼接 / 全文标记)→ 剥离。无需已送原文,
 *      故 parseFindings 内独立先跑一遍,任何直接消费者也拦得住整段全文(纵深第一道)。
 *   ② 内容感知闸:散文含【本轮真送进 citation 段的法条原文】≥20 字连续子串 → 剥离。
 *      精确抓单条款逐字回贴(单条全文不命中 ① 的多条模式),零误杀一般散文。
 * 单条款 locator 引用(如「第七十七条」)不命中两道,合法保留。原文供研判,不许回流输出。
 */
function stripFindingLawFullText(finding, sentLawTexts = []) {
  if (!finding) return finding;
  let next = finding;
  for (const key of FINDING_PROSE_KEYS) {
    const text = next[key];
    if (typeof text !== "string") continue;
    if (proseHitsLawTextPattern(text) || proseEchoesSentLawText(text, sentLawTexts)) {
      if (next === finding) next = { ...finding };
      next[key] = STRIPPED_LAW_TEXT_PLACEHOLDER;
    }
  }
  return next;
}

/**
 * 组装 DeepSeek messages。
 * system 含四铁律 + 输出 JSON schema;user 含【脱敏白名单投影】候选 + 已审核 graph context + citation 元数据。
 * 关键红线:送出前断言 payload 不含 private-tier 且不命中 graph-context FORBIDDEN_KEYS,命中即抛。
 */
export function buildCopilotPrompt({ item, graphContext, citations = [] }) {
  const candidate = projectCandidate(item);
  const graph = projectGraphContext(graphContext);
  const citationSegment = projectCitations(citations, graphContext);
  // 原文真进 prompt 才算可用:某条引用挂上了「法条原文」字段。
  const ragAvailable = citationSegment.some((citation) => Boolean(citation["法条原文"]));

  // 红线分域闸 ①:strict 段(候选 + 已审核图谱上下文)过【完整】红线 + 私有(私有 + 法条全文都禁)。
  const strictPayload = {
    "候选": candidate,
    "已审核图谱上下文": graph,
  };
  assertPromptClean(strictPayload); // 命中即抛(fail-closed,绝不发送)

  // 红线分域闸 ②:法条引用段过 citation 闸(允许法条原文,禁私有/企业/密钥/坐标/照片)。
  assertCitationSegmentClean(citationSegment); // backstop,命中即抛

  const userPayload = {
    ...strictPayload,
    "法条引用": citationSegment,
    "法条原文可用": ragAvailable,
    "说明": ragAvailable ? null : "法条原文不可用,涉及法条适用性的判断必须降级为需人工复核,不得据原文断言。",
  };
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
  const anchors = lawAnchors(ctx);
  const normalized = rawFindings
    .map((finding) => normalizeLlmFinding(finding))
    .filter((finding) => finding && LLM_ALLOWED_CODES.has(finding["错配码"]));
  return dropTracelessFindings(normalized, ctx)
    .filter((finding) => {
      const trace = finding.trace || {};
      if ((trace.node_ids?.length || 0) + (trace.edge_ids?.length || 0) <= 0) return false;
      // 防幻觉法条:引用了具体法条/标准的异议必须锚定 context 内真实法条节点或法条关系边,否则丢弃。
      return lawReferenceAnchored(finding, anchors);
    })
    // 纵深第一道:整段全文回贴在解析边界即剥离,任何 parseFindings 直接消费者都不漏多条法条全文。
    // (内容感知的单条逐字回贴剥离需已送原文,在 llmCritique 调用点二次叠加。)
    .map((finding) => stripFindingLawFullText(finding));
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
  if (typeof ragFetch === "function") {
    try {
      const fetched = await ragFetch({ item, graphContext });
      citations = Array.isArray(fetched) ? fetched : (fetched?.citations || []);
    } catch {
      citations = [];
    }
  }

  // rag_available 的口径与 prompt 一致:法条原文【真进了 citation 段】(已审核来源 + 逐条红线后仍存活)才算可用。
  // 脏原文被逐条丢弃 / 来源未审核 / 无 excerpt → 视为不可用,降级路径接管。
  const citationSegment = projectCitations(citations, graphContext);
  const ragAvailable = citationSegment.some((citation) => Boolean(citation["法条原文"]));

  const messages = buildCopilotPrompt({ item, graphContext, citations }); // strict + citation 双闸,命中即抛(不发送)
  const raw = await callDeepSeek({ messages, env, fetchImpl, timeoutMs });
  // finding 级引文守卫:剥离任何被 LLM 回贴的法条原文 —— ① 整段全文(模式闸,parseFindings 内已先跑)
  // + ② 本轮真送进 citation 段的单条法条原文逐字回贴(内容感知闸,需已送原文)。单条款 locator 引用合法保留。
  const sentLawTexts = citationSegment.map((citation) => citation["法条原文"]).filter(Boolean);
  let findings = parseFindings(raw, graphContext).map((finding) => stripFindingLawFullText(finding, sentLawTexts));

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
