import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fixture from "../../data/fixtures/ecocheck-field-event-fixture.json" with { type: "json" };
import { applyReviewDecision, normalizeFieldEvent } from "../src/review-store.js";
import { readJsonl, upsertByReviewId } from "../src/storage.js";
import { assertRedlineClean } from "../src/graph-context.js";
import { createServer } from "../src/server.js";
import {
  appendAiReviewDelta,
  buildAiReviewDelta,
  computeAgreementRate,
  decisionKind,
  readAllAiReviewDeltas,
} from "../src/copilot-delta.js";

const NOW = "2026-06-29T00:00:00Z";

function sampleItem() {
  return normalizeFieldEvent(fixture, NOW);
}

test("(1) decision 往返后 副驾回执 落 payload_json,readAll 可还原", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "eco-delta-roundtrip-"));
  const filePath = path.join(temp, "field-events.jsonl");
  try {
    const item = sampleItem();
    await upsertByReviewId(filePath, item);
    const 副驾回执 = { "副驾建议方向": "internal", "采纳异议码": ["aggregation_risk"], "驳回异议码": [] };
    const decided = applyReviewDecision(item, { "审核结论": "通过，进入聚合候选", "审核人": "ETO", "副驾回执": 副驾回执 }, NOW);
    await upsertByReviewId(filePath, decided);

    const rows = await readJsonl(filePath);
    const restored = rows.find((row) => row["审核编号"] === item["审核编号"]);
    assert.ok(restored, "应能取回该记录");
    assert.deepEqual(restored["副驾回执"], 副驾回执, "副驾回执 必须随 payload_json 落库并还原");
    // 既有键不被破坏:审核结论仍生效。
    assert.equal(restored["当前审核状态"], "已通过(待聚合)");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("(2) 副驾建议方向 ≠ 终判 → 生成 ai_review_delta,默认 candidate 且绝不自动 approved", () => {
  const item = sampleItem();
  const delta = buildAiReviewDelta({
    item,
    副驾回执: { "副驾建议方向": "internal", "采纳异议码": [], "驳回异议码": [] },
    终判: "approve",
    now: NOW,
  });
  assert.equal(delta["类型"], "ai_review_delta");
  assert.equal(delta["是否分歧"], true, "建议方向 internal ≠ 终判 approve 应判定分歧");
  assert.equal(delta["review_status"], "candidate", "delta 默认 review_status 必须是 candidate");
  assert.notEqual(delta["review_status"], "approved", "delta 绝不自动晋级 approved(AGENTS 硬门禁 #4)");
  assert.equal(delta["副驾建议方向"], "internal");
  assert.equal(delta["ETO终判"], "approve");
});

test("(2b) 任一 blocking 异议被驳回 → 即使方向一致也判定分歧", () => {
  const item = sampleItem();
  const delta = buildAiReviewDelta({
    item,
    副驾回执: { "副驾建议方向": "approve", "采纳异议码": [], "驳回异议码": ["management_advice_miscast_as_law"] },
    终判: "approve",
    now: NOW,
  });
  assert.equal(delta["是否分歧"], true, "blocking 异议被驳回即分歧,哪怕方向与终判一致");
  assert.equal(delta["review_status"], "candidate");
});

test("(3) 一致(建议方向 == 终判 且无 blocking 被驳回)不产分歧候选", () => {
  const item = sampleItem();
  const delta = buildAiReviewDelta({
    item,
    副驾回执: { "副驾建议方向": "approve", "采纳异议码": ["aggregation_risk"], "驳回异议码": [] },
    终判: "approve",
    now: NOW,
  });
  assert.equal(delta["是否分歧"], false, "建议方向与终判一致且无 blocking 被驳回 → 非分歧");
});

test("(4) buildAiReviewDelta 产出过红线扫描,且不泄漏企业名/私有判断/现场摘要", () => {
  const item = sampleItem();
  // fixture 带企业名称快照「合成企业甲」、现场摘要等私有/可识别内容,delta 绝不得携带。
  assert.equal(item["企业名称快照"], "合成企业甲");
  const delta = buildAiReviewDelta({
    item,
    副驾回执: { "副驾建议方向": "return", "采纳异议码": [], "驳回异议码": [] },
    终判: "approve",
    now: NOW,
  });
  assert.doesNotThrow(() => assertRedlineClean(delta), "delta 必须通过红线零泄漏扫描");
  const serialized = JSON.stringify(delta);
  assert.equal(serialized.includes("合成企业甲"), false, "delta 不得含企业名称快照");
  assert.equal(serialized.includes("企业名称快照"), false, "delta 不得含企业名称快照键");
  assert.equal(serialized.includes("现场追溯困难"), false, "delta 不得含现场问题摘要原文");
  // 仍保留脱敏聚合维度键(区域/行业/环保维度)。
  assert.equal(delta["区域"], "昆明市");
  assert.equal(delta["行业"], "汽车维修");
  assert.equal(delta["环保维度"], "危险废物管理");
  assert.equal(delta["问题类型引用"], "issue:hw:label-incomplete");
});

test("(5) computeAgreementRate 计算正确(含按维度)", () => {
  const deltas = [
    { "是否分歧": true, "环保维度": "危险废物管理" },
    { "是否分歧": false, "环保维度": "危险废物管理" },
    { "是否分歧": false, "环保维度": "危险废物管理" },
    { "是否分歧": false, "环保维度": "废水" },
  ];
  const rate = computeAgreementRate(deltas);
  assert.equal(rate["总数"], 4);
  assert.equal(rate["分歧数"], 1);
  assert.equal(rate["一致数"], 3);
  assert.equal(rate["一致率"], 0.75);
  assert.equal(rate["按维度"]["危险废物管理"]["总数"], 3);
  assert.equal(rate["按维度"]["危险废物管理"]["分歧数"], 1);
  assert.equal(rate["按维度"]["废水"]["一致率"], 1);

  // 空数组:无样本不臆造 100%。
  const empty = computeAgreementRate([]);
  assert.equal(empty["总数"], 0);
  assert.equal(empty["一致率"], null);
});

test("(6) append-only staging 往返:只追加分歧记录,readAll 还原", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "eco-delta-staging-"));
  const filePath = path.join(temp, "ai-review-deltas.jsonl");
  try {
    const item = sampleItem();
    const divergent = buildAiReviewDelta({
      item,
      副驾回执: { "副驾建议方向": "internal", "采纳异议码": [], "驳回异议码": [] },
      终判: "approve",
      now: NOW,
    });
    await appendAiReviewDelta(filePath, divergent);
    await appendAiReviewDelta(filePath, { ...divergent, "审核编号": "review:second" });
    const rows = await readAllAiReviewDeltas(filePath);
    assert.equal(rows.length, 2, "append-only 应保留两条");
    assert.equal(rows[0]["类型"], "ai_review_delta");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("(8) 决策端点:副驾每次表态(一致+分歧)都落 ai-review-deltas.jsonl;一致率端点现算真实比例;decision 不被阻断", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "eco-delta-server-"));
  const stagingPath = path.join(temp, "field-events.jsonl");
  const deltaFile = path.join(temp, "ai-review-deltas.jsonl");
  const server = createServer({ stagingPath, deltaPath: deltaFile, apiToken: "secret-for-test" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "content-type": "application/json", authorization: "Bearer secret-for-test" };
  async function intake(uid) {
    const payload = { ...structuredClone(fixture), field_issue_uid: uid, business_key: uid };
    const create = await fetch(`${base}/api/ecocheck/field-events`, { method: "POST", headers, body: JSON.stringify(payload) });
    assert.equal(create.status, 201);
    return (await create.json()).item["审核编号"];
  }
  async function decide(id, conclusion, 副驾回执) {
    const res = await fetch(`${base}/api/review/field-events/${encodeURIComponent(id)}/decision`, {
      method: "POST", headers,
      body: JSON.stringify({ "审核结论": conclusion, "审核人": "ETO", "副驾回执": 副驾回执 }),
    });
    assert.equal(res.status, 200, "decision 流程绝不被 delta 旁路阻断");
    return res.json();
  }
  try {
    // 分歧:副驾 internal,ETO 终判 approve。
    const idA = await intake("delta-uid-A");
    const decidedA = await decide(idA, "通过，进入聚合候选", { "副驾建议方向": "internal", "采纳异议码": [], "驳回异议码": [] });
    assert.deepEqual(decidedA.item["副驾回执"], { "副驾建议方向": "internal", "采纳异议码": [], "驳回异议码": [] }, "副驾回执随 item 落库往返");

    // 一致:副驾 approve,ETO 终判 approve,无 blocking 被驳回。
    const idB = await intake("delta-uid-B");
    await decide(idB, "通过，进入聚合候选", { "副驾建议方向": "approve", "采纳异议码": ["aggregation_risk"], "驳回异议码": [] });

    // 一致与分歧都落库(分母完整);review_status 恒 candidate,绝不自动晋级。
    const deltas = await readAllAiReviewDeltas(deltaFile);
    assert.equal(deltas.length, 2, "副驾每次表态都落一条(一致 + 分歧)");
    assert.equal(deltas.filter((d) => d["是否分歧"] === true).length, 1, "1 条分歧");
    assert.equal(deltas.filter((d) => d["是否分歧"] === false).length, 1, "1 条一致");
    for (const d of deltas) assert.equal(d["review_status"], "candidate", "永不自动晋级 approved");

    // 一致率 = 1 - 分歧/总 = 0.5;一致样本进分母,曲线可随时间上升(§10 / §14 Q4)。
    const agree = await fetch(`${base}/api/review/copilot-agreement`, { headers });
    assert.equal(agree.status, 200);
    const rate = await agree.json();
    assert.equal(rate["总数"], 2);
    assert.equal(rate["分歧数"], 1);
    assert.equal(rate["一致数"], 1);
    assert.equal(rate["一致率"], 0.5);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("(7) decisionKind 映射审核结论文本 → ACTIONS kind", () => {
  assert.equal(decisionKind("通过，进入聚合候选"), "approve");
  assert.equal(decisionKind("合并到已有问题类型"), "merge");
  assert.equal(decisionKind("仅保留内部案例"), "internal");
  assert.equal(decisionKind("退回补充"), "return");
  assert.equal(decisionKind("不入图"), "reject");
  assert.equal(decisionKind("未知结论"), null);
});

// 回归:红线审计 major — 副驾建议方向 必须白名单收口,自由文本注入归一 null,不污染 delta / 一致率。
test("(9) buildAiReviewDelta:副驾建议方向 非 ACTIONS kind 自由文本 → 归一 null,不恒判分歧", () => {
  const injected = buildAiReviewDelta({
    item: sampleItem(),
    副驾回执: { "副驾建议方向": "私有判断标准任意自由文本注入", "采纳异议码": ["__bad__", "law_status_risk"], "驳回异议码": ["junk"] },
    终判: "approve",
    now: NOW,
  });
  assert.equal(injected["副驾建议方向"], null, "非枚举自由文本必须归一 null,不得原样落库");
  assert.equal(injected["是否分歧"], false, "建议方向归一 null + 无 blocking 被驳回 → 不恒判分歧");
  assert.deepEqual(injected["采纳异议码"], ["law_status_risk"], "未知码 __bad__ 被白名单丢弃");
  assert.deepEqual(injected["驳回异议码"], [], "未知码 junk 被白名单丢弃");
  assert.equal(JSON.stringify(injected).includes("自由文本注入"), false, "注入文本不得进入 delta");
});

// 回归:红线审计 major — 一致率单向偏置。同审核编号去重 latest-wins + 非布尔进未知桶不算一致。
test("(10) computeAgreementRate:同审核编号去重 + 非布尔进未知桶,杜绝一致率单向虚高", () => {
  const dup = [
    { "审核编号": "review:a", "是否分歧": false, "环保维度": "危险废物管理" },
    { "审核编号": "review:a", "是否分歧": false, "环保维度": "危险废物管理" },
    { "审核编号": "review:a", "是否分歧": false, "环保维度": "危险废物管理" },
    { "审核编号": "review:b", "是否分歧": true, "环保维度": "危险废物管理" },
  ];
  const rate = computeAgreementRate(dup);
  assert.equal(rate["总数"], 2, "同审核编号去重 latest-wins:a 算 1 条 + b 1 条");
  assert.equal(rate["分歧数"], 1);
  assert.equal(rate["一致率"], 0.5, "重复同意裁决不得把一致率刷高");

  const malformed = computeAgreementRate([{ "审核编号": "r1", "是否分歧": "false" }, { "审核编号": "r2", "是否分歧": null }, { "审核编号": "r3" }]);
  assert.equal(malformed["总数"], 0, "非布尔行不计入统计总数");
  assert.equal(malformed["未知"], 3, "非布尔/缺失行进未知桶");
  assert.equal(malformed["一致率"], null, "无有效布尔样本 → 一致率 null,不臆造 1.0");
});
