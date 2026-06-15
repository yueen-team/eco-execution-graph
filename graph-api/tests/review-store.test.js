import assert from "node:assert/strict";
import { test } from "node:test";
import fixture from "../../data/fixtures/ecocheck-field-event-fixture.json" with { type: "json" };
import { applyReviewDecision, buildPitfallBatch, normalizeFieldEvent } from "../src/review-store.js";

function clone(value) {
  return structuredClone(value);
}

test("EcoCheck 候选事件接收后默认待审核", () => {
  const item = normalizeFieldEvent(clone(fixture), "2026-06-12T10:00:00+08:00");

  assert.equal(item["当前审核状态"], "待审核");
  assert.equal(item["是否允许进入聚合"], false);
  assert.equal(item["来源阶段"], "整改验收通过");
  assert.equal(item["建议问题类型"], "危废标签内容不完整");
});

test("含法条全文或原始附件路径的事件会被拒绝", () => {
  const unsafe = clone(fixture);
  unsafe.law_full_text = "第一条 这里模拟法规全文,第二条 这里仍然是正文。";

  assert.throws(() => normalizeFieldEvent(unsafe), /不得进入 graph/);
});

test("历史回档机器补填字段会转成中文审核记录", () => {
  const payload = clone(fixture);
  delete payload.evidence_chain;
  payload.event_type = "ISSUE_ETO_REVIEWED";
  payload.field_issue_uid = "history-issue-001";
  payload.source_tags = ["历史回档", "机器补填"];
  payload.backfill_context = {
    batch_id: "ecocheck-history-2026-02-06",
    source_period: { from: "2026-02", to: "2026-06" },
    source_kind: "historical_archive",
  };
  payload.source_context.report_month = "2026-03";
  payload.trace_ref = {
    company_id: "synthetic-company-history",
    company_name: "合成历史企业",
    inspection_id: "synthetic-inspection-history",
    issue_id: "history-issue-001",
    evidence_summary: { count: 2, types: ["现场照片"] },
  };
  payload.field_completion = {
    required_fields: [{ field: "问题类型", status: "已机器补填", value: "危废标签缺失", confidence: 0.74 }],
    candidate_fields: [{ field: "法规/标准候选", status: "已机器补填", value: ["扣分规则:S07"], confidence: 0.48 }],
    not_forced_fields: [{ field: "精确位置", status: "不回填", reason: "历史记录不推断精确位置" }],
    summary: { review_policy: "必补字段由ETO确认或补齐；可候选字段只作为建议；不强行补字段不做机器猜测。" },
  };
  payload.machine_fill_provenance = [
    { field: "问题类型", method: "deduct_rule_key优先", confidence: 0.74 },
  ];
  payload.rectification_history_summary = {
    task_status: "VERIFIED",
    total_records: 1,
    latest_round: 1,
    latest_status: "VERIFIED",
    verified_count: 1,
    rejected_count: 0,
    latest_submit_note_summary: "已补齐标签。",
    eto_review_note_summary: "复核通过。",
    requirement_summary: "补齐危废标签。",
    recheck_points_summary: "复查标签。",
  };

  const item = normalizeFieldEvent(payload, "2026-06-12T10:00:00+08:00");

  assert.equal(item["当前审核状态"], "待审核");
  assert.deepEqual(item["信源标签"], ["历史回档", "机器补填"]);
  assert.equal(item["回档批次"]["批次编号"], "ecocheck-history-2026-02-06");
  assert.equal(item["回档批次"]["来源期间"], "2026-02 至 2026-06");
  assert.equal(item["回档批次"]["来源类型"], "历史回档");
  assert.equal(item["检查月份"], "2026-03");
  assert.equal(item["证据摘要"]["证据数量"], 2);
  assert.equal(item["字段补齐状态"]["必补字段"][0]["字段"], "问题类型");
  assert.equal(item["字段补齐状态"]["不强行补字段"][0]["字段"], "精确位置");
  assert.equal(item["机器补填说明"][0]["方法"], "deduct_rule_key优先");
  assert.equal(item["整改历史摘要"]["最新状态"], "VERIFIED");
  assert.equal(item["整改历史摘要"]["整改提交摘要"], "已补齐标签。");
});

test("只有通过入图审核的记录才能进入聚合候选", () => {
  const item = normalizeFieldEvent(clone(fixture), "2026-06-12T10:00:00+08:00");
  const kept = applyReviewDecision(item, { "审核结论": "仅保留内部案例", "审核人": "ETO" });
  const approved = applyReviewDecision(item, { "审核结论": "通过，进入聚合候选", "审核人": "ETO" });

  assert.equal(kept["是否允许进入聚合"], false);
  assert.equal(approved["当前审核状态"], "已通过(待聚合)");
  assert.equal(approved["是否允许进入聚合"], true);
});

test("样本企业不足五家不得输出聚合行", () => {
  const approved = applyReviewDecision(normalizeFieldEvent(clone(fixture)), { "审核结论": "通过，进入聚合候选" });
  const batch = buildPitfallBatch([approved], "pitfall-map:test");

  assert.equal(batch.rows.length, 0);
  assert.equal(batch.sample_limited.length, 1);
  assert.equal(batch.sample_limited[0].reason, "样本不足,不展示");
});

test("五家不同企业通过审核后输出不含企业字段的聚合行", () => {
  const items = Array.from({ length: 5 }, (_, index) => {
    const payload = clone(fixture);
    payload.field_issue_uid = `synthetic-issue-${index + 1}`;
    payload.source_context.company_id = `synthetic-company-${index + 1}`;
    payload.source_context.company_name = `合成企业${index + 1}`;
    return applyReviewDecision(normalizeFieldEvent(payload), { "审核结论": "通过，进入聚合候选", "审核人": "ETO" });
  });
  const batch = buildPitfallBatch(items, "pitfall-map:test");
  const text = JSON.stringify(batch.rows);

  assert.equal(batch.rows.length, 1);
  assert.equal(batch.rows[0].sample_size, 5);
  assert.doesNotMatch(text, /企业名称|企业内部标识|合成企业/);
});

test("合并到已有问题类型后按合并目标聚合", () => {
  const items = Array.from({ length: 5 }, (_, index) => {
    const payload = clone(fixture);
    payload.field_issue_uid = `synthetic-merge-${index + 1}`;
    payload.source_context.company_id = `synthetic-company-${index + 1}`;
    payload.standard_issue_type_candidate.issue_type_ref = `issue:temporary-${index + 1}`;
    return applyReviewDecision(normalizeFieldEvent(payload), {
      "审核结论": "合并到已有问题类型",
      "审核人": "ETO",
      "合并目标问题类型": "issue:hw:label-incomplete",
    });
  });
  const batch = buildPitfallBatch(items, "pitfall-map:merge-test");

  assert.equal(batch.rows.length, 1);
  assert.equal(batch.rows[0].issue_type_ref, "issue:hw:label-incomplete");
  assert.equal(batch.rows[0].sample_size, 5);
});
