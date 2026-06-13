import fs from "node:fs/promises";
import path from "node:path";

const MYSQL_DRIVER = "mysql";
const JSONL_DRIVER = "jsonl";

export async function readJsonl(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function writeJsonl(filePath, rows) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  await fs.writeFile(filePath, body ? `${body}\n` : "", "utf8");
}

export async function upsertByReviewId(filePath, item) {
  const rows = await readJsonl(filePath);
  const index = rows.findIndex((row) => row["审核编号"] === item["审核编号"]);
  if (index >= 0) rows[index] = item;
  else rows.push(item);
  await writeJsonl(filePath, rows);
  return item;
}

export function storageConfigFromEnv(env = process.env) {
  const explicitDriver = String(env.ECO_GRAPH_STORAGE_DRIVER || "").trim().toLowerCase();
  const driver = explicitDriver || (env.ECO_GRAPH_MYSQL_HOST ? MYSQL_DRIVER : JSONL_DRIVER);
  return {
    driver,
    stagingPath: env.ECO_GRAPH_STAGING_PATH,
    mysql: {
      host: env.ECO_GRAPH_MYSQL_HOST,
      port: Number(env.ECO_GRAPH_MYSQL_PORT || 3306),
      user: env.ECO_GRAPH_MYSQL_USER,
      password: env.ECO_GRAPH_MYSQL_PASSWORD,
      database: env.ECO_GRAPH_MYSQL_DATABASE,
      table: env.ECO_GRAPH_MYSQL_TABLE || "eco_graph_field_event_reviews",
      ssl: env.ECO_GRAPH_MYSQL_SSL === "true" || env.ECO_GRAPH_MYSQL_SSL === "1",
      connectionLimit: Number(env.ECO_GRAPH_MYSQL_CONNECTION_LIMIT || 5),
    },
  };
}

function jsonlStorage(filePath) {
  return {
    driver: JSONL_DRIVER,
    async init() {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
    },
    async readAll() {
      return readJsonl(filePath);
    },
    async upsert(item) {
      return upsertByReviewId(filePath, item);
    },
    async writeAll(rows) {
      return writeJsonl(filePath, rows);
    },
    async delete(reviewId) {
      const rows = await readJsonl(filePath);
      const next = rows.filter((row) => row["审核编号"] !== reviewId);
      await writeJsonl(filePath, next);
      return rows.length - next.length;
    },
    async close() {},
  };
}

export async function createReviewStorage(options = {}) {
  const envConfig = storageConfigFromEnv(options.env);
  const driver = options.driver || envConfig.driver;
  if (driver === MYSQL_DRIVER) {
    const { createMysqlReviewStorage } = await import("./mysql-storage.js");
    return createMysqlReviewStorage(options.mysql || envConfig.mysql);
  }
  if (driver && driver !== JSONL_DRIVER) {
    throw new Error(`未知审核存储类型:${driver}`);
  }
  const filePath = options.stagingPath || envConfig.stagingPath;
  if (!filePath) throw new Error("缺少 ECO_GRAPH_STAGING_PATH");
  return jsonlStorage(filePath);
}
