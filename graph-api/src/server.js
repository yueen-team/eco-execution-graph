import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyReviewDecision, buildPitfallBatch, filterReviewItemsForRuntime, groupKey, normalizeEcoCheckPayload } from "./review-store.js";
import { createReviewStorage } from "./storage.js";
import { buildGraphContextResponse, contextPathsFromRoot, loadGraphContextInputs } from "./graph-context.js";
import { buildCopilotBackbone } from "./review-copilot.js";
import {
  wecomConfigFromEnv, isWecomConfigured, buildWecomLoginUrl, exchangeWecomCode,
  buildWecomAppRedirectUrl, isUserAllowed, isReviewUser, issueSession, verifySession, parseCookies, sessionCookie,
} from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const STAGING_PATH = process.env.ECO_GRAPH_STAGING_PATH || path.join(ROOT, "data", "private-staging", "field-events.jsonl");
const PORT = Number(process.env.PORT || 8787);
const API_TOKEN = process.env.ECO_GRAPH_API_TOKEN || "";
const DEFAULT_MAX_BODY_BYTES = Number(process.env.ECO_GRAPH_MAX_BODY_BYTES || 1024 * 1024);
const DEFAULT_CONTEXT_PATHS = contextPathsFromRoot(ROOT);

function isProductionLike(config = {}) {
  return (
    config.nodeEnv === "production" ||
    config.ecoGraphEnv === "production" ||
    config.deployTarget === "cloudbase" ||
    Boolean(config.tcbEnv)
  );
}

export function validateRuntimeConfig(config = {}) {
  const apiToken = config.apiToken ?? API_TOKEN;
  const nodeEnv = config.nodeEnv ?? process.env.NODE_ENV;
  const ecoGraphEnv = config.ecoGraphEnv ?? process.env.ECO_GRAPH_ENV;
  const deployTarget = config.deployTarget ?? process.env.ECO_GRAPH_DEPLOY_TARGET;
  const tcbEnv = config.tcbEnv ?? process.env.TCB_ENV;
  if (isProductionLike({ nodeEnv, ecoGraphEnv, deployTarget, tcbEnv }) && !apiToken) {
    throw new Error("生产或云托管环境必须设置 ECO_GRAPH_API_TOKEN");
  }
}

function send(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(data, null, 2));
}

async function readBody(req, maxBodyBytes = DEFAULT_MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      const error = new Error("请求体超过允许大小");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** 副驾上下文不可用时的退回态:绝不 500、绝不中断详情,把裁决交还人工。 */
function degradedCopilot() {
  return {
    "上下文门禁": "blocked",
    "降级说明": "图谱上下文暂不可用,已退回人工判断",
    "整体研判": { "就绪度": "warn", "建议方向": null, "一句话": "副驾上下文不可用" },
    "异议": [],
    "补足": {},
  };
}

/**
 * §8.2 P0:详情接口附「副驾研判」(确定性 backbone,离线常开)。
 * 只读现算 —— 图上下文 + 跨企业分布 + 同组判例喂给 buildCopilotBackbone,结果只挂响应,绝不 upsert 回存。
 * 图上下文 / backbone 任何异常 → 退回降级态,绝不 500。
 */
async function computeReviewCopilot({ item, rows, contextGraphPath, contextPublicationPath, now = new Date().toISOString() }) {
  try {
    const { graph, publication } = await loadGraphContextInputs({
      graphPath: contextGraphPath,
      publicationPath: contextPublicationPath,
    });
    const ref = item["问题类型引用"];
    const matched = Boolean(ref) && !/pending|待归一/i.test(ref);
    const graphContext = buildGraphContextResponse({
      graph,
      publication,
      nodeId: matched ? ref : "",
      query: matched ? "" : (item["建议问题类型"] || ""),
      depth: 2,
    });
    const pitfall = buildPitfallBatch(rows);
    const pitfallRows = { rows: pitfall.rows, sample_limited: pitfall.sample_limited };
    const key = groupKey(item);
    // 同组 peers:rows 里已裁决(有审核时间)的同组其它条目,投影成 {审核编号,结论,时间};
    // buildSupplement 会再按 §7 白名单收紧,私有判断字段不随判例透传。
    const peers = rows
      .filter((row) => row["审核编号"] !== item["审核编号"] && row["审核时间"] && groupKey(row) === key)
      .map((row) => ({ "审核编号": row["审核编号"], "结论": row["当前审核状态"], "时间": row["审核时间"] }));
    return buildCopilotBackbone({ item, graphContext, pitfallRows, peers, now });
  } catch (error) {
    return degradedCopilot();
  }
}

export function isAuthorized(headers, token = API_TOKEN, sessionSecret = "") {
  // 企业微信会话优先:cookie 里有有效会话即放行
  if (sessionSecret) {
    const cookies = parseCookies(headers.cookie || "");
    if (verifySession(cookies.eco_graph_session, sessionSecret)) return true;
  }
  if (!token) return !sessionSecret || !isProductionLike({
    nodeEnv: process.env.NODE_ENV,
    ecoGraphEnv: process.env.ECO_GRAPH_ENV,
    deployTarget: process.env.ECO_GRAPH_DEPLOY_TARGET,
    tcbEnv: process.env.TCB_ENV,
  });
  const header = headers.authorization || "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const given = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(token);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

function sessionUserFromHeaders(headers, sessionSecret = "") {
  if (!sessionSecret) return null;
  const cookies = parseCookies(headers.cookie || "");
  return verifySession(cookies.eco_graph_session, sessionSecret);
}

function isApiTokenAuthorized(headers, token = API_TOKEN) {
  if (!token) return !isProductionLike({
    nodeEnv: process.env.NODE_ENV,
    ecoGraphEnv: process.env.ECO_GRAPH_ENV,
    deployTarget: process.env.ECO_GRAPH_DEPLOY_TARGET,
    tcbEnv: process.env.TCB_ENV,
  });
  const header = headers.authorization || "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const given = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(token);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

function isReviewApiPath(pathname) {
  return (
    pathname.startsWith("/api/review/") ||
    pathname === "/api/ecocheck/field-events" ||
    pathname === "/api/aggregate/pitfall-batches"
  );
}

function isReviewAuthorized(headers, token, wecom) {
  if (isApiTokenAuthorized(headers, token)) return true;
  const userid = sessionUserFromHeaders(headers, wecom.sessionSecret);
  return isReviewUser(userid, wecom);
}

function createHandler({
  stagingPath = STAGING_PATH,
  apiToken = API_TOKEN,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  contextGraphPath = DEFAULT_CONTEXT_PATHS.graphPath,
  contextPublicationPath = DEFAULT_CONTEXT_PATHS.publicationPath,
  storage,
  storageOptions,
  wecom = wecomConfigFromEnv(),
  exchangeCode = exchangeWecomCode,
} = {}) {
  validateRuntimeConfig({ apiToken });
  let storagePromise = storage ? Promise.resolve(storage) : null;
  function getStorage() {
    if (!storagePromise) storagePromise = createReviewStorage({ stagingPath, ...storageOptions });
    return storagePromise;
  }
  return async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/healthz") {
      send(res, 200, { status: "pass", service: "graph field review api" });
      return;
    }
    // 企业微信扫码登录:内部/小范围使用,不做手机号或邮箱注册
    if (req.method === "GET" && url.pathname === "/auth/wecom/start") {
      if (!isWecomConfigured(wecom)) {
        send(res, 503, { status: "fail", reason: "企业微信登录未配置,请先设置 ECO_GRAPH_WECOM_* 与 ECO_GRAPH_SESSION_SECRET" });
        return;
      }
      res.writeHead(302, { location: buildWecomLoginUrl(wecom), "cache-control": "no-store" });
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/auth/wecom/callback") {
      if (!isWecomConfigured(wecom)) {
        send(res, 503, { status: "fail", reason: "企业微信登录未配置" });
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        send(res, 400, { status: "fail", reason: "缺少授权 code" });
        return;
      }
      const userid = await exchangeCode(code, wecom);
      if (!isUserAllowed(userid, wecom)) {
        send(res, 403, { status: "fail", reason: "该企业微信账号不在知识库允许名单内" });
        return;
      }
      const token = issueSession(userid, wecom.sessionSecret);
      const canReview = isReviewUser(userid, wecom);
      res.writeHead(302, {
        location: buildWecomAppRedirectUrl(wecom, { canReview }),
        "set-cookie": sessionCookie(token, { secure: req.headers["x-forwarded-proto"] === "https" }),
        "cache-control": "no-store",
      });
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/auth/session") {
      const cookies = parseCookies(req.headers.cookie || "");
      const userid = verifySession(cookies.eco_graph_session, wecom.sessionSecret);
      if (userid) send(res, 200, { status: "pass", userid, login: "wecom", can_review: isReviewUser(userid, wecom) });
      else send(res, 401, { status: "fail", reason: "未登录", wecom_configured: isWecomConfigured(wecom) });
      return;
    }
    if (url.pathname.startsWith("/api/") && !isAuthorized(req.headers, apiToken, wecom.sessionSecret)) {
      send(res, 401, { status: "fail", reason: "请先通过企业微信登录,或提供有效的内部访问令牌" });
      return;
    }
    if (isReviewApiPath(url.pathname) && !isReviewAuthorized(req.headers, apiToken, wecom)) {
      send(res, 403, { status: "fail", reason: "只有 ETO 或 admin 可进入审核台" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/ecocheck/field-events") {
      const payload = await readBody(req, maxBodyBytes);
      const item = normalizeEcoCheckPayload(payload);
      const store = await getStorage();
      await store.upsert(item);
      send(res, 201, { status: "pass", item });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/review/field-events") {
      const store = await getStorage();
      const rows = await store.readAll();
      const status = url.searchParams.get("status");
      const includeNonRuntime = ["1", "true", "yes"].includes(String(url.searchParams.get("include_non_runtime") || "").toLowerCase());
      const queue = filterReviewItemsForRuntime(rows, { includeNonRuntime, status });
      send(res, 200, { status: "pass", ...queue });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/graph/context") {
      const { graph, publication } = await loadGraphContextInputs({
        graphPath: contextGraphPath,
        publicationPath: contextPublicationPath,
      });
      send(res, 200, buildGraphContextResponse({
        graph,
        publication,
        nodeId: url.searchParams.get("node_id") || "",
        query: url.searchParams.get("q") || "",
        industry: url.searchParams.get("industry") || "",
        dimension: url.searchParams.get("dimension") || "",
        depth: url.searchParams.get("depth") || 2,
        limit: url.searchParams.get("limit") || 80,
      }));
      return;
    }
    const detail = url.pathname.match(/^\/api\/review\/field-events\/([^/]+)$/);
    if (detail && req.method === "GET") {
      const store = await getStorage();
      const rows = await store.readAll();
      const item = rows.find((row) => row["审核编号"] === decodeURIComponent(detail[1]));
      if (!item) {
        send(res, 404, { status: "fail", reason: "未找到审核记录" });
        return;
      }
      const copilot = await computeReviewCopilot({ item, rows, contextGraphPath, contextPublicationPath });
      send(res, 200, { status: "pass", item: { ...item, "副驾研判": copilot } });
      return;
    }
    const decision = url.pathname.match(/^\/api\/review\/field-events\/([^/]+)\/decision$/);
    if (decision && req.method === "POST") {
      const store = await getStorage();
      const rows = await store.readAll();
      const index = rows.findIndex((row) => row["审核编号"] === decodeURIComponent(decision[1]));
      if (index < 0) {
        send(res, 404, { status: "fail", reason: "未找到审核记录" });
        return;
      }
      rows[index] = applyReviewDecision(rows[index], await readBody(req, maxBodyBytes));
      await store.upsert(rows[index]);
      send(res, 200, { status: "pass", item: rows[index] });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/aggregate/pitfall-batches") {
      const body = await readBody(req, maxBodyBytes);
      const store = await getStorage();
      const rows = await store.readAll();
      send(res, 200, buildPitfallBatch(rows, body["批次编号"] || body.batch_id));
      return;
    }
    send(res, 404, { status: "fail", reason: "接口不存在" });
  } catch (error) {
    send(res, error.statusCode || 400, { status: "fail", reason: error.message });
  }
  };
}

export function createServer(options = {}) {
  return http.createServer(createHandler(options));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validateRuntimeConfig();
  createServer().listen(PORT, "0.0.0.0", () => {
    console.log(`graph field review api listening on ${PORT}`);
  });
}
