import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fixture from "../../data/fixtures/ecocheck-field-event-fixture.json" with { type: "json" };
import profileGapFixture from "../../data/fixtures/ecocheck-profile-gap-confirmed-fixture.json" with { type: "json" };
import { createServer, isAuthorized, validateRuntimeConfig } from "../src/server.js";
import { buildGraphContextResponse } from "../src/graph-context.js";

test("未配置访问令牌时允许本地开发请求", () => {
  assert.equal(isAuthorized({}, ""), true);
});

test("配置访问令牌后必须使用 Bearer 头", () => {
  assert.equal(isAuthorized({}, "secret-for-test"), false);
  assert.equal(isAuthorized({ authorization: "Bearer wrong" }, "secret-for-test"), false);
  assert.equal(isAuthorized({ authorization: "Bearer secret-for-test" }, "secret-for-test"), true);
});

test("生产环境未配置访问令牌时拒绝启动", () => {
  assert.throws(() => validateRuntimeConfig({ nodeEnv: "production", apiToken: "" }), /必须设置/);
  assert.doesNotThrow(() => validateRuntimeConfig({ nodeEnv: "production", apiToken: "secret-for-test" }));
});

test("决策接口提交后重新查询状态必须持久化", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-review-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const stagingPath = path.join(temp, "field-events.jsonl");
  const server = createServer({ stagingPath, apiToken: "secret-for-test" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    "content-type": "application/json",
    authorization: "Bearer secret-for-test",
  };

  try {
    const create = await fetch(`${base}/api/ecocheck/field-events`, {
      method: "POST",
      headers,
      body: JSON.stringify(fixture),
    });
    assert.equal(create.status, 201);
    const created = await create.json();
    const id = created.item["审核编号"];

    const decision = await fetch(`${base}/api/review/field-events/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      headers,
      body: JSON.stringify({ "审核结论": "通过，进入聚合候选", "审核人": "ETO", "审核意见": "同意入图" }),
    });
    assert.equal(decision.status, 200);

    const detail = await fetch(`${base}/api/review/field-events/${encodeURIComponent(id)}`, { headers });
    assert.equal(detail.status, 200);
    const persisted = await detail.json();
    assert.equal(persisted.item["当前审核状态"], "已通过(待聚合)");
    assert.equal(persisted.item["是否允许进入聚合"], true);
    assert.equal(persisted.item["审核意见"], "同意入图");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("历史回档字段 POST 后进入待审核中文记录", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-history-review-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const stagingPath = path.join(temp, "field-events.jsonl");
  const server = createServer({ stagingPath, apiToken: "secret-for-test" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    "content-type": "application/json",
    authorization: "Bearer secret-for-test",
  };
  const payload = structuredClone(fixture);
  payload.event_type = "ISSUE_ETO_REVIEWED";
  payload.field_issue_uid = "history-api-001";
  payload.source_tags = ["历史回档", "机器补填"];
  payload.backfill_context = {
    batch_id: "ecocheck-history-2026-02-06",
    source_period: { from: "2026-02", to: "2026-06" },
    source_kind: "historical_archive",
  };
  payload.field_completion = {
    required_fields: [{ field: "问题类型", status: "已机器补填", value: "危废标签缺失" }],
    candidate_fields: [{ field: "法规/标准候选", status: "已机器补填", value: ["扣分规则:S07"] }],
    not_forced_fields: [{ field: "精确位置", status: "不回填", reason: "不推断精确位置" }],
  };
  payload.machine_fill_provenance = [{ field: "问题类型", method: "deduct_rule_key优先", confidence: 0.74 }];
  payload.rectification_history_summary = {
    latest_status: "VERIFIED",
    total_records: 1,
    latest_submit_note_summary: "已补齐标签。",
    eto_review_note_summary: "复核通过。",
  };

  try {
    const create = await fetch(`${base}/api/ecocheck/field-events`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    assert.equal(create.status, 201);
    const created = await create.json();
    const id = created.item["审核编号"];

    const detail = await fetch(`${base}/api/review/field-events/${encodeURIComponent(id)}`, { headers });
    assert.equal(detail.status, 200);
    const persisted = await detail.json();
    assert.equal(persisted.item["当前审核状态"], "待审核");
    assert.deepEqual(persisted.item["信源标签"], ["历史回档", "机器补填"]);
    assert.equal(persisted.item["回档批次"]["批次编号"], "ecocheck-history-2026-02-06");
    assert.equal(persisted.item["字段补齐状态"]["必补字段"][0]["字段"], "问题类型");
    assert.equal(persisted.item["机器补填说明"][0]["字段"], "问题类型");
    assert.equal(persisted.item["整改历史摘要"]["最新状态"], "VERIFIED");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("审核列表默认隐藏系统测试和非运行库记录", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-review-runtime-filter-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const stagingPath = path.join(temp, "field-events.jsonl");
  const server = createServer({ stagingPath, apiToken: "secret-for-test" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    "content-type": "application/json",
    authorization: "Bearer secret-for-test",
  };
  const runtimePayload = structuredClone(fixture);
  runtimePayload.field_issue_uid = "runtime-issue-001";
  runtimePayload.business_key = "runtime-inspection-001";
  runtimePayload.source_context.company_id = "internal-demo-company-001";
  const smokePayload = structuredClone(fixture);
  smokePayload.field_issue_uid = "synthetic-smoke-001";
  smokePayload.business_key = "synthetic-smoke-001";
  smokePayload.source_tags = ["synthetic_smoke", "not_for_runtime_import"];

  try {
    for (const payload of [runtimePayload, smokePayload]) {
      const create = await fetch(`${base}/api/ecocheck/field-events`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      assert.equal(create.status, 201);
    }

    const queue = await fetch(`${base}/api/review/field-events`, { headers });
    assert.equal(queue.status, 200);
    const body = await queue.json();
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0]["业务幂等键"], "runtime-inspection-001");
    assert.equal(body.filtered.non_runtime, 1);
    assert.equal(body.filtered.total, 2);

    const debugQueue = await fetch(`${base}/api/review/field-events?include_non_runtime=1`, { headers });
    assert.equal(debugQueue.status, 200);
    const debugBody = await debugQueue.json();
    assert.equal(debugBody.items.length, 2);
    assert.equal(debugBody.filtered.non_runtime, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("profile-gap 事件 POST 后作为非聚合治理记录保存", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-profile-gap-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const stagingPath = path.join(temp, "field-events.jsonl");
  const server = createServer({ stagingPath, apiToken: "secret-for-test" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    "content-type": "application/json",
    authorization: "Bearer secret-for-test",
  };

  try {
    const create = await fetch(`${base}/api/ecocheck/field-events`, {
      method: "POST",
      headers,
      body: JSON.stringify(profileGapFixture),
    });
    assert.equal(create.status, 201);
    const created = await create.json();
    assert.equal(created.item["事件类别"], "profile_gap_confirmed");
    assert.equal(created.item["是否允许进入聚合"], false);
    assert.equal(created.item["业务幂等键"], "synthetic-profile-gap-001");

    const batch = await fetch(`${base}/api/aggregate/pitfall-batches`, {
      method: "POST",
      headers,
      body: JSON.stringify({ batch_id: "profile-gap-test" }),
    });
    assert.equal(batch.status, 200);
    const body = await batch.json();
    assert.equal(body.rows.length, 0);
    assert.equal(body.sample_limited.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("超大请求体会被拒绝", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-review-large-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const server = createServer({ stagingPath: path.join(temp, "field-events.jsonl"), maxBodyBytes: 32 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${base}/api/ecocheck/field-events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture),
    });
    assert.equal(response.status, 413);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("图谱上下文接口返回已审核上下文和法规技术规范瘦条款", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-context-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const graphPath = path.join(temp, "graph.json");
  const publicationPath = path.join(temp, "ecocheck.json");
  await writeFile(graphPath, JSON.stringify({
    nodes: [
      {
        node_id: "issue:hw:label",
        node_type: "issue_type",
        name: "危废标签不规范",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
      },
      {
        node_id: "obl:hw:label",
        node_type: "law_obligation",
        name: "危废标签管理义务",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
      },
      {
        node_id: "law:swl:art77",
        node_type: "law_article",
        name: "固体废物污染环境防治法 第七十七条",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        attrs: {
          law_name: "固体废物污染环境防治法",
          article_no: "第七十七条",
          rag_doc_ref: "tencent-lke://law/swl/art77",
          Content: "不应输出的 RAG 原文",
        },
      },
      {
        node_id: "spec:gb18597:label",
        node_type: "tech_spec",
        name: "GB 18597 危险废物贮存污染控制标准·标签管理",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        attrs: {
          rag_doc_ref: "tencent-lke://spec/gb18597/label",
          summary: "危险废物标签管理要求摘要",
        },
      },
    ],
    edges: [
      {
        edge_id: "edge:regulated:label",
        from: "issue:hw:label",
        to: "obl:hw:label",
        edge_type: "regulated_by",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        source_ref: "src:test",
        legal_basis_status: "internal_reviewed",
        confidence: 0.8,
        confidence_reason: ["MANUAL_REVIEWED"],
      },
      {
        edge_id: "edge:obligation:art77",
        from: "obl:hw:label",
        to: "law:swl:art77",
        edge_type: "obligation_of",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        source_ref: "src:test",
        legal_basis_status: "internal_reviewed",
        confidence: 0.8,
        confidence_reason: ["MANUAL_REVIEWED"],
      },
      {
        edge_id: "edge:limited:label",
        from: "issue:hw:label",
        to: "spec:gb18597:label",
        edge_type: "limited_by",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        source_ref: "src:test",
        legal_basis_status: "internal_reviewed",
        confidence: 0.8,
        confidence_reason: ["MANUAL_REVIEWED"],
      },
    ],
  }), "utf8");
  await writeFile(publicationPath, JSON.stringify({
    items: [
      {
        rag_doc_ref: "tencent-lke://law/swl/art77",
        review_status: "approved",
        legal_basis_status: "internal_reviewed",
        citation_locator: "第七十七条",
        cache_policy: "metadata_only",
        raw_cached: false,
      },
      {
        rag_doc_ref: "tencent-lke://spec/gb18597/label",
        review_status: "approved",
        legal_basis_status: "internal_reviewed",
        citation_locator: "GB 18597",
        cache_policy: "metadata_only",
        raw_cached: false,
      },
    ],
  }), "utf8");

  const server = createServer({
    stagingPath: path.join(temp, "field-events.jsonl"),
    apiToken: "secret-for-test",
    contextGraphPath: graphPath,
    contextPublicationPath: publicationPath,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${base}/api/graph/context?node_id=issue%3Ahw%3Alabel&depth=2`, {
      headers: { authorization: "Bearer secret-for-test" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const text = JSON.stringify(body);
    assert.equal(body.approval_basis, "ETO_APPROVED_IN_GRAPH");
    assert.equal(body.human_review_required, false);
    assert.equal(body.machine_gate_status, "pass");
    assert.equal(body.law_refs.length, 1);
    assert.equal(body.tech_spec_refs.length, 1);
    assert.equal(body.law_refs[0].article_no, "第七十七条");
    assert.equal(body.tech_spec_refs[0].rag_doc_ref, "tencent-lke://spec/gb18597/label");
    assert.equal(body.trace.edge_ids.length, 3);
    assert.equal(text.includes("Content"), false);
    assert.equal(text.includes("不应输出的 RAG 原文"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("图谱上下文接口复用 API Bearer 认证", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-context-auth-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const graphPath = path.join(temp, "graph.json");
  const publicationPath = path.join(temp, "ecocheck.json");
  await writeFile(graphPath, JSON.stringify({
    nodes: [{ node_id: "issue:auth", node_type: "issue_type", name: "认证测试", tier: "shared", review_status: "APPROVED_BASELINE" }],
    edges: [],
  }), "utf8");
  await writeFile(publicationPath, JSON.stringify({ items: [] }), "utf8");

  const server = createServer({
    stagingPath: path.join(temp, "field-events.jsonl"),
    apiToken: "secret-for-test",
    contextGraphPath: graphPath,
    contextPublicationPath: publicationPath,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const denied = await fetch(`${base}/api/graph/context?node_id=issue%3Aauth`);
    assert.equal(denied.status, 401);

    const allowed = await fetch(`${base}/api/graph/context?node_id=issue%3Aauth`, {
      headers: { authorization: "Bearer secret-for-test" },
    });
    assert.equal(allowed.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("图谱上下文接口阻断未发布或定位不足的瘦条款", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-context-blocked-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const graphPath = path.join(temp, "graph.json");
  const publicationPath = path.join(temp, "ecocheck.json");
  await writeFile(graphPath, JSON.stringify({
    nodes: [
      { node_id: "issue:hw:source-level", node_type: "issue_type", name: "待补定位问题", tier: "shared", review_status: "APPROVED_BASELINE" },
      {
        node_id: "law:source-level",
        node_type: "law_article",
        name: "待补定位法规",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        attrs: { law_name: "待补定位法规", article_no: "第一条", rag_doc_ref: "tencent-lke://law/source-level" },
      },
    ],
    edges: [
      {
        edge_id: "edge:source-level",
        from: "issue:hw:source-level",
        to: "law:source-level",
        edge_type: "regulated_by",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        source_ref: "src:test",
        legal_basis_status: "internal_reviewed",
        confidence: 0.7,
        confidence_reason: ["MANUAL_REVIEWED"],
      },
    ],
  }), "utf8");
  await writeFile(publicationPath, JSON.stringify({ items: [] }), "utf8");

  const server = createServer({
    stagingPath: path.join(temp, "field-events.jsonl"),
    apiToken: "secret-for-test",
    contextGraphPath: graphPath,
    contextPublicationPath: publicationPath,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${base}/api/graph/context?q=待补定位&depth=1`, {
      headers: { authorization: "Bearer secret-for-test" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.machine_gate_status, "partial");
    assert.equal(body.law_refs.length, 0);
    assert.equal(body.blocked_refs.length, 1);
    assert.equal(body.blocked_refs[0].reason, "not_in_publication_bundle_or_source_level");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("图谱上下文接口阻断缺少条款号或标准号的瘦条款", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-context-locator-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const graphPath = path.join(temp, "graph.json");
  const publicationPath = path.join(temp, "ecocheck.json");
  await writeFile(graphPath, JSON.stringify({
    nodes: [
      { node_id: "issue:missing-locator", node_type: "issue_type", name: "定位不足问题", tier: "shared", review_status: "APPROVED_BASELINE" },
      {
        node_id: "law:missing-locator",
        node_type: "law_article",
        name: "定位不足法规",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        attrs: { law_name: "定位不足法规", rag_doc_ref: "tencent-lke://law/missing-locator" },
      },
    ],
    edges: [
      {
        edge_id: "edge:missing-locator",
        from: "issue:missing-locator",
        to: "law:missing-locator",
        edge_type: "regulated_by",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        source_ref: "src:test",
        legal_basis_status: "internal_reviewed",
        confidence: 0.7,
        confidence_reason: ["MANUAL_REVIEWED"],
      },
    ],
  }), "utf8");
  await writeFile(publicationPath, JSON.stringify({
    items: [{
      rag_doc_ref: "tencent-lke://law/missing-locator",
      review_status: "approved",
      legal_basis_status: "internal_reviewed",
      citation_locator: "第一条",
      cache_policy: "metadata_only",
      raw_cached: false,
    }],
  }), "utf8");

  const server = createServer({
    stagingPath: path.join(temp, "field-events.jsonl"),
    apiToken: "secret-for-test",
    contextGraphPath: graphPath,
    contextPublicationPath: publicationPath,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(`${base}/api/graph/context?node_id=issue%3Amissing-locator`, {
      headers: { authorization: "Bearer secret-for-test" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.machine_gate_status, "partial");
    assert.equal(body.law_refs.length, 0);
    assert.equal(body.blocked_refs[0].reason, "missing_article_no_or_locator");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("图谱上下文按 legal_basis_status 表驱动阻断未确认法律依据", () => {
  for (const legalStatus of ["candidate", "disputed", "no_legal_basis", undefined]) {
    const graph = {
      nodes: [
        { node_id: "issue:legal-status", node_type: "issue_type", name: "法律状态测试", tier: "shared", review_status: "APPROVED_BASELINE" },
        {
          node_id: "law:legal-status",
          node_type: "law_article",
          name: "法律状态测试法 第一条",
          tier: "shared",
          review_status: "APPROVED_BASELINE",
          attrs: { law_name: "法律状态测试法", article_no: "第一条", rag_doc_ref: "tencent-lke://law/legal-status" },
        },
      ],
      edges: [
        {
          edge_id: "edge:legal-status",
          from: "issue:legal-status",
          to: "law:legal-status",
          edge_type: "regulated_by",
          tier: "shared",
          review_status: "APPROVED_BASELINE",
          source_ref: "src:test",
          legal_basis_status: legalStatus,
          confidence: 0.7,
          confidence_reason: ["MANUAL_REVIEWED"],
        },
      ],
    };
    const publication = {
      items: [{
        rag_doc_ref: "tencent-lke://law/legal-status",
        review_status: "approved",
        legal_basis_status: "internal_reviewed",
        citation_locator: "第一条",
        cache_policy: "metadata_only",
        raw_cached: false,
      }],
    };

    const body = buildGraphContextResponse({ graph, publication, nodeId: "issue:legal-status", depth: 1 });
    assert.equal(body.machine_gate_status, "partial");
    assert.equal(body.law_refs.length, 0);
    assert.equal(body.blocked_refs.length, 1);
    assert.match(body.blocked_refs[0].reason, /legal_basis_status=/);
  }
});

test("图谱上下文按 publication item 状态阻断未通过发布门禁的瘦条款", () => {
  for (const itemPatch of [
    { review_status: "candidate" },
    { legal_basis_status: "candidate" },
    { legal_basis_status: "disputed" },
    { legal_basis_status: "no_legal_basis" },
    { citation_locator: "source-level" },
    { raw_cached: true },
  ]) {
    const graph = {
      nodes: [
        { node_id: "issue:publication-status", node_type: "issue_type", name: "发布状态测试", tier: "shared", review_status: "APPROVED_BASELINE" },
        {
          node_id: "law:publication-status",
          node_type: "law_article",
          name: "发布状态测试法 第一条",
          tier: "shared",
          review_status: "APPROVED_BASELINE",
          attrs: { law_name: "发布状态测试法", article_no: "第一条", rag_doc_ref: "tencent-lke://law/publication-status" },
        },
      ],
      edges: [
        {
          edge_id: "edge:publication-status",
          from: "issue:publication-status",
          to: "law:publication-status",
          edge_type: "regulated_by",
          tier: "shared",
          review_status: "APPROVED_BASELINE",
          source_ref: "src:test",
          legal_basis_status: "internal_reviewed",
          confidence: 0.7,
          confidence_reason: ["MANUAL_REVIEWED"],
        },
      ],
    };
    const item = {
      rag_doc_ref: "tencent-lke://law/publication-status",
      review_status: "approved",
      legal_basis_status: "internal_reviewed",
      citation_locator: "第一条",
      cache_policy: "metadata_only",
      raw_cached: false,
      ...itemPatch,
    };

    const body = buildGraphContextResponse({ graph, publication: { items: [item] }, nodeId: "issue:publication-status", depth: 1 });
    assert.equal(body.machine_gate_status, "partial");
    assert.equal(body.law_refs.length, 0);
    assert.equal(body.blocked_refs[0].reason, "not_in_publication_bundle_or_source_level");
  }
});

test("图谱上下文遇到同一瘦条款冲突法律状态时顺序无关地阻断", () => {
  const nodes = [
    { node_id: "issue:conflict", node_type: "issue_type", name: "冲突状态测试", tier: "shared", review_status: "APPROVED_BASELINE" },
    {
      node_id: "law:conflict",
      node_type: "law_article",
      name: "冲突状态测试法 第一条",
      tier: "shared",
      review_status: "APPROVED_BASELINE",
      attrs: { law_name: "冲突状态测试法", article_no: "第一条", rag_doc_ref: "tencent-lke://law/conflict" },
    },
  ];
  const good = {
    edge_id: "edge:conflict:good",
    from: "issue:conflict",
    to: "law:conflict",
    edge_type: "regulated_by",
    tier: "shared",
    review_status: "APPROVED_BASELINE",
    source_ref: "src:test",
    legal_basis_status: "internal_reviewed",
    confidence: 0.7,
    confidence_reason: ["MANUAL_REVIEWED"],
  };
  const bad = { ...good, edge_id: "edge:conflict:bad", legal_basis_status: "disputed" };
  const publication = {
    items: [{
      rag_doc_ref: "tencent-lke://law/conflict",
      review_status: "approved",
      legal_basis_status: "internal_reviewed",
      citation_locator: "第一条",
      cache_policy: "metadata_only",
      raw_cached: false,
    }],
  };

  for (const edges of [[good, bad], [bad, good]]) {
    const body = buildGraphContextResponse({ graph: { nodes, edges }, publication, nodeId: "issue:conflict", depth: 1 });
    assert.equal(body.machine_gate_status, "partial");
    assert.equal(body.law_refs.length, 0);
    assert.equal(body.blocked_refs[0].reason, "legal_basis_status=disputed");
  }
});

test("图谱上下文不返回 private source_ref", () => {
  const graph = {
    sources: [
      { source_id: "src:private", source_type: "field_event", tier: "private", review_status: "APPROVED_BASELINE" },
    ],
    nodes: [
      { node_id: "issue:private-source", node_type: "issue_type", name: "私有来源测试", tier: "shared", review_status: "APPROVED_BASELINE" },
      {
        node_id: "law:private-source",
        node_type: "law_article",
        name: "私有来源测试法 第一条",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        attrs: { law_name: "私有来源测试法", article_no: "第一条", rag_doc_ref: "tencent-lke://law/private-source" },
      },
    ],
    edges: [
      {
        edge_id: "edge:private-source",
        from: "issue:private-source",
        to: "law:private-source",
        edge_type: "regulated_by",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        source_ref: "src:private",
        legal_basis_status: "internal_reviewed",
        confidence: 0.7,
        confidence_reason: ["MANUAL_REVIEWED"],
      },
    ],
  };
  const publication = {
    items: [{
      rag_doc_ref: "tencent-lke://law/private-source",
      review_status: "approved",
      legal_basis_status: "internal_reviewed",
      citation_locator: "第一条",
      cache_policy: "metadata_only",
      raw_cached: false,
    }],
  };

  const body = buildGraphContextResponse({ graph, publication, nodeId: "issue:private-source", depth: 1 });
  const text = JSON.stringify(body);
  assert.equal(body.law_refs.length, 0);
  assert.equal(text.includes("src:private"), false);
});

test("详情接口附确定性副驾研判且只读现算不落库", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-copilot-detail-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const stagingPath = path.join(temp, "field-events.jsonl");
  const graphPath = path.join(temp, "graph.json");
  const publicationPath = path.join(temp, "ecocheck.json");
  // 图谱含 fixture 的问题类型(issue:hw:label-incomplete)+ 现行有效法条 + 证据应有项节点,
  // 让 buildGraphContextResponse 命中真实邻域,backbone 走「现算」而非降级态。
  await writeFile(graphPath, JSON.stringify({
    nodes: [
      { node_id: "issue:hw:label-incomplete", node_type: "issue_type", name: "危废标签内容不完整", tier: "shared", review_status: "APPROVED_BASELINE" },
      { node_id: "obl:hw:label", node_type: "law_obligation", name: "危废标签管理义务", tier: "shared", review_status: "APPROVED_BASELINE" },
      {
        node_id: "law:swl:art77",
        node_type: "law_article",
        name: "固体废物污染环境防治法 第七十七条",
        tier: "shared",
        review_status: "APPROVED_BASELINE",
        attrs: { law_name: "固体废物污染环境防治法", article_no: "第七十七条", rag_doc_ref: "tencent-lke://law/swl/art77", effective_status: "现行有效" },
      },
      { node_id: "evidence:label-photo", node_type: "evidence_field_requirement", name: "标签照片", tier: "shared", review_status: "APPROVED_BASELINE" },
    ],
    edges: [
      { edge_id: "edge:regulated:label", from: "issue:hw:label-incomplete", to: "obl:hw:label", edge_type: "regulated_by", tier: "shared", review_status: "APPROVED_BASELINE", source_ref: "src:test", legal_basis_status: "internal_reviewed", confidence: 0.8, confidence_reason: ["MANUAL_REVIEWED"] },
      { edge_id: "edge:obligation:art77", from: "obl:hw:label", to: "law:swl:art77", edge_type: "obligation_of", tier: "shared", review_status: "APPROVED_BASELINE", source_ref: "src:test", legal_basis_status: "internal_reviewed", confidence: 0.8, confidence_reason: ["MANUAL_REVIEWED"] },
      { edge_id: "edge:evidenced:label", from: "issue:hw:label-incomplete", to: "evidence:label-photo", edge_type: "evidenced_by", tier: "shared", review_status: "APPROVED_BASELINE", source_ref: "src:test", legal_basis_status: "internal_reviewed", confidence: 0.8, confidence_reason: ["MANUAL_REVIEWED"] },
    ],
  }), "utf8");
  await writeFile(publicationPath, JSON.stringify({
    items: [{
      rag_doc_ref: "tencent-lke://law/swl/art77",
      review_status: "approved",
      legal_basis_status: "internal_reviewed",
      citation_locator: "第七十七条",
      cache_policy: "metadata_only",
      raw_cached: false,
    }],
  }), "utf8");

  const server = createServer({ stagingPath, apiToken: "secret-for-test", contextGraphPath: graphPath, contextPublicationPath: publicationPath });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "content-type": "application/json", authorization: "Bearer secret-for-test" };

  try {
    const create = await fetch(`${base}/api/ecocheck/field-events`, { method: "POST", headers, body: JSON.stringify(fixture) });
    assert.equal(create.status, 201);
    const id = (await create.json()).item["审核编号"];

    const detail = await fetch(`${base}/api/review/field-events/${encodeURIComponent(id)}`, { headers });
    assert.equal(detail.status, 200);
    const persisted = await detail.json();
    const copilot = persisted.item["副驾研判"];
    assert.ok(copilot, "详情应附副驾研判");
    // 走真实 backbone(非降级态):带 copilot.v1 版本号 + 完整三段结构。
    assert.equal(copilot["副驾版本"], "copilot.v1");
    assert.equal(typeof copilot["整体研判"], "object");
    assert.ok("补足" in copilot);
    assert.ok(Array.isArray(copilot["异议"]));
    assert.ok("上下文门禁" in copilot);
    // advisory-only:副驾绝不写最终审核状态。
    assert.equal(copilot["整体研判"]["建议方向"] === undefined, false);
    // 命中真实问题类型节点。
    assert.equal(copilot["补足"]["命中问题类型"]?.node_id, "issue:hw:label-incomplete");

    // 只读现算不落库:store 二次 readAll(经 list 接口 include_non_runtime)不含「副驾研判」,
    // 直接读 staging 文件再确认未持久化。
    const queue = await fetch(`${base}/api/review/field-events?include_non_runtime=1`, { headers });
    assert.equal(queue.status, 200);
    const stored = (await queue.json()).items.find((row) => row["审核编号"] === id);
    assert.ok(stored, "list 应能取回该记录");
    assert.equal("副驾研判" in stored, false, "副驾研判不得落库");
    const raw = await readFile(stagingPath, "utf8");
    assert.equal(raw.includes("副驾研判"), false, "staging 文件不得含副驾研判");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});
