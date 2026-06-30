// 副驾 RAG 法条原文 grounding · TC3-HMAC-SHA256 直连腾讯云 LKE RetrieveKnowledge
//
// 隔离纪律(docs/api/eto-review-copilot.md §11.5 与 copilot-llm.js 同源):
//   - 本模块只负责「取法条原文 + 脱敏」,绝不参与 prompt 装配。copilot-llm.js 的 buildRagFetch 注入口
//     消费本模块产出的 citations(含 excerpt),再由 projectCitations 决定哪些进 prompt(正文恒不进,只过 has_excerpt)。
//   - 零新依赖:仅用 node:crypto(TC3 签名)+ 全局 fetch(AbortController 超时),纯离线可单测(stub fetchImpl)。
//
// 红线(candy 已定 2026-06-28):
//   - sign-what-you-send:同一 body 字符串既做签名 hash 又做 HTTP body,绝不重新序列化(移植自 tencent_cloud_signer.py)。
//   - excerpt = 法条原文(record.Content),仅供下游 prompt 装配按需取用;Metadata 企业噪声一律丢弃,不带出本模块。
//   - 缺 LKE 凭证 → buildRagFetch 返回 null(=>RAG 降级),绝不伪造原文,绝不硬编网络。

import { createHash, createHmac } from "node:crypto";

const LKE_HOST = "lkeap.tencentcloudapi.com";
const LKE_SERVICE = "lkeap";
const LKE_VERSION = "2024-05-22";
const LKE_ACTION_RETRIEVE = "RetrieveKnowledge";
const DEFAULT_REGION = "ap-guangzhou";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_TOP_K = 3;

/** 腾讯云 API 业务错误(Response.Error{Code,Message});移植 tencent_cloud_signer.TencentCloudError。 */
export class TencentCloudError extends Error {
  constructor(code, message, requestId = null) {
    super(`${code}: ${message}`);
    this.name = "TencentCloudError";
    this.code = code;
    this.detail = message;
    this.requestId = requestId;
  }
}

/** sha256 hex(与 hashlib.sha256(...).hexdigest() 字节一致)。 */
export function sha256hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** HMAC-SHA256 raw digest Buffer;链式派生中段用 raw digest 作下段 key(只末段取 hex)。 */
export function hmacSha256(key, message) {
  return createHmac("sha256", key).update(message, "utf8").digest();
}

/** 凭证守卫:同 llmConfigFromEnv/configured —— 空 / 含 'your-' / 含 '填入' 视为未配置。 */
function isPlaceholder(value) {
  return !value || value.includes("your-") || value.includes("填入");
}

/** AuthFailure.SignatureExpire 报文里的服务器时间:/server time\s+(\d+)/。 */
function serverTimeFromMessage(message) {
  const match = /server time\s+(\d+)/i.exec(String(message || ""));
  return match ? Number(match[1]) : null;
}

/**
 * 从 env 解析腾讯云 LKE 配置(同 llmConfigFromEnv 风格)。
 * configured 仅看签名凭证(secretId/secretKey 非占位);knowledgeBaseIds 单独给,由调用方决定能否检索。
 */
export function lkeConfigFromEnv(env = process.env) {
  const secretId = env.TENCENT_LKE_SECRET_ID || "";
  const secretKey = env.TENCENT_LKE_SECRET_KEY || "";
  const knowledgeBaseIds = String(env.TENCENT_LKE_KNOWLEDGE_BASE_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const region = env.TENCENT_LKE_REGION || DEFAULT_REGION;
  const timeOffsetSeconds = Number.parseInt(env.TENCENT_CLOUD_TIME_OFFSET_SECONDS || "0", 10) || 0;
  return {
    configured: !isPlaceholder(secretId) && !isPlaceholder(secretKey),
    secretId,
    secretKey,
    knowledgeBaseIds,
    region,
    timeOffsetSeconds,
  };
}

/**
 * TC3-HMAC-SHA256 签名(移植 tencent_cloud_signer._call_once 的签名段)。
 * ★ sign-what-you-send:返回的 body 字符串既是被 hash 的串,也必须是实际 HTTP body —— 调用方绝不重新序列化。
 * ★ #1 易错:canonicalHeaders 末尾 \n + 与 signedHeaders 之间再 \n → canonicalRequest 内含一个【空行】,必须有。
 */
export function tc3Sign({
  secretId,
  secretKey,
  action,
  payload,
  body,
  host = LKE_HOST,
  service = LKE_SERVICE,
  version = LKE_VERSION,
  region = DEFAULT_REGION,
  timestamp,
} = {}) {
  // 同一 body 串既进 hash 又做 HTTP body;给了 body 就用 body,绝不再 stringify。
  const bodyStr = typeof body === "string" ? body : JSON.stringify(payload);
  // 同一整数既进 string_to_sign 第 2 行,又进 X-TC-Timestamp 头。
  const ts = Number.isFinite(timestamp) ? Math.floor(timestamp) : Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const contentType = "application/json; charset=utf-8";

  // canonicalHeaders:键小写、排序 content-type<host<x-tc-action、整块以 \n 结尾。
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${String(action).toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const hashedPayload = sha256hex(bodyStr);
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, hashedPayload].join("\n");

  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = ["TC3-HMAC-SHA256", String(ts), credentialScope, sha256hex(canonicalRequest)].join("\n");

  // 4 段 HMAC 派生:中段用 raw digest Buffer 作下段 key,只末段 hex。
  const secretDate = hmacSha256(Buffer.from(`TC3${secretKey}`, "utf8"), date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = createHmac("sha256", secretSigning).update(stringToSign, "utf8").digest("hex");

  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    body: bodyStr,
    timestamp: ts,
    date,
    signature,
    authorization,
    canonicalRequest,
    stringToSign,
    headers: {
      Authorization: authorization,
      "Content-Type": contentType, // 与 canonical content-type 字节一致
      Host: host,
      "X-TC-Action": action, // 原大小写
      "X-TC-Timestamp": String(ts),
      "X-TC-Version": version,
      "X-TC-Region": region,
    },
  };
}

/** 单次签名 + 发送 + 解析;AbortController 超时(仿 copilot-llm.callDeepSeek)。Response.Error 抛 TencentCloudError。 */
async function tc3FetchOnce(signed, { host, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://${host}/`, {
      method: "POST",
      headers: signed.headers,
      body: signed.body, // ★ 与 signed 内被 hash 的同一串
      signal: controller.signal,
    });
    // 腾讯云即便 4xx/5xx 也把业务错误放在 body JSON(同 Python urllib HTTPError 读 body),故不按 response.ok 短路。
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`腾讯云 LKE 响应解析失败:HTTP ${response?.status}`);
    }
    const resp = (data && data.Response) || {};
    if (resp.Error) {
      throw new TencentCloudError(resp.Error.Code || "Unknown", resp.Error.Message || "", resp.RequestId || null);
    }
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 通用 TC3 调用:签名 → 发送 → 解析。
 * 时钟偏移单次重试:Response.Error.Code==='AuthFailure.SignatureExpire' 时,从 message 取 server time,
 * 设 offset=serverTime-now,重签重发一次(移植 TencentCloudClient.call 的 retry_on_time_skew)。
 */
export async function tc3Call({
  config,
  action,
  payload,
  body,
  version = LKE_VERSION,
  host = LKE_HOST,
  service = LKE_SERVICE,
  region,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryOnTimeSkew = true,
  nowSeconds = () => Math.floor(Date.now() / 1000),
} = {}) {
  if (!config || !config.configured) throw new Error("腾讯云 LKE 凭证未配置(secretId/secretKey)");
  const reg = region || config.region || DEFAULT_REGION;
  const bodyStr = typeof body === "string" ? body : JSON.stringify(payload);

  const sendAt = (ts) =>
    tc3FetchOnce(
      tc3Sign({
        secretId: config.secretId,
        secretKey: config.secretKey,
        action,
        body: bodyStr,
        host,
        service,
        version,
        region: reg,
        timestamp: ts,
      }),
      { host, fetchImpl, timeoutMs },
    );

  try {
    return await sendAt(nowSeconds() + (config.timeOffsetSeconds || 0));
  } catch (error) {
    if (retryOnTimeSkew && error instanceof TencentCloudError && error.code === "AuthFailure.SignatureExpire") {
      const serverTime = serverTimeFromMessage(error.detail || error.message);
      if (serverTime != null) {
        config.timeOffsetSeconds = serverTime - nowSeconds();
        return await sendAt(nowSeconds() + config.timeOffsetSeconds);
      }
    }
    throw error;
  }
}

/**
 * RetrieveKnowledge:单个 KnowledgeBaseId 检索,返回原始 Records[](每条 Title/Content/Metadata)。
 * 多 id 由 buildRagFetch 循环调用(不传数组)。脱敏在 sanitizeRetrieveRecord。
 */
export async function retrieveKnowledge({
  config,
  query,
  knowledgeBaseId,
  topK = DEFAULT_TOP_K,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const response = await tc3Call({
    config,
    action: LKE_ACTION_RETRIEVE,
    payload: {
      KnowledgeBaseId: knowledgeBaseId,
      Query: String(query ?? ""),
      RetrievalSetting: { TopK: topK },
    },
    fetchImpl,
    timeoutMs,
  });
  return Array.isArray(response?.Records) ? response.Records : [];
}

// ── 脱敏:从 RetrieveKnowledge 记录里只取引文安全字段,丢弃 Metadata 企业噪声 ──

const RAG_DOC_REF_ALIASES = ["rag_doc_ref", "RagDocRef", "DocumentId", "DocId", "KnowledgeId", "FileId", "SourceId"];
const ARTICLE_RE = /第[一二三四五六七八九十百千万零〇两\d]+条(?:之[一二三四五六七八九十\d]+)?/;
const TECH_SPEC_RE = /\b(?:GB|GB\/T|HJ|HJ\/T|DB\d{2}|DB\d{2}\/T|T\/[A-Z0-9]+)\s*[0-9][0-9A-Za-z./-]*(?:[-—][0-9]{2,4})?\b/i;

function firstNonEmpty(obj, keys) {
  if (!obj || typeof obj !== "object") return "";
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== "") {
      return Array.isArray(value)
        ? value.filter((item) => item !== null && item !== undefined && item !== "").map(String).join(",")
        : String(value);
    }
  }
  return "";
}

function regexMatch(re, text) {
  const match = re.exec(String(text || ""));
  return match ? match[0].replace(/—/g, "-").trim() : "";
}

function normalizePage(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("第") && text.endsWith("页")) return text;
  return /^\d+$/.test(text) ? `第${text}页` : text;
}

/** 引文定位(法条号/标准号/章节/页码),只取结构化引文字段,绝不带出 Metadata 原文本/企业噪声。 */
function buildLocator(record, metadata) {
  const explicit = firstNonEmpty(metadata, ["citation_locator", "CitationLocator", "Locator", "Location", "ChunkId", "SegmentId"]);
  if (explicit && explicit !== "source-level") return explicit;
  const title = record?.Title || record?.title || "";
  const article =
    firstNonEmpty(metadata, ["article_no", "ArticleNo", "ArticleNumber", "Article", "条款号", "条文号"]) ||
    regexMatch(ARTICLE_RE, title);
  const spec =
    firstNonEmpty(metadata, ["tech_spec_no", "standard_no", "StandardNo", "SpecNo", "标准号", "规范编号"]) ||
    regexMatch(TECH_SPEC_RE, title);
  const section = firstNonEmpty(metadata, ["section", "Section", "SectionTitle", "Heading", "Chapter", "章节", "小节"]);
  const page = normalizePage(firstNonEmpty(metadata, ["page", "Page", "PageNumber", "PageNumbers", "Pages", "页码"]));
  const parts = [article, spec, section, page].filter(Boolean);
  return parts.length ? parts.join("；") : null;
}

function pickRagDocRef(record, metadata) {
  return firstNonEmpty(record, RAG_DOC_REF_ALIASES) || firstNonEmpty(metadata, RAG_DOC_REF_ALIASES) || null;
}

function pickScore(record) {
  const raw = record?.Score ?? record?.score ?? record?.Relevance ?? record?.relevance;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

/**
 * 单条记录脱敏:{rag_doc_ref,title,locator,score,excerpt}。
 * excerpt = record.Content(法条原文,仅供下游 prompt 装配按需取);丢弃整块 Metadata(企业噪声不出本模块)。
 */
export function sanitizeRetrieveRecord(record) {
  const rec = record && typeof record === "object" ? record : {};
  const metadata = rec.Metadata && typeof rec.Metadata === "object"
    ? rec.Metadata
    : rec.metadata && typeof rec.metadata === "object"
      ? rec.metadata
      : {};
  const content = rec.Content ?? rec.content ?? "";
  return {
    rag_doc_ref: pickRagDocRef(rec, metadata),
    title: rec.Title ?? rec.title ?? null,
    locator: buildLocator(rec, metadata),
    score: pickScore(rec),
    excerpt: typeof content === "string" ? content : String(content ?? ""),
  };
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

const MAX_RAG_QUERIES = 6;

/**
 * 检索查询集(candy 2026-06-30 优化):每条「法条规范候选名称」各自一条查询 —— 各得独立 topK,
 * 不被【可能填错的「建议问题类型」】挤占(类型恰恰在要抓错配时最可能错,旧的拼接式查询会被带偏、
 * 把相关标准挤出 topK 致 grounding 降级)。无法条候选时才回退到建议问题类型。均为脱敏白名单字段。
 */
function buildRagQueries(item) {
  const it = item || {};
  const names = asArray(it["法条规范候选"])
    .map((candidate) => candidate && candidate["名称"])
    .filter(Boolean)
    .map((name) => String(name).trim())
    .filter(Boolean);
  if (names.length) return [...new Set(names)].slice(0, MAX_RAG_QUERIES);
  const type = it["建议问题类型"] ? String(it["建议问题类型"]).trim() : "";
  return type ? [type] : [];
}

/**
 * 构造 copilot-llm.llmCritique 的 ragFetch 注入函数。
 *   - 缺 LKE 凭证 / 无知识库 id → 返回 null(=>RAG 降级,涉法条语义异议由 llmCritique 退为需人工复核,绝不伪造原文)。
 *   - 否则返回 async ({item,graphContext}) => {citations:[{rag_doc_ref,title,locator,excerpt,score}], available}。
 *     每条法条候选 × 每个 knowledgeBaseId 各发一次 RetrieveKnowledge(单 id,不传数组),
 *     按 rag_doc_ref / 标题+定位 去重,只收有 excerpt(法条原文)的引文。
 */
export function buildRagFetch(env = process.env, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, topK = DEFAULT_TOP_K } = {}) {
  const config = lkeConfigFromEnv(env);
  if (!config.configured || !config.knowledgeBaseIds.length) return null;

  return async ({ item, graphContext } = {}) => {
    void graphContext; // 按 item 法条候选名称(无则建议问题类型)检索;保留签名以备后续按图谱锚点增强。
    const queries = buildRagQueries(item);
    if (!queries.length) return { citations: [], available: false };

    const seen = new Set();
    const citations = [];
    for (const knowledgeBaseId of config.knowledgeBaseIds) {
      for (const query of queries) {
        const records = await retrieveKnowledge({ config, query, knowledgeBaseId, topK, fetchImpl, timeoutMs });
        for (const record of records) {
          const clean = sanitizeRetrieveRecord(record);
          if (!clean.excerpt) continue; // 无原文不入引文(下游据 has_excerpt 判 RAG 可用性)
          const dedupeKey = clean.rag_doc_ref || `${clean.title || ""}|${clean.locator || ""}|${clean.excerpt.slice(0, 64)}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          citations.push(clean);
        }
      }
    }
    return { citations, available: citations.length > 0 };
  };
}
