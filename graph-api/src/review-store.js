import crypto from "node:crypto";

export const REVIEW_STATUS = {
  waiting: "待审核",
  approved: "已通过(待聚合)",
  returned: "退回补充",
  rejected: "不入图",
  internalOnly: "仅保留内部案例",
  aggregateReady: "已进入聚合候选",
  sampleLimited: "样本不足",
};

export const DECISIONS = new Set([
  "通过，进入聚合候选",
  "仅保留内部案例",
  "退回补充",
  "合并到已有问题类型",
  "不入图",
]);

const STAGE_LABEL = {
  ISSUE_ETO_REVIEWED: "排查审核确认",
  HEALTH_REPORT_ITEM_CONFIRMED: "报告事实确认",
  RECTIFICATION_VERIFIED: "整改验收通过",
  RECTIFICATION_REJECTED: "整改验收驳回",
};

const FORBIDDEN_KEYS = new Set([
  "full_text",
  "law_full_text",
  "raw_law_text",
  "content",
  "attachment_url",
  "attachment_path",
  "cloud_path",
  "photo_url",
  "gps",
  "latitude",
  "longitude",
  "original_report_text",
  "secretid",
  "secretkey",
  "api_key",
  "token",
  "authorization",
]);

const FORBIDDEN_VALUE_PATTERNS = [
  /SecretId/i,
  /SecretKey/i,
  /BEGIN PRIVATE KEY/i,
  /\bAKID[A-Za-z0-9]{8,}/,
  /https?:\/\/[^\s"]*(myqcloud|cos|attachment|evidence|photo)/i,
  /经度|纬度|GPS/i,
  /本法全文|全文如下|第一条.{20,}第二条/s,
];

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value, fallback = "未提供") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function issueTypeRef(item) {
  return item["合并目标问题类型"] || item["问题类型引用"];
}

function firstText(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return text(value);
  }
  return "未提供";
}

function fieldValue(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).join("、");
  if (value && typeof value === "object") return text(value.value || value.name || value.title, "待核对");
  return text(value, "待补充");
}

function normalizeCompletionEntry(item) {
  if (!item || typeof item !== "object") {
    return { "字段": text(item, "待核对"), "状态": "待核对", "值": "待补充", "补充动作": "ETO确认" };
  }
  return {
    "字段": text(item.field || item["字段"], "待核对字段"),
    "状态": text(item.status || item["状态"], "待核对"),
    "值": fieldValue(item.value ?? item["值"]),
    "补充动作": text(item.missing_action || item["补充动作"], "ETO确认或修改"),
    "置信度": item.confidence === null || item.confidence === undefined ? null : Number(item.confidence),
  };
}

function normalizeFieldCompletion(raw) {
  const completion = raw && typeof raw === "object" ? raw : {};
  return {
    "必补字段": asArray(completion.required_fields || completion["必补字段"]).map(normalizeCompletionEntry),
    "可候选字段": asArray(completion.candidate_fields || completion["可候选字段"]).map(normalizeCompletionEntry),
    "不强行补字段": asArray(completion.not_forced_fields || completion["不强行补字段"]).map((item) => ({
      "字段": text(item?.field || item?.["字段"] || item, "待核对字段"),
      "状态": text(item?.status || item?.["状态"], "不回填"),
      "原因": text(item?.reason || item?.["原因"], "机器无法可靠推出"),
    })),
    "摘要": text(completion.summary?.review_policy || completion["摘要"], "按必补、可候选、不强行补三类进入 ETO 审核"),
  };
}

function normalizeMachineFill(raw) {
  return asArray(raw).map((item) => ({
    "字段": text(item?.field || item?.["字段"], "待核对字段"),
    "方法": text(item?.method || item?.source_method || item?.["方法"], "历史记录机器补填"),
    "置信度": item?.confidence === null || item?.confidence === undefined ? null : Number(item.confidence),
  }));
}

function normalizeRectificationHistory(raw) {
  const history = raw && typeof raw === "object" ? raw : {};
  return {
    "任务状态": text(history.task_status || history["任务状态"], "未形成整改任务"),
    "总记录数": Number(history.total_records || history["总记录数"] || 0),
    "最新轮次": history.latest_round || history["最新轮次"] || null,
    "最新状态": text(history.latest_status || history["最新状态"], "未形成闭环"),
    "通过次数": Number(history.verified_count || history["通过次数"] || 0),
    "驳回次数": Number(history.rejected_count || history["驳回次数"] || 0),
    "整改提交摘要": text(history.latest_submit_note_summary || history["整改提交摘要"], "未提供"),
    "ETO审核意见摘要": text(history.eto_review_note_summary || history["ETO审核意见摘要"], "未提供"),
    "整改要求摘要": text(history.requirement_summary || history["整改要求摘要"], "未提供"),
    "复查要点摘要": text(history.recheck_points_summary || history["复查要点摘要"], "未提供"),
  };
}

function normalizeBackfillContext(raw) {
  const context = raw && typeof raw === "object" ? raw : {};
  const period = context.source_period || {};
  const kind = context.source_kind === "historical_archive" ? "历史回档" : context.source_kind;
  return {
    "批次编号": text(context.batch_id, "非回档批次"),
    "来源期间": `${text(period.from, "未标注")} 至 ${text(period.to, "未标注")}`,
    "来源类型": text(kind, "现场事件"),
  };
}

function scanForbidden(value, path = "$", violations = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbidden(item, `${path}[${index}]`, violations));
    return violations;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) violations.push(`${path}.${key}`);
      scanForbidden(item, `${path}.${key}`, violations);
    }
    return violations;
  }
  if (typeof value === "string") {
    for (const pattern of FORBIDDEN_VALUE_PATTERNS) {
      if (pattern.test(value)) violations.push(path);
    }
  }
  return violations;
}

export function assertAcceptableFieldEvent(payload) {
  if (!payload || typeof payload !== "object") throw new Error("请求体必须是对象");
  if (payload.schema_version !== "ecocheck.semantic_event.v2") throw new Error("只接收 EcoCheck semantic_event v2");
  const eventId = payload.field_issue_uid || payload.event_id || payload.business_key;
  if (!eventId) throw new Error("缺少现场问题追溯编号");
  const violations = [...new Set(scanForbidden(payload))];
  if (violations.length) throw new Error(`包含不得进入 graph 的敏感或原始字段:${violations.join(",")}`);
}

export function normalizeFieldEvent(payload, now = new Date().toISOString()) {
  assertAcceptableFieldEvent(payload);
  const trace = payload.trace_ref || {};
  const source = { ...trace, ...(payload.source_context || {}) };
  const issue = payload.standard_issue_type_candidate || {};
  const dimension = payload.environmental_risk_category || {};
  const evidence = payload.evidence_chain || {};
  const traceEvidence = trace.evidence_summary || {};
  const rectification = payload.rectification || {};
  const history = normalizeRectificationHistory(payload.rectification_history_summary);
  const eventRef = text(payload.field_issue_uid || payload.event_id || payload.business_key, "unknown");
  const lawRefs = asArray(payload.ai_regulatory_references).map((item) => ({
    "引用编号": text(item.ref || item.node_id || item.id, "待核对"),
    "名称": text(item.title || item.name, "待核对"),
  }));
  const sourceTags = asArray(payload.source_tags).map((item) => text(item)).filter(Boolean);
  const completion = normalizeFieldCompletion(payload.field_completion);

  return {
    "审核编号": `review:${hash(eventRef)}`,
    "事件编号": eventRef,
    "来源系统": text(payload.source_system, "EcoCheck"),
    "来源阶段": STAGE_LABEL[payload.event_type] || "现场事实确认",
    "来源时间": text(payload.occurred_at, now),
    "企业内部标识": text(source.company_id || source.enterprise_ref, "synthetic-or-internal"),
    "企业名称快照": text(source.company_name, "合成企业"),
    "区域": text(source.region, "未标注区域"),
    "行业": text(source.industry_type || source.industry, "未标注行业"),
    "排污许可类型": text(source.permit_type, "未标注许可类型"),
    "检查月份": text(source.report_month, "未标注月份"),
    "检查日期": text(source.inspection_date, "未标注日期"),
    "环保维度": text(dimension.dimension || dimension.name, "未标注维度"),
    "建议问题类型": text(issue.name || issue.issue_type_name, "待归一问题类型"),
    "问题类型引用": text(issue.issue_type_ref || issue.node_id, "issue:pending"),
    "现场问题摘要": firstText(payload.field_fact?.problem_raw, payload.risk_impact_summary, payload.field_fact?.summary, payload.problem_summary),
    "现场表现": asArray(payload.observed_signals).map((item) => text(item)),
    "证据摘要": {
      "证据数量": Number(evidence.evidence_count || source.evidence_count || traceEvidence.count || 0),
      "证据类型": asArray(evidence.evidence_types || source.evidence_types || traceEvidence.types).map((item) => text(item)),
    },
    "整改要求": text(rectification.requirement || payload.human_review_baseline_requirement, "待补充整改要求"),
    "复查要点": asArray(payload.recheck_points || rectification.recheck_points || history["复查要点摘要"]).map((item) => text(item)),
    "整改结果": text(rectification.status || history["最新状态"] || payload.outcome?.status, "未形成闭环"),
    "法条规范候选": lawRefs,
    "信源标签": sourceTags,
    "回档批次": normalizeBackfillContext(payload.backfill_context),
    "字段补齐状态": completion,
    "机器补填说明": normalizeMachineFill(payload.machine_fill_provenance),
    "整改历史摘要": history,
    "当前审核状态": REVIEW_STATUS.waiting,
    "审核人": null,
    "审核时间": null,
    "审核意见": "",
    "是否允许进入聚合": false,
    "进入聚合候选时间": null,
    "合并目标问题类型": "",
    "技术追溯": {
      "来源记录编号": `src:${hash(payload.business_key || payload.source_id || eventRef)}`,
      "事件编号": eventRef,
      "同步时间": now,
      "原始系统": text(payload.source_system, "EcoCheck"),
    },
  };
}

export function applyReviewDecision(item, decision, now = new Date().toISOString()) {
  const decisionText = decision?.["审核结论"] || decision?.decision;
  if (!DECISIONS.has(decisionText)) throw new Error("审核结论不在允许范围内");
  const reviewer = text(decision?.["审核人"] || decision?.reviewer, "ETO");
  const comment = text(decision?.["审核意见"] || decision?.comment, "");
  const next = structuredClone(item);
  next["审核人"] = reviewer;
  next["审核时间"] = now;
  next["审核意见"] = comment;
  next["是否允许进入聚合"] = false;
  next["进入聚合候选时间"] = null;

  if (decisionText === "通过，进入聚合候选") {
    next["当前审核状态"] = REVIEW_STATUS.approved;
    next["是否允许进入聚合"] = true;
    next["进入聚合候选时间"] = now;
  } else if (decisionText === "合并到已有问题类型") {
    const mergeTarget = text(decision?.["合并目标问题类型"], "");
    if (!mergeTarget) throw new Error("合并到已有问题类型时必须填写合并目标问题类型");
    next["当前审核状态"] = REVIEW_STATUS.aggregateReady;
    next["是否允许进入聚合"] = true;
    next["进入聚合候选时间"] = now;
    next["合并目标问题类型"] = mergeTarget;
  } else if (decisionText === "仅保留内部案例") {
    next["当前审核状态"] = REVIEW_STATUS.internalOnly;
  } else if (decisionText === "退回补充") {
    next["当前审核状态"] = REVIEW_STATUS.returned;
  } else if (decisionText === "不入图") {
    next["当前审核状态"] = REVIEW_STATUS.rejected;
  }
  return next;
}

function groupKey(item) {
  const law = item["法条规范候选"]?.[0]?.["引用编号"] || "law-or-spec:pending";
  return [
    item["区域"],
    item["行业"],
    item["环保维度"],
    issueTypeRef(item),
    law,
  ].join("|");
}

function difficulty(items) {
  const rejected = items.filter((item) => item["整改结果"]?.includes("驳回")).length;
  const rate = items.length ? rejected / items.length : 0;
  if (rate >= 0.3) return "high";
  if (rate >= 0.1) return "medium";
  return "low";
}

export function buildPitfallBatch(items, batchId = "pitfall-map:review-preview") {
  const groups = new Map();
  for (const item of items) {
    if (!new Set([REVIEW_STATUS.approved, REVIEW_STATUS.aggregateReady]).has(item["当前审核状态"]) || item["是否允许进入聚合"] !== true) continue;
    const key = groupKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const rows = [];
  const sampleLimited = [];
  for (const [key, group] of groups) {
    const [region, industry, dimension, issueRef, lawRef] = key.split("|");
    const companyCount = new Set(group.map((item) => item["企业内部标识"])).size;
    const record = {
      region,
      industry,
      dimension,
      issue_type_ref: issueRef,
      law_or_spec_ref: lawRef,
      sample_size: companyCount,
      event_count: group.length,
      recurrence_rate: Number((group.length / Math.max(companyCount, 1)).toFixed(2)),
      rectification_difficulty: difficulty(group),
      eto_reviewed_count: group.length,
      last_verified_at: group.map((item) => item["审核时间"] || item["来源时间"]).sort().at(-1),
      source_ref: `src:ecocheck-aggregate:${batchId}`,
      batch_id: batchId,
    };
    if (companyCount < 5) sampleLimited.push({ ...record, reason: "样本不足,不展示" });
    else rows.push(record);
  }
  return {
    status: rows.length ? "pass" : "blocked",
    rows,
    sample_limited: sampleLimited,
    note: "只统计 graph ETO 审核通过且允许进入聚合候选的记录;企业级字段不进入 rows。",
  };
}
