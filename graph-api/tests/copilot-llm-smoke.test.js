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
import { scanForbidden } from "../src/graph-context.js";

// 离线纪律:全程 stub 注入 fetchImpl + stub env(KEYED),读真 demo 图(本地文件,非网络),绝不触网。
// 真 demo 图 issue:hw:label-incomplete(depth=2)含真实 issue / law_article(law:swl:art77)/
// tech_spec(spec:gb18597:label)节点与 law-anchor 边,故 trace 锚定 / 防幻觉路径被真实行使。

const KEYED_ENV = { TENCENT_TOKENHUB_API_KEY: "tk-offline-smoke-key" };
const REAL_CTX_NODE = "issue:hw:label-incomplete";
const REAL_LAW_NODE = "law:swl:art77";
// 本次已审核来源闸放行的真实 rag_doc_ref(demo 危废图 law:swl:art77 的 rag_doc_ref);
// stub ragFetch 的 citation 必须用它,projectCitations 才会放行法条原文进 citation 段。
const REAL_LAW_REF = "tencent-lke://law/swl/art77";

/** stub ragFetch:直接回注脱敏 citations(含 excerpt=法条原文),离线模拟 M1 buildRagFetch 取文结果。 */
function stubRagFetch(citations) {
  return async () => ({ citations, available: citations.length > 0 });
}

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
  // RAG 不可用(无 LKE 凭证 → 默认 ragFetch=buildRagFetch(env)=null)→ law_not_applicable 降级、未 grounded。
  assert.equal(report.rag_available, false);
  assert.equal(report.degraded, true);
  assert.equal(report.grounded, false, "无 LKE 凭证降级 → grounded=false");
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
  // 报告只放脱敏白名单字段(含 grounded 计数布尔,绝不含 excerpt/法条原文)。
  assert.deepEqual(
    Object.keys(report).sort(),
    ["advisory_only", "checked_at", "codes", "degraded", "finding_count", "grounded", "model", "prompt_redline_clean", "rag_available", "status", "trace_anchored"],
  );
});

// M2 grounding:法条原文真进 prompt → grounded=true,partition 让法条原文过二次闸,但绝不进 report/输出。
test("(f) grounded:已审核来源法条原文进 prompt → grounded/rag_available 真、prompt_redline_clean 真、原文不进 report", async () => {
  // 故意让 excerpt 含「全文如下」—— 命中 LAW_TEXT_VALUE_PATTERNS:全集 scanForbidden 会判脏,
  // 但 citation 段闸 scanCitationForbidden(排除法条全文模式)放行。partition 的存在意义就在此。
  const LAW_EXCERPT = "第七十七条 产生危险废物的单位,应当按照国家有关规定制定危险废物管理计划。全文如下:危险废物的容器和包装物应当设置识别标志。";
  // 前置确认:这段法条原文确实会被【全集】红线判脏(证明 partition 不是摆设)。
  assert.ok(scanForbidden(LAW_EXCERPT).length > 0, "法条原文应命中全集红线(法条全文模式)");
  assert.equal(scanForbidden({ "法条引用": [{ "法条原文": LAW_EXCERPT }] }).length > 0, true);

  const fetchSpy = stubFetch({
    "异议": [
      { "错配码": "issue_type_mismatch", "一句话": "归类需复核", "trace": { node_ids: [REAL_CTX_NODE], edge_ids: [], source_refs: [] } },
      { "错配码": "law_not_applicable", "一句话": "该法条适用性需结合现场进一步研判", "trace": { node_ids: [REAL_LAW_NODE], edge_ids: [], source_refs: [] } },
    ],
  });
  const ragFetch = stubRagFetch([
    { rag_doc_ref: REAL_LAW_REF, title: "固体废物污染环境防治法 第七十七条", locator: "第七十七条", score: 0.91, excerpt: LAW_EXCERPT },
  ]);

  const { report, prompts } = await runCopilotSmoke({ env: KEYED_ENV, fetchImpl: fetchSpy, ragFetch });
  const promptText = prompts.join("\n");

  // 法条原文【真进了 prompt 的 citation 段】。
  assert.ok(promptText.includes(LAW_EXCERPT), "法条原文应真进 prompt(供研判)");
  // grounded 三连:rag 可用、未降级、grounded=true。
  assert.equal(report.rag_available, true);
  assert.equal(report.degraded, false, "rag 可用 → law_not_applicable 不降级");
  assert.equal(report.grounded, true);
  // partition 让合法法条原文过二次闸,prompt 红线仍判净。
  assert.equal(report.prompt_redline_clean, true, "partition:法条原文进 citation 段不应误判 prompt 脏");
  assert.equal(report.status, "pass");
  assert.deepEqual([...report.codes].sort(), ["issue_type_mismatch", "law_not_applicable"]);
  assert.equal(fetchSpy.calls.length, 1, "干净 grounding → 恰一次真调");

  // 报告【仍脱敏】:绝不含法条原文,只放计数/码/布尔。
  const reportText = JSON.stringify(report);
  assert.equal(reportText.includes("危险废物管理计划"), false, "report 绝不含法条原文片段");
  assert.equal(reportText.includes(LAW_EXCERPT), false, "report 绝不含法条原文");
  assert.equal(findForbiddenPayloadKeys(report).length, 0);
});

// M2 grounding 红线:RAG 取回的 excerpt 夹私有/企业/GPS → 逐条剥离 + 降级,prompt 仍净、无泄漏。
test("(g) 脏 RAG excerpt(GPS/企业)→ 法条原文被剥离、grounded 假、prompt_redline_clean 仍真、无泄漏", async () => {
  // 这段 excerpt 含 GPS(经度/纬度)+ 企业名称快照 —— citation 段闸 scanCitationForbidden 会判脏 → 整条法条原文置 null(降级)。
  const POISON_EXCERPT = "第七十七条 危险废物贮存场所记录。经度 121.473 纬度 31.230,企业名称快照:某某环保科技有限公司。";
  const fetchSpy = stubFetch({
    "异议": [
      { "错配码": "law_not_applicable", "一句话": "该法条适用性需人工复核", "trace": { node_ids: [REAL_LAW_NODE], edge_ids: [], source_refs: [] } },
    ],
  });
  const ragFetch = stubRagFetch([
    { rag_doc_ref: REAL_LAW_REF, title: "固废法第七十七条", locator: "第七十七条", score: 0.88, excerpt: POISON_EXCERPT },
  ]);

  const { report, prompts } = await runCopilotSmoke({ env: KEYED_ENV, fetchImpl: fetchSpy, ragFetch });
  const promptText = prompts.join("\n");

  // 脏原文被剥离 → rag 不可用 → 降级 → 未 grounded。
  assert.equal(report.rag_available, false, "脏 excerpt 被剥离 → rag 不可用");
  assert.equal(report.degraded, true, "law_not_applicable 在 rag 不可用时降级");
  assert.equal(report.grounded, false);
  // 脏原文绝不进 prompt;prompt 红线仍判净。
  assert.equal(report.prompt_redline_clean, true);
  assert.equal(report.status, "pass");
  for (const leaked of ["经度", "纬度", "121.473", "31.230", "企业名称快照", "某某环保科技有限公司"]) {
    assert.equal(promptText.includes(leaked), false, `脏 excerpt 片段 ${leaked} 绝不得进 prompt`);
    assert.equal(JSON.stringify(report).includes(leaked), false, `脏 excerpt 片段 ${leaked} 绝不得进 report`);
  }
  assert.equal(findForbiddenPayloadKeys(report).length, 0);
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

// 红线纵深收口:report.error 是唯一自由文本 report 字段,须与其余字段获得同一道结构化红线。
test("(h) catch 收口:LLM 返非法 JSON 夹带法条全文 → report.error 不回流原文、整份 report 过全集红线", async () => {
  // content 非合法 JSON 且以法条全文起头 → callDeepSeek 的 JSON.parse 抛 SyntaxError,
  // V8 错误消息带 content 片段(已实测含「全文如下」)→ 理论泄漏路径。desensitizeError 的 scanForbidden 闸应整体占位。
  const LAW_FULLTEXT = "全文如下:第七十七条 产生危险废物的单位,应当按照国家有关规定制定危险废物管理计划并报备。";
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: "chatcmpl-smoke",
      model: "deepseek-v4-flash-202605",
      choices: [{ message: { role: "assistant", content: LAW_FULLTEXT } }], // 非 JSON,JSON.parse 必抛
    }),
  });
  const { report } = await runCopilotSmoke({ env: KEYED_ENV, fetchImpl });
  assert.equal(report.status, "failed", "解析异常 → failed");
  assert.ok(report.error, "catch 分支应写 error");
  // 核心不变量:report.error 绝不回流法条原文,整份 report 过全集红线为净(含 catch 路径)。
  assert.equal(report.error.includes("全文如下"), false, "report.error 不得含法条全文片段");
  assert.equal(report.error, "<error redacted: forbidden pattern>", "命中红线模式 → 整体占位(证明闸真 fire)");
  assert.equal(scanForbidden(JSON.stringify(report)).length, 0, "整份 report 过全集红线为净");
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
