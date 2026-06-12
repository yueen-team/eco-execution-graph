import http from "node:http";
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

function send(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(data, null, 2));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function isAuthorized(headers, token = API_TOKEN) {
  if (!token) return true;
  return headers.authorization === `Bearer ${token}`;
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (req.method === "GET" && url.pathname === "/healthz") {
      send(res, 200, { status: "pass", service: "graph field review api" });
      return;
    }
    if (url.pathname.startsWith("/api/") && !isAuthorized(req.headers)) {
      send(res, 401, { status: "fail", reason: "缺少或无效的 graph 内部访问令牌" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/ecocheck/field-events") {
      const payload = await readBody(req);
      const item = normalizeFieldEvent(payload);
      await upsertByReviewId(STAGING_PATH, item);
      send(res, 201, { status: "pass", item });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/review/field-events") {
      const rows = await readJsonl(STAGING_PATH);
      const status = url.searchParams.get("status");
      send(res, 200, { status: "pass", items: status ? rows.filter((row) => row["当前审核状态"] === status) : rows });
      return;
    }
    const detail = url.pathname.match(/^\/api\/review\/field-events\/([^/]+)$/);
    if (detail && req.method === "GET") {
      const rows = await readJsonl(STAGING_PATH);
      const item = rows.find((row) => row["审核编号"] === decodeURIComponent(detail[1]));
      if (!item) send(res, 404, { status: "fail", reason: "未找到审核记录" });
      else send(res, 200, { status: "pass", item });
      return;
    }
    const decision = url.pathname.match(/^\/api\/review\/field-events\/([^/]+)\/decision$/);
    if (decision && req.method === "POST") {
      const rows = await readJsonl(STAGING_PATH);
      const index = rows.findIndex((row) => row["审核编号"] === decodeURIComponent(decision[1]));
      if (index < 0) {
        send(res, 404, { status: "fail", reason: "未找到审核记录" });
        return;
      }
      rows[index] = applyReviewDecision(rows[index], await readBody(req));
      await writeJsonl(STAGING_PATH, rows);
      send(res, 200, { status: "pass", item: rows[index] });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/aggregate/pitfall-batches") {
      const body = await readBody(req);
      const rows = await readJsonl(STAGING_PATH);
      send(res, 200, buildPitfallBatch(rows, body["批次编号"] || body.batch_id));
      return;
    }
    send(res, 404, { status: "fail", reason: "接口不存在" });
  } catch (error) {
    send(res, 400, { status: "fail", reason: error.message });
  }
}

export function createServer() {
  return http.createServer(handler);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, "0.0.0.0", () => {
    console.log(`graph field review api listening on ${PORT}`);
  });
}
