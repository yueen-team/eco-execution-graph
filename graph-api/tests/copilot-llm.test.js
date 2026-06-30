import test from "node:test";
import assert from "node:assert/strict";
import {
  llmConfigFromEnv,
  llmCritique,
  callDeepSeek,
  buildCopilotPrompt,
  parseFindings,
  projectCandidate,
  assertCitationSegmentClean,
} from "../src/copilot-llm.js";
import { assertRedlineClean, scanCitationForbidden, scanForbidden } from "../src/graph-context.js";

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

// 回归:红线审计发现的「虚构法条搭真实无关 trace 便车」攻击必须被斩断(铁律2 强化)。
test("parseFindings:虚构法条号写进散文 + trace 锚真实无关 issue 节点 → 丢弃;锚真实法条节点/边 → 保留", () => {
  const ctx = cleanCtx(); // 含 issue:x、law:x(law_article)、e:x(issue:x-obligation_of->law:x)
  const raw = {
    "异议": [
      // 攻击:虚构《GB 99999-2099》写进散文,trace 只挂 issue:x(真实但非法条) → 必丢弃。
      { "错配码": "law_not_applicable", "一句话": "候选违反《GB 99999-2099 完全虚构标准》第8条", "证据": "依据 GB 99999-2099 第8条", "trace": { node_ids: ["issue:x"], edge_ids: [], source_refs: [] } },
      // 合法:锚定真实法条关系边 e:x(端点 law:x) → 保留。
      { "错配码": "law_not_applicable", "一句话": "该法条在本场景不适用", "trace": { node_ids: [], edge_ids: ["e:x"], source_refs: [] } },
      // 合法:锚定真实 law 节点 law:x → 保留。
      { "错配码": "law_not_applicable", "一句话": "法条适用性存疑", "trace": { node_ids: ["law:x"], edge_ids: [], source_refs: [] } },
      // 攻击:evidence_insufficient 散文引用虚构《GB 88888》却只锚 issue:x → 丢弃。
      { "错配码": "evidence_insufficient", "一句话": "证据不足,依据《GB 88888》第3条", "trace": { node_ids: ["issue:x"], edge_ids: [], source_refs: [] } },
      // 合法:evidence_insufficient 不引用任何法条标识,锚 issue:x → 保留(非法律维度、未引法条)。
      { "错配码": "evidence_insufficient", "一句话": "证据数量不足以支撑该问题类型", "trace": { node_ids: ["issue:x"], edge_ids: [], source_refs: [] } },
    ],
  };
  const findings = parseFindings(raw, ctx);
  assert.equal(findings.length, 3, "虚构法条搭便车的 2 条必须被丢弃");
  const allText = findings.map((f) => `${f["一句话"]}${f["证据"]}`).join("");
  assert.equal(allText.includes("99999"), false, "虚构法条号 99999 不得存活");
  assert.equal(allText.includes("88888"), false, "虚构法条号 88888 不得存活");
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

// ───────────────────────────── 里程碑1:红线分域 + RAG grounding ─────────────────────────────

// 真实危废法条片段(单条款引用,合法进 citation 段;不命中「整段法条」全文模式)。
const LAW_TEXT = "第七十七条 产生危险废物的单位应当按照国家有关规定制定危险废物管理计划并向生态环境主管部门申报危险废物的种类产生量流向贮存处置等有关资料";
// 整段法条全文(命中 全文如下 + 第一条..第二条)→ 若被 LLM 回贴进异议,必须被 finding 级守卫剥离。
const FULL_LAW_BLOB = "全文如下:第一条 为了保护和改善生态环境防治环境污染和其他公害保障公众健康 第二条 本法适用于中华人民共和国领域";

test("grounding:RAG 注入真实法条片段 → 原文真进 messages、rag_available=true、不降级、原文不回流 findings", async () => {
  const fetchSpy = fetchReturning({
    "异议": [
      // LLM 违规把整段法条原文回贴进证据 → finding 级守卫必须剥离(承重单测)。
      { "错配码": "law_not_applicable", "一句话": "候选法条在本场景不适用", "证据": FULL_LAW_BLOB, "trace": { node_ids: ["law:x"], edge_ids: [], source_refs: [] } },
      { "错配码": "issue_type_mismatch", "一句话": "归类不符", "证据": "摘要其实在讲台账", "trace": { node_ids: ["issue:x"], edge_ids: [], source_refs: [] } },
    ],
  });
  // 已审核来源(rag_doc_ref ∈ cleanCtx().law_refs)带真实法条原文 excerpt。
  const ragFetch = async () => [{ rag_doc_ref: "tencent-lke://law/x", title: "某法 第七十七条", locator: "第七十七条", excerpt: LAW_TEXT }];
  const result = await llmCritique({ item: cleanItem(), graphContext: cleanCtx(), env: KEYED_ENV, fetchImpl: fetchSpy, ragFetch });

  // ① 法条原文【真进了】发往 DeepSeek 的 messages(citation 段携带原文供研判)。
  const capturedMessages = JSON.parse(fetchSpy.calls[0].init.body).messages;
  assert.equal(JSON.stringify(capturedMessages).includes(LAW_TEXT), true, "法条原文必须真进 prompt");

  // ② grounding 生效:rag_available=true、不降级、law_not_applicable 不再 _rag_degraded。
  assert.equal(result.rag_available, true);
  assert.equal(result.degraded_note, null);
  const lawFinding = result.findings.find((f) => f["错配码"] === "law_not_applicable");
  assert.ok(lawFinding);
  assert.equal(lawFinding["_rag_degraded"], undefined, "RAG 可用时 law_not_applicable 不得降级");

  // ③ 原文不回流输出:findings 不含法条原文;LLM 回贴的整段法条被 finding 级守卫剥离。
  const findingsText = JSON.stringify(result.findings);
  assert.equal(findingsText.includes(LAW_TEXT), false, "法条原文不得回流进 findings");
  assert.equal(findingsText.includes("全文如下"), false, "LLM 回贴的整段法条必须被剥离");
  assert.equal(findingsText.includes("第二条"), false, "整段法条标志(第一条..第二条)必须被剥离");

  // ④ llmCritique 输出契约:只回 {findings, available, rag_available, degraded_note},无 citations 回流。
  assert.deepEqual(Object.keys(result).sort(), ["available", "degraded_note", "findings", "rag_available"]);
});

// 承重回归(里程碑1 修复):单条法条全文逐字回贴 —— 不命中「多条/全文标记」模式,
// 只能靠内容感知守卫(比对本轮真送进 citation 段的原文)抓住,绝不回流输出/图/report。
test("grounding 单条款回流闸:LLM 把本轮已送单条法条原文逐字回贴 → 内容感知守卫剥离;仅 locator 引用合法保留", async () => {
  const fetchSpy = fetchReturning({
    "异议": [
      // 违规:把本轮真送进 citation 段的【单条】法条原文逐字回贴进证据/建议修正。
      // 单条全文不命中 LAW_TEXT_VALUE_PATTERNS(无「全文如下」、无「第一条..第二条」)→ 纯模式闸抓不到。
      { "错配码": "law_not_applicable", "一句话": "候选法条第七十七条在本场景不适用", "证据": LAW_TEXT, "建议修正": "应核对" + LAW_TEXT.slice(8, 48), "trace": { node_ids: ["law:x"], edge_ids: [], source_refs: [] } },
      // 合法:只引用 locator「第七十七条」(<20 字连续片段),不逐字回贴原文 → 锚法条关系边 e:x 保留。
      { "错配码": "issue_type_mismatch", "一句话": "建议类型与第七十七条义务不符", "证据": "现场摘要其实在讲贮存", "trace": { node_ids: ["issue:x"], edge_ids: ["e:x"], source_refs: [] } },
    ],
  });
  const ragFetch = async () => [{ rag_doc_ref: "tencent-lke://law/x", title: "某法 第七十七条", locator: "第七十七条", excerpt: LAW_TEXT }];
  const result = await llmCritique({ item: cleanItem(), graphContext: cleanCtx(), env: KEYED_ENV, fetchImpl: fetchSpy, ragFetch });

  // ① 原文真进 prompt(供研判);rag_available=true,不降级。
  assert.equal(JSON.stringify(JSON.parse(fetchSpy.calls[0].init.body).messages).includes(LAW_TEXT), true, "单条法条原文必须真进 prompt 供研判");
  assert.equal(result.rag_available, true);

  // ② 单条法条原文绝不回流 findings:整段逐字与 ≥20 字连续片段都被剥离,占位符替代。
  const findingsText = JSON.stringify(result.findings);
  assert.equal(findingsText.includes(LAW_TEXT), false, "单条法条原文整段不得回流进 findings");
  assert.equal(findingsText.includes(LAW_TEXT.slice(8, 48)), false, "≥20 字逐字片段必须被剥离");
  assert.equal(findingsText.includes("危险废物管理计划并向生态环境主管部门申报"), false, "原文中段逐字片段不得残留");
  assert.ok(findingsText.includes("已剥离回贴的法条原文"), "回贴字段应被占位符替代");

  // ③ 合法 locator 引用存活:仅引用「第七十七条」未逐字回贴原文的异议保留,locator 仍在。
  const keep = result.findings.find((f) => f["错配码"] === "issue_type_mismatch");
  assert.ok(keep, "仅 locator 引用的合法异议必须保留(内容感知零误杀)");
  assert.match(keep["一句话"], /第七十七条/);
  assert.equal(keep["证据"], "现场摘要其实在讲贮存", "合法散文不得被误剥离");
});

test("分域负样本:excerpt 夹带私有/企业/GPS → 该条法条原文被丢弃,未泄漏进 messages,rag 视为不可用降级", async () => {
  const fetchSpy = fetchReturning({
    "异议": [
      { "错配码": "law_not_applicable", "一句话": "该法条不适用", "trace": { node_ids: ["law:x"], edge_ids: [], source_refs: [] } },
    ],
  });
  // 脏 excerpt:夹带私有判断字段名 + 企业名称快照 + GPS 经纬度坐标 → citation 闸命中 → 该条原文丢弃。
  const ragFetch = async () => [{
    rag_doc_ref: "tencent-lke://law/x",
    title: "某法 第一条",
    excerpt: "第一条 总则 evidence_judgment_standard 企业名称快照=某某环保有限公司 经度 31.2304 纬度 121.4737",
  }];
  const result = await llmCritique({ item: cleanItem(), graphContext: cleanCtx(), env: KEYED_ENV, fetchImpl: fetchSpy, ragFetch });

  // 脏 excerpt 被逐条丢弃 → 视为 RAG 不可用 → law_not_applicable 降级路径接管。
  assert.equal(result.rag_available, false, "脏原文被丢弃后 rag_available 必须为 false");
  const lawFinding = result.findings.find((f) => f["错配码"] === "law_not_applicable");
  assert.equal(lawFinding["_rag_degraded"], true);
  assert.match(result.degraded_note, /RAG|人工复核/);

  // 私有/企业/坐标绝不泄漏进发往 DeepSeek 的 messages。
  const body = fetchSpy.calls[0].init.body;
  for (const leaked of ["企业名称快照", "某某环保有限公司", "evidence_judgment_standard", "经度", "31.2304", "121.4737"]) {
    assert.equal(body.includes(leaked), false, `脏 excerpt 不得泄漏进 messages:${leaked}`);
  }
});

test("分域负样本(backstop):assertCitationSegmentClean 对夹带坐标/密钥的法条原文 fail-closed 抛;干净法条原文放行", () => {
  // 坐标 → 抛。
  assert.throws(
    () => assertCitationSegmentClean([{ rag_doc_ref: "law:x", "法条原文": "第七十七条 产生危险废物 经度 31.2 纬度 121.4" }]),
    /私有|坐标|密钥|fail-closed/,
  );
  // 密钥 → 抛。
  assert.throws(
    () => assertCitationSegmentClean([{ rag_doc_ref: "law:x", "法条原文": "条文 BEGIN PRIVATE KEY xxx" }]),
    /私有|坐标|密钥|fail-closed/,
  );
  // 干净的单条款法条原文不被 citation 闸拦(citation 段允许法条原文)。
  assert.doesNotThrow(() => assertCitationSegmentClean([{ rag_doc_ref: "law:x", "法条原文": LAW_TEXT }]));
});

test("分域负样本(strict 域):图段夹私有判断字段 → assertPromptClean 仍抛,且在 fetch 前", async () => {
  const poisoned = cleanCtx();
  poisoned.graph_context.nodes[0].evidence_judgment_standard = "私有证据判断标准";
  const fetchSpy = fetchReturning({ "异议": [] });
  // 即便注入了带干净 excerpt 的 ragFetch,strict 域命中私有判断字段仍须先 fail-closed。
  const ragFetch = async () => [{ rag_doc_ref: "tencent-lke://law/x", excerpt: "第七十七条 干净原文供研判" }];
  await assert.rejects(
    () => llmCritique({ item: cleanItem(), graphContext: poisoned, env: KEYED_ENV, fetchImpl: fetchSpy, ragFetch }),
    /私有|红线|fail-closed/,
  );
  assert.equal(fetchSpy.calls.length, 0, "strict 域私有命中必须在 fetch 前抛");
});

test("红线分域口径:citation 闸允许法条全文、仍禁私有/坐标;输出闸 scanForbidden 全集不变(法条全文也禁)", () => {
  // citation 闸(scanCitationForbidden):法条全文放行。
  assert.equal(scanCitationForbidden({ "法条原文": FULL_LAW_BLOB }).length, 0, "citation 闸必须放行法条全文");
  // citation 闸:坐标/私有键名仍拦。
  assert.ok(scanCitationForbidden({ "法条原文": "正文 经度 31.2" }).length > 0, "citation 闸仍拦坐标");
  assert.ok(scanCitationForbidden({ evidence_judgment_standard: "x" }).length > 0, "citation 闸仍拦私有键名");
  // 输出闸(scanForbidden 全集):法条全文【必须】被拦 → 输出闸强度不变。
  assert.ok(scanForbidden({ note: FULL_LAW_BLOB }).length > 0, "输出闸必须拦法条全文(强度不变)");
});
