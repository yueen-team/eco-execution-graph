import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyReviewDecision, buildPitfallBatch, normalizeFieldEvent } from "./review-store.js";
import { readJsonl, upsertByReviewId, writeJsonl } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const STAGING_PATH = process.env.ECO_GRAPH_STAGING_PATH || path.join(ROOT, "data", "private-staging", "field-events.jsonl");
const PORT = Number(process.env.PORT || 8787);
const API_TOKEN = process.env.ECO_GRAPH_API_TOKEN || "";
const DEFAULT_MAX_BODY_BYTES = Number(process.env.ECO_GRAPH_MAX_BODY_BYTES || 1024 * 1024);

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

export function isAuthorized(headers, token = API_TOKEN) {
  if (!token) return true;
  const header = headers.authorization || "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const given = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(token);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

function createHandler({ stagingPath = STAGING_PATH, apiToken = API_TOKEN, maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  validateRuntimeConfig({ apiToken });
  return async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/healthz") {
      send(res, 200, { status: "pass", service: "graph field review api" });
      return;
    }
    if (url.pathname.startsWith("/api/") && !isAuthorized(req.headers, apiToken)) {
      send(res, 401, { status: "fail", reason: "缺少或无效的 graph 内部访问令牌" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/ecocheck/field-events") {
      const payload = await readBody(req, maxBodyBytes);
      const item = normalizeFieldEvent(payload);
      await upsertByReviewId(stagingPath, item);
      send(res, 201, { status: "pass", item });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/review/field-events") {
      const rows = await readJsonl(stagingPath);
      const status = url.searchParams.get("status");
      send(res, 200, { status: "pass", items: status ? rows.filter((row) => row["当前审核状态"] === status) : rows });
      return;
    }
    const detail = url.pathname.match(/^\/api\/review\/field-events\/([^/]+)$/);
    if (detail && req.method === "GET") {
      const rows = await readJsonl(stagingPath);
      const item = rows.find((row) => row["审核编号"] === decodeURIComponent(detail[1]));
      if (!item) send(res, 404, { status: "fail", reason: "未找到审核记录" });
      else send(res, 200, { status: "pass", item });
      return;
    }
    const decision = url.pathname.match(/^\/api\/review\/field-events\/([^/]+)\/decision$/);
    if (decision && req.method === "POST") {
      const rows = await readJsonl(stagingPath);
      const index = rows.findIndex((row) => row["审核编号"] === decodeURIComponent(decision[1]));
      if (index < 0) {
        send(res, 404, { status: "fail", reason: "未找到审核记录" });
        return;
      }
      rows[index] = applyReviewDecision(rows[index], await readBody(req, maxBodyBytes));
      await writeJsonl(stagingPath, rows);
      send(res, 200, { status: "pass", item: rows[index] });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/aggregate/pitfall-batches") {
      const body = await readBody(req, maxBodyBytes);
      const rows = await readJsonl(stagingPath);
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
