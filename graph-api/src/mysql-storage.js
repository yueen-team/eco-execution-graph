import mysql from "mysql2/promise";

const REQUIRED_COLUMNS = [
  ["review_id", "VARCHAR(96) NOT NULL COMMENT '审核编号'"],
  ["event_id", "VARCHAR(180) NOT NULL COMMENT '事件编号'"],
  ["current_status", "VARCHAR(48) NOT NULL COMMENT '当前审核状态'"],
  ["aggregate_allowed", "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许进入聚合'"],
  ["source_system", "VARCHAR(80) DEFAULT NULL COMMENT '来源系统'"],
  ["source_stage", "VARCHAR(80) DEFAULT NULL COMMENT '来源阶段'"],
  ["company_internal_id", "VARCHAR(180) DEFAULT NULL COMMENT '企业内部标识,仅内部审核使用'"],
  ["company_name_snapshot", "VARCHAR(255) DEFAULT NULL COMMENT '企业名称快照,仅内部审核使用'"],
  ["region", "VARCHAR(160) DEFAULT NULL COMMENT '区域'"],
  ["industry", "VARCHAR(180) DEFAULT NULL COMMENT '行业'"],
  ["dimension_name", "VARCHAR(180) DEFAULT NULL COMMENT '环保维度'"],
  ["issue_type_ref", "VARCHAR(255) DEFAULT NULL COMMENT '问题类型引用'"],
  ["payload_json", "JSON NOT NULL COMMENT '完整中文审核记录'"],
  ["created_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'"],
  ["updated_at", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'"],
];

const INDEXES = [
  ["idx_current_status", "current_status"],
  ["idx_aggregate_allowed", "aggregate_allowed"],
  ["idx_event_id", "event_id"],
  ["idx_region_industry_dimension", "region, industry, dimension_name"],
];

function assertIdentifier(value, label) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9_]+$/.test(text)) throw new Error(`${label} 只能包含字母、数字和下划线`);
  return text;
}

function q(identifier) {
  return `\`${assertIdentifier(identifier, "数据库标识符")}\``;
}

function requireText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`缺少 ${label}`);
  return text;
}

function mysqlConfig(config = {}) {
  return {
    host: requireText(config.host, "ECO_GRAPH_MYSQL_HOST"),
    port: Number(config.port || 3306),
    user: requireText(config.user, "ECO_GRAPH_MYSQL_USER"),
    password: requireText(config.password, "ECO_GRAPH_MYSQL_PASSWORD"),
    database: requireText(config.database, "ECO_GRAPH_MYSQL_DATABASE"),
    table: assertIdentifier(config.table || "eco_graph_field_event_reviews", "ECO_GRAPH_MYSQL_TABLE"),
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: Number(config.connectionLimit || 5),
  };
}

function poolConfig(config) {
  const { table, ...rest } = config;
  return rest;
}

function bootstrapPoolConfig(config) {
  const { database, table, ...rest } = config;
  return rest;
}

function columnValues(item) {
  return {
    review_id: item["审核编号"],
    event_id: item["事件编号"],
    current_status: item["当前审核状态"],
    aggregate_allowed: item["是否允许进入聚合"] === true ? 1 : 0,
    source_system: item["来源系统"] || null,
    source_stage: item["来源阶段"] || null,
    company_internal_id: item["企业内部标识"] || null,
    company_name_snapshot: item["企业名称快照"] || null,
    region: item["区域"] || null,
    industry: item["行业"] || null,
    dimension_name: item["环保维度"] || null,
    issue_type_ref: item["合并目标问题类型"] || item["问题类型引用"] || null,
    payload_json: JSON.stringify(item),
  };
}

function parsePayload(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  return JSON.parse(String(raw));
}

async function queryRows(pool, sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function ensureColumns(pool, database, table) {
  const rows = await queryRows(
    pool,
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [database, table]
  );
  const existing = new Set(rows.map((row) => row.COLUMN_NAME));
  for (const [name, definition] of REQUIRED_COLUMNS) {
    if (existing.has(name)) continue;
    await pool.execute(`ALTER TABLE ${q(table)} ADD COLUMN ${q(name)} ${definition}`);
  }
}

async function ensureIndexes(pool, database, table) {
  const rows = await queryRows(
    pool,
    `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [database, table]
  );
  const existing = new Set(rows.map((row) => row.INDEX_NAME));
  for (const [name, columns] of INDEXES) {
    if (existing.has(name)) continue;
    await pool.execute(`CREATE INDEX ${q(name)} ON ${q(table)} (${columns})`);
  }
}

export async function ensureMysqlSchema(pool, config) {
  const table = config.table;
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS ${q(table)} (
      review_id VARCHAR(96) NOT NULL COMMENT '审核编号',
      event_id VARCHAR(180) NOT NULL COMMENT '事件编号',
      current_status VARCHAR(48) NOT NULL COMMENT '当前审核状态',
      aggregate_allowed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许进入聚合',
      source_system VARCHAR(80) DEFAULT NULL COMMENT '来源系统',
      source_stage VARCHAR(80) DEFAULT NULL COMMENT '来源阶段',
      company_internal_id VARCHAR(180) DEFAULT NULL COMMENT '企业内部标识,仅内部审核使用',
      company_name_snapshot VARCHAR(255) DEFAULT NULL COMMENT '企业名称快照,仅内部审核使用',
      region VARCHAR(160) DEFAULT NULL COMMENT '区域',
      industry VARCHAR(180) DEFAULT NULL COMMENT '行业',
      dimension_name VARCHAR(180) DEFAULT NULL COMMENT '环保维度',
      issue_type_ref VARCHAR(255) DEFAULT NULL COMMENT '问题类型引用',
      payload_json JSON NOT NULL COMMENT '完整中文审核记录',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
      PRIMARY KEY (review_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='EcoCheck现场经验入图审核记录'`
  );
  await ensureColumns(pool, config.database, table);
  await ensureIndexes(pool, config.database, table);
}

export function createMysqlReviewStorage(rawConfig = {}) {
  const config = mysqlConfig(rawConfig);
  const database = assertIdentifier(config.database, "ECO_GRAPH_MYSQL_DATABASE");
  const pool = mysql.createPool(poolConfig(config));
  let initialized = false;

  async function init() {
    if (initialized) return;
    const bootstrap = mysql.createPool(bootstrapPoolConfig(config));
    try {
      await bootstrap.execute(
        `CREATE DATABASE IF NOT EXISTS ${q(database)} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } finally {
      await bootstrap.end();
    }
    await ensureMysqlSchema(pool, config);
    initialized = true;
  }

  async function readAll() {
    await init();
    const rows = await queryRows(pool, `SELECT payload_json FROM ${q(config.table)} ORDER BY updated_at DESC, created_at DESC`);
    return rows.map((row) => parsePayload(row.payload_json)).filter(Boolean);
  }

  async function upsert(item) {
    await init();
    const values = columnValues(item);
    await pool.execute(
      `INSERT INTO ${q(config.table)} (
        review_id, event_id, current_status, aggregate_allowed,
        source_system, source_stage, company_internal_id, company_name_snapshot,
        region, industry, dimension_name, issue_type_ref, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        event_id = VALUES(event_id),
        current_status = VALUES(current_status),
        aggregate_allowed = VALUES(aggregate_allowed),
        source_system = VALUES(source_system),
        source_stage = VALUES(source_stage),
        company_internal_id = VALUES(company_internal_id),
        company_name_snapshot = VALUES(company_name_snapshot),
        region = VALUES(region),
        industry = VALUES(industry),
        dimension_name = VALUES(dimension_name),
        issue_type_ref = VALUES(issue_type_ref),
        payload_json = VALUES(payload_json),
        updated_at = CURRENT_TIMESTAMP`,
      [
        values.review_id,
        values.event_id,
        values.current_status,
        values.aggregate_allowed,
        values.source_system,
        values.source_stage,
        values.company_internal_id,
        values.company_name_snapshot,
        values.region,
        values.industry,
        values.dimension_name,
        values.issue_type_ref,
        values.payload_json,
      ]
    );
    return item;
  }

  async function writeAll(rows) {
    await init();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(`DELETE FROM ${q(config.table)}`);
      for (const row of rows) {
        const values = columnValues(row);
        await connection.execute(
          `INSERT INTO ${q(config.table)} (
            review_id, event_id, current_status, aggregate_allowed,
            source_system, source_stage, company_internal_id, company_name_snapshot,
            region, industry, dimension_name, issue_type_ref, payload_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            values.review_id,
            values.event_id,
            values.current_status,
            values.aggregate_allowed,
            values.source_system,
            values.source_stage,
            values.company_internal_id,
            values.company_name_snapshot,
            values.region,
            values.industry,
            values.dimension_name,
            values.issue_type_ref,
            values.payload_json,
          ]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function deleteByReviewId(reviewId) {
    await init();
    const [result] = await pool.execute(`DELETE FROM ${q(config.table)} WHERE review_id = ?`, [reviewId]);
    return result.affectedRows || 0;
  }

  return {
    driver: "mysql",
    init,
    readAll,
    upsert,
    writeAll,
    delete: deleteByReviewId,
    async close() {
      await pool.end();
    },
  };
}
