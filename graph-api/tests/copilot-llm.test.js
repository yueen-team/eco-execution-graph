import test from "node:test";
import assert from "node:assert/strict";
import {
  llmConfigFromEnv,
  llmCritique,
  callDeepSeek,
  buildCopilotPrompt,
  parseFindings,
  projectCandidate,
} from "../src/copilot-llm.js";
import { assertRedlineClean } from "../src/graph-context.js";

// 离线纪律:全程 stub 注入 fetchImpl / ragFetch / env,绝不触网。

const KEYED_ENV = { TENCENT_TOKENHUB_API_KEY: "tk-offline-test-key" };

// 干净的本次图谱上下文(已 slim,节点/边都在上下文内),供 trace 闸校验。
function cleanCtx() {
  return {
    machine_gate_status: "pass",
    status: "pass",
    blocked_refs: [],
    law_refs: [{ node_id: "law:x", title: "某法 第一条", rag_doc_ref: "tencent-lke://law/x", article_no: "第一条" }],
    tech_spec_refs: [],
    graph_context: {
      nodes: [
        { node_id: "issue:x", node_type: "issue_type", name: "危废标签不规范" },
        { node_id: "law:x", node_type: "law_article", name: "某法 第一条", attrs: { effective_status: "现行有效" } },
      ],
      edges: [
        { edge_id: "e:x", from: "issue:x", to: "law:x", edge_type: "obligation_of", legal_basis_status: "official_confirmed" },
      ],
    },
  };
}

function cleanItem() {
  return {
    "审核编号": "review:llm001",
    "区域": "华东",
    "行业": "医院",
    "环保维度": "hazardous_waste",
    "建议问题类型": "危废标签不规范",
    "问题类型引用": "issue:x",
    "现场问题摘要": "标签信息不完整",
    "整改要求": "补齐标签",
    "证据摘要": { "证据数量": 2, "证据类型": ["标签照片"] },
    "法条规范候选": [{ "引用编号": "law:x", "名称": "某法第一条" }],
    // 私有判断字段 + 企业名称快照:绝不能进 prompt。
    "企业名称快照": "某某环保有限公司",
    "evidence_judgment_standard": "私有证据判断标准",
    "rectification_template": "私有整改模板",
  };
}

// OpenAI 兼容响应工厂:content 为 JSON 字符串(response_format JSON)。
function fetchReturning(findingsObj, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (urlArg, init) => {
    calls.push({ url: urlArg, init });
    return {
      ok,
      status,
      json: async () => ({
        id: "chatcmpl-x",
        model: "deepseek-v4-flash-202605",
        choices: [{ message: { role: "assistant", content: JSON.stringify(findingsObj) } }],
      }),
    };
  };
  impl.calls = calls;
  return impl;
}

test("llmConfigFromEnv:占位/空 key 判 not configured,去尾斜杠,回退别名", () => {
  assert.equal(llmConfigFromEnv({}).configured, false);
  assert.equal(llmConfigFromEnv({ TENCENT_TOKENHUB_API_KEY: "your-key-here" }).configured, false);
  assert.equal(llmConfigFromEnv({ TENCENT_TOKENHUB_API_KEY: "请填入" }).configured, false);
  const cfg = llmConfigFromEnv({
    TENCENT_LKEAP_API_KEY: "real-key",
    TENCENT_TOKENHUB_BASE_URL: "https://host/v1///",
  });
  assert.equal(cfg.configured, true);
  assert.equal(cfg.baseUrl, "https://host/v1");
  assert.equal(cfg.model, "deepseek-v4-flash-202605");
});

test("无 key:llmCritique 返回 {findings:[], available:false},不触网", async () => {
  const fetchSpy = fetchReturning({ "异议": [] });
  const result = await llmCritique({ item: cleanItem(), graphContext: cleanCtx(), env: {}, fetchImpl: fetchSpy });
  assert.deepEqual(result.findings, []);
  assert.equal(result.available, false);
  assert.equal(fetchSpy.calls.length, 0, "无 key 时绝不发起 fetch");
});

test("脱敏白名单投影:projectCandidate 丢弃企业名称快照与私有判断字段", () => {
  const projected = projectCandidate(cleanItem());
  const text = JSON.stringify(projected);
  for (const leaked of ["企业名称快照", "某某环保有限公司", "evidence_judgment_standard", "rectification_template", "私有证据判断标准"]) {
    assert.equal(text.includes(leaked), false, `投影不得含 ${leaked}`);
  }
  assert.equal(projected["问题类型引用"], "issue:x");
  assert.equal(projected["证据摘要"]["证据数量"], 2);
});

test("buildCopilotPrompt:干净投影通过红线;含企业名称快照的 item 不泄漏进 messages", () => {
  const messages = buildCopilotPrompt({ item: cleanItem(), graphContext: cleanCtx(), citations: [] });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  const text = JSON.stringify(messages);
  for (const leaked of ["企业名称快照", "某某环保有限公司", "evidence_judgment_standard", "rectification_template"]) {
    assert.equal(text.includes(leaked), false, `messages 不得含 ${leaked}`);
  }
});

test("private-tier payload:被污染的 graphContext 命中红线 → buildCopilotPrompt 抛错(fail-closed,不发送)", () => {
  const poisoned = cleanCtx();
  poisoned.graph_context.nodes[0].evidence_judgment_standard = "私有证据判断标准";
  assert.throws(
    () => buildCopilotPrompt({ item: cleanItem(), graphContext: poisoned }),
    /私有|红线|fail-closed|evidence_judgment_standard/,
  );

  const poisoned2 = cleanCtx();
  poisoned2.graph_context.nodes[1]["企业名称快照"] = "某某环保有限公司";
  assert.throws(() => buildCopilotPrompt({ item: cleanItem(), graphContext: poisoned2 }), /企业名称快照|私有|红线/);
});

test("private-tier 命中:llmCritique 在断言抛错前绝不发起 fetch", async () => {
  const poisoned = cleanCtx();
  poisoned.graph_context.nodes[0].rectification_template = "私有整改模板";
  const fetchSpy = fetchReturning({ "异议": [] });
  await assert.rejects(
    () => llmCritique({ item: cleanItem(), graphContext: poisoned, env: KEYED_ENV, fetchImpl: fetchSpy }),
    /私有|红线|fail-closed/,
  );
  assert.equal(fetchSpy.calls.length, 0, "私有命中必须在 fetch 前抛错,绝不发送");
});

test("callDeepSeek:response_format JSON 解析 choices[0].message.content,Bearer 头与 OpenAI body", async () => {
  const fetchSpy = fetchReturning({ "异议": [{ "错配码": "issue_type_mismatch" }] });
  const messages = [{ role: "user", content: "hi" }];
  const parsed = await callDeepSeek({ messages, env: KEYED_ENV, fetchImpl: fetchSpy });
  assert.deepEqual(parsed, { "异议": [{ "错配码": "issue_type_mismatch" }] });
  const { url, init } = fetchSpy.calls[0];
  assert.match(url, /\/chat\/completions$/);
  assert.equal(init.headers.Authorization, "Bearer tk-offline-test-key");
  assert.equal(init.headers["Content-Type"], "application/json");
  const body = JSON.parse(init.body);
  assert.equal(body.stream, false);
  assert.equal(body.temperature, 0);
  assert.deepEqual(body.response_format, { type: "json_object" });
});

test("parseFindings:保留白名单错配码,丢弃缺 trace / trace 越界 / 非白名单码 / 仅 source_ref 的 finding", () => {
  const ctx = cleanCtx();
  const raw = {
    "异议": [
      { "错配码": "issue_type_mismatch", "一句话": "归类不符", "trace": { node_ids: ["issue:x"], edge_ids: [], source_refs: [] } },
      { "错配码": "law_not_applicable", "一句话": "法条不适用", "trace": { node_ids: [], edge_ids: ["e:x"], source_refs: [] } },
      { "错配码": "duplicate_mergeable", "一句话": "重复" }, // 缺 trace → 丢弃
      { "错配码": "issue_type_mismatch", "一句话": "幻觉", "trace": { node_ids: ["ghost:y"], edge_ids: [], source_refs: [] } }, // 越界 → 丢弃
      { "错配码": "law_status_risk", "一句话": "非 LLM 律", "trace": { node_ids: ["issue:x"], edge_ids: [], source_refs: [] } }, // 非白名单码 → 丢弃
      { "错配码": "duplicate_mergeable", "一句话": "仅来源", "trace": { node_ids: [], edge_ids: [], source_refs: ["src:z"] } }, // 仅 source_ref 防幻觉丢弃
    ],
  };
  const findings = parseFindings(raw, ctx);
  assert.deepEqual(findings.map((f) => f["错配码"]), ["issue_type_mismatch", "law_not_applicable"]);
  for (const f of findings) {
    assert.equal(f["检出方式"], "llm");
    assert.equal(f["采纳状态"], "未决");
    assert.ok(["blocking", "warning", "info"].includes(f["严重度"]));
  }
});

test("parseFindings:非法 JSON 字符串返回空数组,不抛", () => {
  assert.deepEqual(parseFindings("not-json", cleanCtx()), []);
});

test("llmCritique:有 key + RAG 不可用 → law_not_applicable 降级为需人工复核 + 降级说明", async () => {
  const fetchSpy = fetchReturning({
    "异议": [
      { "错配码": "law_not_applicable", "一句话": "该法条不适用", "trace": { node_ids: ["law:x"], edge_ids: [], source_refs: [] } },
      { "错配码": "issue_type_mismatch", "一句话": "归类不符", "trace": { node_ids: ["issue:x"], edge_ids: [], source_refs: [] } },
    ],
  });
  const result = await llmCritique({ item: cleanItem(), graphContext: cleanCtx(), env: KEYED_ENV, fetchImpl: fetchSpy, ragFetch: null });
  assert.equal(result.available, true);
  assert.equal(result.rag_available, false);
  const lawFinding = result.findings.find((f) => f["错配码"] === "law_not_applicable");
  assert.ok(lawFinding);
  assert.equal(lawFinding["_rag_degraded"], true);
  assert.match(lawFinding["建议修正"], /人工复核/);
  assert.doesNotMatch(lawFinding["建议修正"], /违反|违法|依据|根据/);
  assert.match(result.degraded_note, /RAG|人工复核/);
});

test("llmCritique:RAG 可用(注入 ragFetch 带 excerpt)→ rag_available=true,不降级", async () => {
  const fetchSpy = fetchReturning({
    "异议": [{ "错配码": "law_not_applicable", "一句话": "不适用", "trace": { node_ids: ["law:x"], edge_ids: [], source_refs: [] } }],
  });
  const ragFetch = async () => [{ rag_doc_ref: "tencent-lke://law/x", title: "某法 第一条", excerpt: "脱敏后元数据片段" }];
  const result = await llmCritique({ item: cleanItem(), graphContext: cleanCtx(), env: KEYED_ENV, fetchImpl: fetchSpy, ragFetch });
  assert.equal(result.rag_available, true);
  assert.equal(result.degraded_note, null);
  const lawFinding = result.findings.find((f) => f["错配码"] === "law_not_applicable");
  assert.equal(lawFinding["_rag_degraded"], undefined);
});

test("fetch 报错:llmCritique 抛给上层(server 退 backbone,不 500)", async () => {
  const fetchImpl = async () => { throw new Error("network down"); };
  await assert.rejects(
    () => llmCritique({ item: cleanItem(), graphContext: cleanCtx(), env: KEYED_ENV, fetchImpl }),
    /network down/,
  );
});

test("fetch 非 2xx:抛 HTTP 错误,由上层退 backbone", async () => {
  const fetchSpy = fetchReturning({ "异议": [] }, { ok: false, status: 503 });
  await assert.rejects(
    () => callDeepSeek({ messages: [{ role: "user", content: "x" }], env: KEYED_ENV, fetchImpl: fetchSpy }),
    /HTTP 503/,
  );
});

test("合并产物过 assertRedlineClean:LLM 异议并入 backbone 形状后无私有泄漏", async () => {
  const fetchSpy = fetchReturning({
    "异议": [{ "错配码": "issue_type_mismatch", "一句话": "归类不符", "证据": "摘要在讲台账", "trace": { node_ids: ["issue:x"], edge_ids: [], source_refs: [] } }],
  });
  const result = await llmCritique({ item: cleanItem(), graphContext: cleanCtx(), env: KEYED_ENV, fetchImpl: fetchSpy });
  // 模拟 server 合并后的副驾意见对象,过同一道红线闸。
  const merged = {
    "审核编号": "review:llm001",
    "副驾版本": "copilot.v1",
    "上下文门禁": "pass",
    "整体研判": { "就绪度": "warn", "建议方向": null, "一句话": "检出待核异议" },
    "补足": {},
    "异议": result.findings.map((f) => ({ ...f, "检出方式": "llm" })),
    "降级说明": null,
    "trace": { node_ids: ["issue:x"], edge_ids: [], source_refs: [] },
    "_redline_clean": true,
  };
  assert.doesNotThrow(() => assertRedlineClean(merged));
  const text = JSON.stringify(merged);
  for (const leaked of ["企业名称快照", "evidence_judgment_standard", "rectification_template", "某某环保有限公司"]) {
    assert.equal(text.includes(leaked), false, `合并产物不得含 ${leaked}`);
  }
});
