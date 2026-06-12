import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fixture from "../../data/fixtures/ecocheck-field-event-fixture.json" with { type: "json" };
import { createServer, isAuthorized, validateRuntimeConfig } from "../src/server.js";

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
