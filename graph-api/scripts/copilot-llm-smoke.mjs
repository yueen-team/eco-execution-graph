// 十律 ETO 审核副驾 · 真活体 DeepSeek copilot smoke runner(verify:external 凭证 lane 专用)
//
// 它端到端验证「副驾 LLM 语义研判」的真实生产路径 + 四条红线:
//   1) 私有不进 prompt:脱敏白名单投影 + 送出前断言(copilot-llm.js 已是第一道),这里做 smoke 级二次确认;
//   2) advisory-only:findings 绝不带审核状态 / 裁决键;
//   3) trace 锚定防幻觉:每条 finding 的 trace 必须落在本次真实 graph context 内的 node/edge 上;
//   4) RAG 无原文降级:JS 侧无 RAG 客户端(ragFetch=null,as-built 生产即降级)→ 涉法条语义异议降级,不伪造原文。
//
// 隔离 / 离线纪律:
//   - 唯一触网点是 llmCritique → callDeepSeek 那一次 fetch;无 TokenHub key → 直接 blocked,绝不触网。
//   - 报告(reports/copilot-llm-smoke.json)脱敏:只放计数 / 码 / 布尔 / model 名,
//     【绝不】含候选正文 / 法条原文 / 企业数据 / 任何 FORBIDDEN_PAYLOAD_KEYS。
//   - run_command(external_verification_lane.py)不传 env 给子进程,故本 runner 自加载 .env.local。
//   - 可测核心 runCopilotSmoke({env,fetchImpl,...}) 为可注入纯函数(不写文件、不 exit),便于离线 stub 断言;
//     脚本主体 = 薄 main + 兜底写脱敏 failed 报告 + exit 0(lane 据报告判级,smoke 自身不抛错阻断)。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { llmConfigFromEnv, llmCritique, CITATION_SEGMENT_KEY } from "../src/copilot-llm.js";
import { loadGraphContextInputs, buildGraphContextResponse, scanForbidden, scanCitationForbidden } from "../src/graph-context.js";
import { buildRagFetch } from "../src/tc3-rag-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_GRAPH_PATH = path.join(ROOT, "data", "exports", "demo_hazardous_waste_internal", "graph.json");
const DEFAULT_PUBLICATION_PATH = path.join(ROOT, "data", "knowledge-governance", "publications", "ecocheck.json");
const REPORT_PATH = path.join(ROOT, "reports", "copilot-llm-smoke.json");
const ENV_LOCAL_PATH = path.join(ROOT, ".env.local");
// 真图锚点:危废标签不规范,含真实 law/tech_spec 节点,使 law-anchor 防幻觉路径被真实行使。
const SMOKE_NODE_ID = "issue:hw:label-incomplete";
const SMOKE_DEPTH = 2;

// 与 pipeline/external_verification_lane.py FORBIDDEN_PAYLOAD_KEYS 同源(脱敏边界单点对称)。
// 报告与外发 payload 都不得含法条原文、企业数据或私有判断笔记键。
export const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "Content",
  "content",
  "full_text",
  "raw_text",
  "article_text",
  "enterprise_name",
  "company_name",
  "企业名称快照",
  "evidence_judgment_standard",
  "rectification_template",
  "review_note",
  "eto_note",
  "eto_review_note",
  "证据判断标准",
  "整改模板",
  "eto审核笔记",
]);

// prompt 子串扫描标记:私有判断 / 企业 / 法条全文键名。
// 刻意不含通用 content/Content —— OpenAI 消息壳本就有 "content" 字段;通用键由 scanForbidden 在
// 解析后的业务 payload 上做结构化检测,避免对消息壳误报。
const PROMPT_FORBIDDEN_MARKERS = [
  "full_text",
  "raw_text",
  "article_text",
  "enterprise_name",
  "company_name",
  "企业名称快照",
  "evidence_judgment_standard",
  "rectification_template",
  "review_note",
  "eto_note",
  "eto_review_note",
  "证据判断标准",
  "整改模板",
  "eto审核笔记",
];

// advisory-only:findings 绝不得带审核状态 / 裁决键(副驾只产异议,永不裁决)。
const DECISION_KEYS = new Set([
  "审核状态",
  "当前审核状态",
  "审核结论",
  "裁决",
  "decision",
  "review_status",
]);

/** 递归扫描:与 lane find_forbidden_payload_keys 同口径,只看键名(不看值),命中即记 {path,key}。 */
export function findForbiddenPayloadKeys(value, pathLabel = "$", hits = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenPayloadKeys(item, `${pathLabel}[${index}]`, hits));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const child = `${pathLabel}.${key}`;
      if (FORBIDDEN_PAYLOAD_KEYS.has(key)) hits.push({ path: child, key });
      findForbiddenPayloadKeys(item, child, hits);
    }
  }
  return hits;
}

/**
 * 纯合成、脱敏 review 候选(危废标签不规范口径)。
 * 只含区域 / 行业 / 环保维度 / 建议问题类型 / 问题类型引用 / 现场问题摘要 / 现场表现 /
 * 整改要求 / 整改结果 / 证据摘要 / 法条规范候选(指向真实图节点);
 * 绝不含企业名称快照 / GPS / 照片 / 私有判断标准。
 */
export function syntheticCandidate() {
  return {
    "审核编号": "smoke:copilot:hw-label-001",
    "区域": "华东",
    "行业": "危险废物经营",
    "环保维度": "solid_waste_hazardous_waste",
    "建议问题类型": "危废标签不规范",
    "问题类型引用": SMOKE_NODE_ID,
    "现场问题摘要": "危废暂存间部分包装标签信息不完整,缺少危险特性与产生日期标识。",
    "现场表现": ["标签缺少危险特性标识", "未标注危废产生日期"],
    "整改要求": "按标签管理要求补齐危废标签要素,并建立标签核查台账。",
    "整改结果": "整改中",
    "证据摘要": { "证据数量": 2, "证据类型": ["标签照片", "现场检查记录"] },
    "法条规范候选": [{ "引用编号": "spec:gb18597:label", "名称": "GB 18597 危废贮存标签管理要求" }],
  };
}

/** 包装 fetchImpl,记录发往 DeepSeek 的请求 body(供 prompt 红线二次确认)。 */
function buildCapturingFetch(fetchImpl) {
  const requests = [];
  const wrapped = async (url, init) => {
    requests.push({ url, body: init?.body });
    return fetchImpl(url, init);
  };
  return { wrapped, requests };
}

/**
 * 扫描捕获到的 prompt(messages 全文):结构化红线(键名 + 值模式)+ 私有键名子串。
 * 【partition-aware】与 buildCopilotPrompt 分段同源:把【法条引用】段(CITATION_SEGMENT_KEY)切出来,
 * 用 scanCitationForbidden(允许法条原文,禁私有/企业/密钥/坐标/照片)扫;其余段(候选 / 已审核图谱上下文 /
 * 法条原文可用 / 说明)用全集 scanForbidden(含法条全文模式)扫。否则 grounded 时合法法条原文(record.Content)
 * 进了 prompt,会被 smoke 二次闸的法条全文模式误判为 prompt_redline_clean=false。
 */
export function scanPrompts(requests) {
  const promptStrings = [];
  const hits = [];
  for (const req of requests) {
    let body = null;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch {
      body = null;
    }
    const messages = (body && Array.isArray(body.messages)) ? body.messages : [];
    for (const msg of messages) {
      const content = typeof msg?.content === "string" ? msg.content : JSON.stringify(msg?.content ?? "");
      promptStrings.push(content);
      // 业务 payload 结构化扫描(键名 + 值模式,复用 /api/graph/context 同一道闸)。
      let payloadObj = null;
      try {
        payloadObj = JSON.parse(content);
      } catch {
        payloadObj = null;
      }
      if (payloadObj && typeof payloadObj === "object" && !Array.isArray(payloadObj)) {
        // 分域:法条引用段允许法条原文(scanCitationForbidden),其余段全集扫描(scanForbidden,含法条全文)。
        const { [CITATION_SEGMENT_KEY]: citationSegment, ...rest } = payloadObj;
        hits.push(...scanForbidden(rest));
        if (citationSegment !== undefined) hits.push(...scanCitationForbidden(citationSegment));
      } else if (payloadObj) {
        hits.push(...scanForbidden(payloadObj));
      }
      // 私有键名子串扫描(content 已是业务串,不会误报消息壳)。markers 均为私有/企业/全文键名,
      // 合法法条原文不含这些键名,故仍对整段 content 扫描,不受 partition 影响。
      for (const marker of PROMPT_FORBIDDEN_MARKERS) {
        if (content.includes(marker)) hits.push(`marker:${marker}`);
      }
    }
  }
  return { promptStrings, hits: [...new Set(hits)] };
}

/** advisory-only 检查:findings 不得含审核状态 / 裁决键。返回命中键名列表。 */
export function findingsDecisionHits(findings) {
  const hits = [];
  const scan = (value) => {
    if (Array.isArray(value)) {
      value.forEach(scan);
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if (DECISION_KEYS.has(key)) hits.push(key);
        scan(item);
      }
    }
  };
  scan(findings);
  return [...new Set(hits)];
}

/** trace 锚定防幻觉:每条 finding 的 trace 必须有 node/edge 且全部落在本次 graph context 内。 */
export function tracesAnchored(findings, graphContext) {
  const nodeIds = new Set((graphContext?.graph_context?.nodes || []).map((node) => node.node_id));
  const edgeIds = new Set((graphContext?.graph_context?.edges || []).map((edge) => edge.edge_id));
  return findings.every((finding) => {
    const trace = finding?.trace || {};
    const nIds = trace.node_ids || [];
    const eIds = trace.edge_ids || [];
    const hasAnchor = nIds.length + eIds.length > 0;
    if (!hasAnchor) return false;
    if (nIds.some((id) => !nodeIds.has(id))) return false;
    if (eIds.some((id) => !edgeIds.has(id))) return false;
    return true;
  });
}

/** 脱敏 error 摘要:抹掉密钥值与 Bearer 头,截断长度。 */
function desensitizeError(error, env) {
  let message = String(error?.message || error || "unknown error");
  const config = llmConfigFromEnv(env);
  if (config.apiKey && config.apiKey.length >= 6) message = message.split(config.apiKey).join("<redacted>");
  message = message.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer <redacted>");
  return message.slice(0, 300);
}

/**
 * 可测核心:不写文件、不 exit。返回 { report(脱敏), prompts(捕获的 messages 文本,仅供测试断言) }。
 * 无 TokenHub key → blocked,绝不触网。真调走 llmCritique(真 DeepSeek HTTP,ragFetch 默认 null = 生产降级)。
 */
export async function runCopilotSmoke({
  env = process.env,
  fetchImpl = fetch,
  ragFetch = buildRagFetch(env),
  graphPath = DEFAULT_GRAPH_PATH,
  publicationPath = DEFAULT_PUBLICATION_PATH,
  item = syntheticCandidate(),
  now = new Date().toISOString(),
} = {}) {
  const config = llmConfigFromEnv(env);

  // 自守卫:无 TokenHub key → blocked,绝不装配、绝不触网(fail-closed)。
  if (!config.configured) {
    return {
      report: {
        status: "blocked",
        reason: "no tokenhub credentials",
        advisory_only: true,
        private_tier_boundary_ok: true,
        model: config.model,
        finding_count: 0,
        codes: [],
        rag_available: false,
        degraded: false,
        grounded: false,
        prompt_redline_clean: true,
        trace_anchored: true,
        checked_at: now,
      },
      prompts: [],
    };
  }

  try {
    // 装配真图上下文(本地文件读,非网络):真实 law/tech_spec 节点 + law-anchor 边。
    const { graph, publication } = await loadGraphContextInputs({ graphPath, publicationPath });
    const graphContext = buildGraphContextResponse({ graph, publication, nodeId: SMOKE_NODE_ID, depth: SMOKE_DEPTH });

    // 捕获发往 DeepSeek 的请求 body,做 prompt 红线二次确认。
    const { wrapped, requests } = buildCapturingFetch(fetchImpl);

    // 真调:私有红线断言在 buildCopilotPrompt 内(命中即抛,绝不发送);ragFetch=null = 生产 RAG 降级路径。
    const result = await llmCritique({ item, graphContext, env, fetchImpl: wrapped, ragFetch });
    const findings = result.findings || [];

    // 四条红线确认。
    const { promptStrings, hits: promptHits } = scanPrompts(requests);
    const findingForbidden = findForbiddenPayloadKeys(findings);
    const decisionHits = findingsDecisionHits(findings);
    const anchored = tracesAnchored(findings, graphContext);
    const promptClean = promptHits.length === 0;
    const redlineBroken = !promptClean || findingForbidden.length > 0 || decisionHits.length > 0 || !anchored;

    const codes = [...new Set(findings.map((finding) => finding["错配码"]).filter(Boolean))];
    const ragAvailable = result.rag_available === true;
    const degraded = Boolean(result.degraded_note);
    // grounded:法条原文【真进了 prompt 的 citation 段】(已审核来源 + 逐条红线后仍存活)且未降级。
    // 缺 LKE 凭证 → ragFetch=null → ragAvailable=false → grounded=false(降级,行为不变)。
    const grounded = ragAvailable && !degraded;

    const report = {
      status: redlineBroken ? "failed" : "pass",
      advisory_only: true,
      model: config.model,
      finding_count: findings.length,
      codes,
      rag_available: ragAvailable,
      degraded,
      grounded,
      prompt_redline_clean: promptClean,
      trace_anchored: anchored,
      checked_at: now,
    };
    if (redlineBroken) {
      report.reason = [
        !promptClean ? `prompt_redline:${promptHits.join("|")}` : null,
        findingForbidden.length ? `findings_forbidden_keys:${findingForbidden.length}` : null,
        decisionHits.length ? `advisory_violation:${decisionHits.join("|")}` : null,
        !anchored ? "trace_unanchored" : null,
      ].filter(Boolean).join("; ");
    }
    return { report, prompts: promptStrings };
  } catch (error) {
    // 网络 / 超时 / 解析 / 私有红线命中 → status:failed + 脱敏 error,exit 0(lane 据报告判级)。
    return {
      report: {
        status: "failed",
        advisory_only: true,
        model: config.model,
        finding_count: 0,
        codes: [],
        rag_available: false,
        degraded: false,
        grounded: false,
        prompt_redline_clean: true,
        trace_anchored: true,
        checked_at: now,
        error: desensitizeError(error, env),
      },
      prompts: [],
    };
  }
}

/**
 * 自加载 .env.local:KEY=VALUE,跳过 # 注释与空行;不覆盖已存在的 process.env(process.env 优先)。
 * 与 pipeline/tencent_cloud_signer.load_env 同口径(utf-8-sig BOM 容忍、首个 = 切分)。
 */
export function loadEnvLocal(root = ROOT, base = process.env) {
  const fileEnv = {};
  const envPath = path.join(root, ".env.local");
  if (fs.existsSync(envPath)) {
    let raw = fs.readFileSync(envPath, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && !(key in fileEnv)) fileEnv[key] = value;
    }
  }
  // 叠加 process.env:不覆盖已存在的 process.env(process.env 值优先)。
  const merged = { ...fileEnv };
  for (const [key, value] of Object.entries(base || {})) {
    if (value !== undefined && value !== "") merged[key] = value;
  }
  return merged;
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
}

async function main() {
  const env = loadEnvLocal(ROOT, process.env);
  // 生产路径接入 M1 buildRagFetch:有 LKE 凭证 → 真取法条原文 grounding;缺凭证 → null → RAG 降级(不触网、行为不变)。
  const ragFetch = buildRagFetch(env);
  const { report } = await runCopilotSmoke({ env, fetchImpl: fetch, ragFetch });
  writeReport(report);
  // 脱敏摘要(不含候选正文 / 法条原文 / 密钥)。
  console.log(JSON.stringify({
    smoke: "copilot-llm",
    status: report.status,
    model: report.model,
    finding_count: report.finding_count,
    rag_available: report.rag_available,
    degraded: report.degraded,
    grounded: report.grounded,
    prompt_redline_clean: report.prompt_redline_clean,
    trace_anchored: report.trace_anchored,
    report: path.relative(ROOT, REPORT_PATH).split(path.sep).join("/"),
  }, null, 2));
  // smoke 自身不因 findings 多寡或 status 失败而非零退出:lane 据报告判级。
  process.exit(0);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    // 兜底:任何未捕获异常也写脱敏 failed 报告,exit 0。
    try {
      writeReport({
        status: "failed",
        advisory_only: true,
        finding_count: 0,
        codes: [],
        rag_available: false,
        degraded: false,
        grounded: false,
        prompt_redline_clean: true,
        trace_anchored: true,
        checked_at: new Date().toISOString(),
        error: String(error?.message || error).slice(0, 300),
      });
    } catch {
      // 报告都写不了也不抛,保持 exit 0 的 lane 契约。
    }
    console.error("copilot-llm-smoke unexpected error (wrote failed report):", String(error?.message || error).slice(0, 200));
    process.exit(0);
  });
}
