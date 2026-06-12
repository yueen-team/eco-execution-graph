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

test("只有通过入图审核的记录才能进入聚合候选", () => {
  const item = normalizeFieldEvent(clone(fixture), "2026-06-12T10:00:00+08:00");
  const kept = applyReviewDecision(item, { "审核结论": "仅保留内部案例", "审核人": "ETO" });
  const approved = applyReviewDecision(item, { "审核结论": "通过，进入聚合候选", "审核人": "ETO" });

  assert.equal(kept["是否允许进入聚合"], false);
  assert.equal(approved["当前审核状态"], "已通过");
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
