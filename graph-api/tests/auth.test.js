import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildWecomAppRedirectUrl, buildWecomLoginUrl, isReviewUser, isUserAllowed, issueSession, verifySession, sessionCookie,
} from "../src/auth.js";
import { createServer } from "../src/server.js";

const WECOM = {
  corpId: "ww-test-corp",
  agentId: "1000002",
  corpSecret: "secret",
  redirectUri: "https://graph.example.com/auth/wecom/callback",
  allowedUsers: [],
  reviewUsers: ["eto-candy", "admin-candy"],
  sessionSecret: "session-secret-for-test",
};

test("企业微信登录链接使用官方扫码端点", () => {
  const url = new URL(buildWecomLoginUrl(WECOM));
  assert.equal(url.host, "login.work.weixin.qq.com");
  assert.equal(url.pathname, "/wwlogin/sso/login");
  assert.equal(url.searchParams.get("login_type"), "CorpApp");
  assert.equal(url.searchParams.get("appid"), "ww-test-corp");
  assert.equal(url.searchParams.get("agentid"), "1000002");
});

test("会话签发可验证、过期失效、篡改失效", () => {
  const token = issueSession("eto-candy", "secret", 1000);
  assert.equal(verifySession(token, "secret", 2000), "eto-candy");
  assert.equal(verifySession(token, "secret", 1000 + 13 * 60 * 60 * 1000), null);
  assert.equal(verifySession(`${token}x`, "secret", 2000), null);
  assert.equal(verifySession(token, "other-secret", 2000), null);
});

test("空白名单放行全企业成员,白名单只放名单内成员", () => {
  assert.equal(isUserAllowed("anyone", WECOM), true);
  const limited = { ...WECOM, allowedUsers: ["eto-a", "eto-b"] };
  assert.equal(isUserAllowed("eto-a", limited), true);
  assert.equal(isUserAllowed("outsider", limited), false);
});

test("审核台名单只放行 ETO/admin,普通成员只能进知识库", () => {
  assert.equal(isReviewUser("eto-candy", WECOM), true);
  assert.equal(isReviewUser("admin-candy", WECOM), true);
  assert.equal(isReviewUser("regular-staff", WECOM), false);
});

test("企业微信回调跳回图谱前端路径,避免落到同域名企业官网", () => {
  const deployed = { ...WECOM, appBaseUrl: "/eco-execution-graph-internal/" };
  assert.equal(buildWecomAppRedirectUrl(deployed, { canReview: true }), "/eco-execution-graph-internal/app.html?workspace=review");
  assert.equal(buildWecomAppRedirectUrl(deployed, { canReview: false }), "/eco-execution-graph-internal/app.html");
  assert.equal(buildWecomAppRedirectUrl(WECOM, { canReview: true }), "/?workspace=review");
});

test("审核员回调可从 public 图谱入口推断 internal 审核壳", () => {
  const deployed = { ...WECOM, appBaseUrl: "https://www.yueen.cc/eco-execution-graph/" };
  assert.equal(
    buildWecomAppRedirectUrl(deployed, { canReview: true }),
    "https://www.yueen.cc/eco-execution-graph-internal/app.html?workspace=review",
  );
  assert.equal(
    buildWecomAppRedirectUrl(deployed, { canReview: false }),
    "https://www.yueen.cc/eco-execution-graph/app.html",
  );
  const explicit = { ...deployed, reviewAppBaseUrl: "https://internal.example.com/graph/" };
  assert.equal(
    buildWecomAppRedirectUrl(explicit, { canReview: true }),
    "https://internal.example.com/graph/app.html?workspace=review",
  );
});

test("企业微信回调签发审核员会话,可直接访问审核接口", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-auth-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const server = createServer({
    stagingPath: path.join(temp, "field-events.jsonl"),
    apiToken: "bearer-only-secret",
    wecom: { ...WECOM, appBaseUrl: "/eco-execution-graph-internal/" },
    exchangeCode: async (code) => {
      assert.equal(code, "good-code");
      return "eto-candy";
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const denied = await fetch(`${base}/api/review/field-events`);
    assert.equal(denied.status, 401);

    const callback = await fetch(`${base}/auth/wecom/callback?code=good-code`, { redirect: "manual" });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), "/eco-execution-graph-internal/app.html?workspace=review");
    const cookie = callback.headers.get("set-cookie");
    assert.match(cookie, /eco_graph_session=/);
    assert.match(cookie, /HttpOnly/);

    const sessionValue = cookie.split(";")[0];
    const session = await fetch(`${base}/auth/session`, { headers: { cookie: sessionValue } });
    assert.equal(session.status, 200);
    const sessionBody = await session.json();
    assert.equal(sessionBody.userid, "eto-candy");
    assert.equal(sessionBody.can_review, true);

    const allowed = await fetch(`${base}/api/review/field-events`, { headers: { cookie: sessionValue } });
    assert.equal(allowed.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("普通企业微信成员可登录但不能访问审核台 API", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-auth-member-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const graphPath = path.join(temp, "graph.json");
  const publicationPath = path.join(temp, "ecocheck.json");
  await writeFile(graphPath, JSON.stringify({
    nodes: [{ node_id: "issue:member", node_type: "issue_type", name: "成员可读", tier: "shared", review_status: "APPROVED_BASELINE" }],
    edges: [],
  }), "utf8");
  await writeFile(publicationPath, JSON.stringify({ items: [] }), "utf8");
  const server = createServer({
    stagingPath: path.join(temp, "field-events.jsonl"),
    apiToken: "bearer-only-secret",
    contextGraphPath: graphPath,
    contextPublicationPath: publicationPath,
    wecom: { ...WECOM, appBaseUrl: "/eco-execution-graph-internal/" },
    exchangeCode: async () => "regular-staff",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const callback = await fetch(`${base}/auth/wecom/callback?code=member-code`, { redirect: "manual" });
    assert.equal(callback.status, 302);
    assert.equal(callback.headers.get("location"), "/eco-execution-graph-internal/app.html");
    const sessionValue = callback.headers.get("set-cookie").split(";")[0];

    const session = await fetch(`${base}/auth/session`, { headers: { cookie: sessionValue } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).can_review, false);

    const context = await fetch(`${base}/api/graph/context?node_id=issue%3Amember`, { headers: { cookie: sessionValue } });
    assert.equal(context.status, 200);

    const review = await fetch(`${base}/api/review/field-events`, { headers: { cookie: sessionValue } });
    assert.equal(review.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("未配置企业微信时登录入口返回 503 而不是半开放", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-auth-off-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const server = createServer({
    stagingPath: path.join(temp, "field-events.jsonl"),
    wecom: { corpId: "", agentId: "", corpSecret: "", redirectUri: "", allowedUsers: [], sessionSecret: "" },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const start = await fetch(`${base}/auth/wecom/start`, { redirect: "manual" });
    assert.equal(start.status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});

test("会话 cookie 默认带安全属性", () => {
  const cookie = sessionCookie("token-value");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
});
