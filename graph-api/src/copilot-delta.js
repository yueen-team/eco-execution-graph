// ETO 审核副驾「十律」· P2 分歧飞轮(ai_review_delta)
//
// 纯函数 + 独立 staging 存储,零网络、零 LLM,可进 verify:all 离线 lane。
// 战略意图(docs/api/eto-review-copilot.md §10):把「副驾建议 vs ETO 终判」的每一次分歧
// 落成一等专家经验候选 ai_review_delta,再算「副驾-ETO 一致率」,作为「会学习的专家系统」硬证据。
//
// 四条铁律 / 硬门禁守则(§3 / §11 / AGENTS.md 硬门禁 #4):
//   - 不自动晋级:delta 默认 review_status="candidate",绝不自动写 approved,等人工治理。
//   - advisory:delta 只是治理候选,永不写回 approved 图、永不替 ETO 裁决。
//   - 私有零泄漏:只取脱敏白名单字段(区域/行业/环保维度=聚合维度键,非企业可识别信息),
//     绝不 spread 原始 item(避免带出企业名快照 / 现场摘要 / 私有判断标准);返回前过 assertRedlineClean。
//   - 独立存储:写 data/private-staging/ai-review-deltas.jsonl(append-only),
//     不进 review storage、不进 python 管理的 governance-candidates.json(避免与 knowledge_governance.py 重生成冲突)。

import fs from "node:fs/promises";
import path from "node:path";
import { assertRedlineClean } from "./graph-context.js";
import { readJsonl } from "./storage.js";

export const DELTA_TYPE = "ai_review_delta";

// ETO 审核结论文本 → review.js ACTIONS kind(与 graph-ui/src/review.js ACTIONS 同口径)。
const DECISION_KIND = {
  "通过，进入聚合候选": "approve",
  "合并到已有问题类型": "merge",
  "仅保留内部案例": "internal",
  "退回补充": "return",
  "不入图": "reject",
};

// 合法的副驾建议方向枚举(= ACTIONS kind 全集)。副驾回执的「副驾建议方向」必须命中其一,否则回落 null,
// 使 ai_review_delta 成纯机器码不变量(防越权客户端借此字段注入自由文本进治理候选)。
const ACTION_KINDS = new Set(Object.values(DECISION_KIND));

// §4 错配分类法里严重度恒为 blocking 的错配码(管理经验被法律化 = 最高危;法条状态风险 = 拦截级)。
// 「任一 blocking 异议被 ETO 驳回」即视为分歧(守门人拦截被否决,是最该沉淀的专家经验)。
const BLOCKING_CODES = new Set([
  "management_advice_miscast_as_law",
  "law_status_risk",
]);

// 十律已知错配码全集(确定性 backbone + LLM critic)。副驾回执只允许携带这些机器码;
// 防御纵深:未知码静默丢弃,使「副驾回执纯机器码」由代码强制为不变量,而非依赖客户端守规矩
// (一个有 bug/越权的 ETO/admin 客户端不能借回执把私有自由文本注入 ai_review_delta)。
const KNOWN_MISMATCH_CODES = new Set([
  // 确定性 backbone(review-copilot.js)
  "management_advice_miscast_as_law",
  "law_status_risk",
  "missing_law_locator",
  "evidence_insufficient",
  "aggregation_risk",
  "confidence_stale",
  "pitfall_candidate",
  "no_law_basis_advisory",
  "basis_requires_official_confirmation",
  "candidate_or_disputed_basis",
  // LLM critic(copilot-llm.js)
  "issue_type_mismatch",
  "law_not_applicable",
  "duplicate_mergeable",
]);

/** ETO 审核结论文本 → 终判 kind;未知文本回落 null(不强行映射)。 */
export function decisionKind(decisionText) {
  return DECISION_KIND[String(decisionText ?? "").trim()] || null;
}

function asCodeList(value) {
  if (!Array.isArray(value)) return [];
  // 只保留十律已知错配码:未知码(含任何被注入的自由文本)静默丢弃,强制「纯机器码」不变量。
  return value.map((code) => String(code ?? "").trim()).filter((code) => KNOWN_MISMATCH_CODES.has(code));
}

function realIssueRef(item) {
  const ref = item?.["问题类型引用"];
  return ref && !/pending|待归一/i.test(ref) ? ref : null;
}

/**
 * 产 ai_review_delta 治理候选对象(脱敏白名单投影,绝不 spread 原始 item)。
 *
 * @param item       已脱敏入图的 review item(只读取白名单字段)。
 * @param 副驾回执   { 副驾建议方向, 采纳异议码[], 驳回异议码[] };副驾建议方向 对齐 ACTIONS kind 或 null。
 * @param 终判       ETO 最终审核结论 kind(approve/merge/internal/return/reject 或 null)。
 * @param now        生成时间。
 * @returns          ai_review_delta 候选对象,review_status 恒为 "candidate"(绝不自动晋级 approved)。
 */
export function buildAiReviewDelta({ item, 副驾回执 = {}, 终判 = null, now = new Date().toISOString() } = {}) {
  // 防注入:副驾建议方向 只允许 ACTIONS kind 枚举,未命中回落 null(与采纳/驳回异议码白名单同口径)。
  const rawDirection = 副驾回执?.["副驾建议方向"];
  const 副驾建议方向 = ACTION_KINDS.has(rawDirection) ? rawDirection : null;
  const 采纳异议码 = asCodeList(副驾回执?.["采纳异议码"]);
  const 驳回异议码 = asCodeList(副驾回执?.["驳回异议码"]);

  // 分歧判定:副驾给出明确建议方向且 ≠ 终判,或任一 blocking 异议被 ETO 驳回。
  const directionDivergence = Boolean(副驾建议方向) && 副驾建议方向 !== 终判;
  const blockingRejected = 驳回异议码.some((code) => BLOCKING_CODES.has(code));
  const 是否分歧 = directionDivergence || blockingRejected;

  const issueRef = realIssueRef(item);
  const sourceRef = item?.["技术追溯"]?.["来源记录编号"] || null;

  const delta = {
    "类型": DELTA_TYPE,
    // 守 AGENTS 硬门禁 #4:默认 candidate,绝不自动晋级 approved,等人工治理。
    "review_status": "candidate",
    "审核编号": item?.["审核编号"] ?? null,
    // 脱敏维度键(聚合口径,与 buildPitfallBatch rows 同源,不含企业可识别信息)。
    "问题类型引用": issueRef,
    "区域": item?.["区域"] ?? null,
    "行业": item?.["行业"] ?? null,
    "环保维度": item?.["环保维度"] ?? null,
    "副驾建议方向": 副驾建议方向 ?? null,
    "ETO终判": 终判 ?? null,
    "采纳异议码": 采纳异议码,
    "驳回异议码": 驳回异议码,
    "是否分歧": 是否分歧,
    "生成时间": now,
    "source_ref": sourceRef,
    "trace": {
      node_ids: issueRef ? [issueRef] : [],
      edge_ids: [],
      source_refs: sourceRef ? [sourceRef] : [],
    },
  };

  // 私有零泄漏闸:与 /api/graph/context、副驾意见同一道扫描,命中即抛,绝不输出泄漏。
  assertRedlineClean(delta);
  return delta;
}

/**
 * 从 ai_review_delta 记录算「副驾-ETO 一致率」(政府演示「会学习的专家系统」硬证据)。
 * 一致率 = 1 - 分歧数 / 总数;总数为 0 时一致率为 null(无样本不臆造 100%)。
 * @returns { 总数, 分歧数, 一致数, 一致率, 按维度 }
 */
export function computeAgreementRate(deltas) {
  const rows = Array.isArray(deltas) ? deltas : [];
  // 按 审核编号 去重(latest-wins):同一条 review 多次表态只算最新一条,杜绝重复裁决单向刷高一致率。
  const latest = new Map();
  const noId = [];
  for (const row of rows) {
    const id = row?.["审核编号"];
    if (id) latest.set(id, row);
    else noId.push(row);
  }
  const deduped = [...latest.values(), ...noId];
  // 只统计 是否分歧 为严格布尔的行;非布尔/缺失行进「未知」桶,绝不静默并入一致(防误差单向偏向更高一致率)。
  const valid = deduped.filter((row) => typeof row?.["是否分歧"] === "boolean");
  const 未知 = deduped.length - valid.length;
  const 总数 = valid.length;
  const 分歧数 = valid.filter((row) => row["是否分歧"] === true).length;
  const 一致数 = 总数 - 分歧数;
  const 一致率 = 总数 ? Number((1 - 分歧数 / 总数).toFixed(4)) : null;

  const byDimension = new Map();
  for (const row of valid) {
    const dim = row["环保维度"] || "未标注维度";
    if (!byDimension.has(dim)) byDimension.set(dim, { 总数: 0, 分歧数: 0 });
    const bucket = byDimension.get(dim);
    bucket.总数 += 1;
    if (row["是否分歧"] === true) bucket.分歧数 += 1;
  }
  const 按维度 = {};
  for (const [dim, bucket] of byDimension) {
    按维度[dim] = {
      "总数": bucket.总数,
      "分歧数": bucket.分歧数,
      "一致数": bucket.总数 - bucket.分歧数,
      "一致率": bucket.总数 ? Number((1 - bucket.分歧数 / bucket.总数).toFixed(4)) : null,
    };
  }

  return { "总数": 总数, "分歧数": 分歧数, "一致数": 一致数, "一致率": 一致率, "未知": 未知, "按维度": 按维度 };
}

/** ai_review_delta 独立 staging 路径(与 field-events.jsonl 同口径,运行时产生,按既有 gitignore 处理)。 */
export function deltaStagingPath(root, env = process.env) {
  return env.ECO_GRAPH_DELTA_STAGING_PATH || path.join(root, "data", "private-staging", "ai-review-deltas.jsonl");
}

/** append-only 落库:仿 field-events staging 的 JSONL 模式,只追加不重写,避免并发覆盖既有分歧资产。 */
export async function appendAiReviewDelta(filePath, delta) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(delta)}\n`, "utf8");
  return delta;
}

/** 读全部 ai_review_delta 记录(供一致率指标 / 治理消费)。文件不存在回 []。 */
export async function readAllAiReviewDeltas(filePath) {
  return readJsonl(filePath);
}
