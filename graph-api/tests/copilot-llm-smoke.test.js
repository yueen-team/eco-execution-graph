import test from "node:test";
import assert from "node:assert/strict";
import {
  runCopilotSmoke,
  syntheticCandidate,
  findForbiddenPayloadKeys,
  FORBIDDEN_PAYLOAD_KEYS,
  scanPrompts,
  findingsDecisionHits,
  tracesAnchored,
} from "../scripts/copilot-llm-smoke.mjs";

// 离线纪律:全程 stub 注入 fetchImpl + stub env(KEYED),读真 demo 图(本地文件,非网络),绝不触网。
// 真 demo 图 issue:hw:label-incomplete(depth=2)含真实 issue / law_article(law:swl:art77)/
// tech_spec(spec:gb18597:label)节点与 law-anchor 边,故 trace 锚定 / 防幻觉路径被真实行使。

const KEYED_ENV = { TENCENT_TOKENHUB_API_KEY: "tk-offline-smoke-key" };
const REAL_CTX_NODE = "issue:hw:label-incomplete";
const REAL_LAW_NODE = "law:swl:art77";

// OpenAI 兼容响应工厂:content 为 JSON 字符串(response_format JSON)。记录每次调用的 body。
function stubFetch(findingsObj, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: init?.body });
    return {
      ok,
      status,
      json: async () => ({
        id: "chatcmpl-smoke",
        model: "deepseek-v4-flash-202605",
        choices: [{ message: { role: "assistant", content: JSON.stringify(findingsObj) } }],
      }),
    };
  };
  impl.calls = calls;
  return impl;
}

test("(a) 无 TokenHub key → 报告 blocked 且绝不触网", async () => {
  const fetchSpy = stubFetch({ "异议": [] });
  const { report, prompts } = await runCopilotSmoke({ env: {}, fetchImpl: fetchSpy });
  assert.equal(report.status, "blocked");
  assert.equal(report.reason, "no tokenhub credentials");
  assert.equal(report.advisory_only, true);
  assert.equal(report.private_tier_boundary_ok, true);
  assert.equal(prompts.length, 0);
  assert.equal(fetchSpy.calls.length, 0, "无 key 时绝不发起 fetch");
});

test("(b) prompt 捕获里无私有键:含私有的 item 被投影/断言挡掉,prompt_redline_clean=true", async () => {
  const fetchSpy = stubFetch({
    "异议": [
      { "错配码": "issue_type_mismatch", "一句话": "归类需复核", "trace": { node_ids: [REAL_CTX_NODE], edge_ids: [], source_refs: [] } },
    ],
  });
  const poisonedItem = {
    ...syntheticCandidate(),
    "企业名称快照": "某某环保有限公司",
    "evidence_judgment_standard": "私有证据判断标准",
    "rectification_template": "私有整改模板",
    "eto审核笔记": "私有审核笔记",
  };
  const { report, prompts } = await runCopilotSmoke({ env: KEYED_ENV, fetchImpl: fetchSpy, item: poisonedItem });
  const promptText = prompts.join("\n");
  for (const leaked of [
    "企业名称快照", "某某环保有限公司",
    "evidence_judgment_standard", "私有证据判断标准",
    "rectification_template", "私有整改模板",
    "eto审核笔记", "私有审核笔记",
  ]) {
    assert.equal(promptText.includes(leaked), false, `prompt 不得含 ${leaked}`);
  }
  assert.equal(report.prompt_redline_clean, true);
  assert.equal(fetchSpy.calls.length, 1, "有 key + 干净投影 → 恰一次真调");
});

test("(c) findings 写进报告(count/codes)且报告无 FORBIDDEN_PAYLOAD_KEYS", async () => {
  const fetchSpy = stubFetch({
    "异议": [
      { "错配码": "issue_type_mismatch", "一句话": "归类需复核", "trace": { node_ids: [REAL_CTX_NODE], edge_ids: [], source_refs: [] } },
      { "错配码": "law_not_applicable", "一句话": "该法条适用性存疑", "trace": { node_ids: [REAL_LAW_NODE], edge_ids: [], source_refs: [] } },
    ],
  });
  const { report } = await runCopilotSmoke({ env: KEYED_ENV, fetchImpl: fetchSpy });
  assert.equal(report.finding_count, 2);
  assert.deepEqual([...report.codes].sort(), ["issue_type_mismatch", "law_not_applicable"]);
  assert.equal(report.status, "pass");
  // RAG 不可用 → law_not_applicable 降级。
  assert.equal(report.rag_available, false);
  assert.equal(report.degraded, true);
  assert.equal(findForbiddenPayloadKeys(report).length, 0, "报告键名不得命中 FORBIDDEN_PAYLOAD_KEYS");
});

test("(d) 报告 advisory_only=true 且 trace_anchored=true", async () => {
  const fetchSpy = stubFetch({
    "异议": [
      { "错配码": "issue_type_mismatch", "一句话": "归类需复核", "trace": { node_ids: [REAL_CTX_NODE], edge_ids: [], source_refs: [] } },
    ],
  });
  const { report } = await runCopilotSmoke({ env: KEYED_ENV, fetchImpl: fetchSpy });
  assert.equal(report.advisory_only, true);
  assert.equal(report.trace_anchored, true);
  assert.equal(report.status, "pass");
});

test("(e) 报告本身过 FORBIDDEN_PAYLOAD_KEYS 扫描为空,且不含候选正文 / 法条原文段", async () => {
  const fetchSpy = stubFetch({
    "异议": [
      { "错配码": "issue_type_mismatch", "一句话": "归类需复核", "trace": { node_ids: [REAL_CTX_NODE], edge_ids: [], source_refs: [] } },
    ],
  });
  const { report } = await runCopilotSmoke({ env: KEYED_ENV, fetchImpl: fetchSpy });
  assert.deepEqual(findForbiddenPayloadKeys(report), []);
  const text = JSON.stringify(report);
  for (const leaked of ["危废暂存间", "现场问题摘要", "证据摘要", "法条规范候选", "现场表现"]) {
    assert.equal(text.includes(leaked), false, `脱敏报告不得含候选正文片段 ${leaked}`);
  }
  // 报告只放脱敏白名单字段。
  assert.deepEqual(
    Object.keys(report).sort(),
    ["advisory_only", "checked_at", "codes", "degraded", "finding_count", "model", "prompt_redline_clean", "rag_available", "status", "trace_anchored"],
  );
});

test("防幻觉:越界 trace 的 finding 被 parseFindings 丢弃 → 不污染报告,trace_anchored 仍为 true", async () => {
  const fetchSpy = stubFetch({
    "异议": [
      { "错配码": "issue_type_mismatch", "一句话": "真实锚定", "trace": { node_ids: [REAL_CTX_NODE], edge_ids: [], source_refs: [] } },
      { "错配码": "issue_type_mismatch", "一句话": "幻觉越界", "trace": { node_ids: ["ghost:zzz"], edge_ids: [], source_refs: [] } },
    ],
  });
  const { report } = await runCopilotSmoke({ env: KEYED_ENV, fetchImpl: fetchSpy });
  assert.equal(report.finding_count, 1, "越界 trace 的 finding 必须被斩断");
  assert.equal(report.trace_anchored, true);
  assert.equal(report.status, "pass");
});

test("调用异常(fetch 抛错)→ 报告 status:failed + 脱敏 error,不抛给上层", async () => {
  const fetchImpl = async () => { throw new Error("network down at tokenhub.example"); };
  const { report } = await runCopilotSmoke({ env: KEYED_ENV, fetchImpl });
  assert.equal(report.status, "failed");
  assert.match(report.error, /network down/);
  assert.equal(findForbiddenPayloadKeys(report).length, 0);
});

test("syntheticCandidate 自身是脱敏白名单 + 含真实图引用(无企业名/GPS/私有判断)", () => {
  const item = syntheticCandidate();
  const text = JSON.stringify(item);
  for (const forbidden of [...FORBIDDEN_PAYLOAD_KEYS]) {
    assert.equal(Object.prototype.hasOwnProperty.call(item, forbidden), false, `合成候选不得含私有键 ${forbidden}`);
  }
  assert.equal(text.includes("GPS"), false);
  assert.equal(item["问题类型引用"], REAL_CTX_NODE);
});

// 红线审计 follow-up:证明 smoke 的二次红线闸真能 fire(防回归静默禁用)。
test("二次红线闸对中毒输入真命中:scanPrompts / findingsDecisionHits / tracesAnchored", () => {
  // scanPrompts:prompt 业务串含私有禁键(企业名称快照)→ 命中;干净串不误报。
  const dirty = [{ body: JSON.stringify({ messages: [{ role: "user", content: JSON.stringify({ 候选: { 企业名称快照: "合成企业甲" } }) }] }) }];
  assert.ok(scanPrompts(dirty).hits.length > 0, "prompt 含私有键应被 scanPrompts 命中");
  const clean = [{ body: JSON.stringify({ messages: [{ role: "user", content: JSON.stringify({ 候选: { 区域: "华东" } }) }] }) }];
  assert.equal(scanPrompts(clean).hits.length, 0, "干净 prompt 不应误报");

  // findingsDecisionHits:finding 含审核状态/裁决键 → 命中(advisory 违规);干净 finding 无命中。
  assert.deepEqual(findingsDecisionHits([{ 一句话: "x", 当前审核状态: "已通过" }]), ["当前审核状态"]);
  assert.equal(findingsDecisionHits([{ 一句话: "x", 建议修正: "y" }]).length, 0, "干净 finding 无裁决键");

  // tracesAnchored:trace 越界 → false;锚定 context 内 → true;无锚点 → false。
  const ctx = { graph_context: { nodes: [{ node_id: "issue:x" }], edges: [{ edge_id: "e:x" }] } };
  assert.equal(tracesAnchored([{ trace: { node_ids: ["ghost:y"], edge_ids: [] } }], ctx), false, "越界 trace 应判未锚定");
  assert.equal(tracesAnchored([{ trace: { node_ids: ["issue:x"], edge_ids: [] } }], ctx), true, "锚定 context 内应判真");
  assert.equal(tracesAnchored([{ trace: { node_ids: [], edge_ids: [] } }], ctx), false, "无锚点应判假");
});
