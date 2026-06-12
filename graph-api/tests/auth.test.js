import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildWecomLoginUrl, isUserAllowed, issueSession, verifySession, sessionCookie,
} from "../src/auth.js";
import { createServer } from "../src/server.js";

const WECOM = {
  corpId: "ww-test-corp",
  agentId: "1000002",
  corpSecret: "secret",
  redirectUri: "https://graph.example.com/auth/wecom/callback",
  allowedUsers: [],
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

test("企业微信回调签发会话,会话可直接访问审核接口", async () => {
  const temp = path.join(os.tmpdir(), `eco-graph-auth-${Date.now()}`);
  await mkdir(temp, { recursive: true });
  const server = createServer({
    stagingPath: path.join(temp, "field-events.jsonl"),
    apiToken: "bearer-only-secret",
    wecom: WECOM,
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
    const cookie = callback.headers.get("set-cookie");
    assert.match(cookie, /eco_graph_session=/);
    assert.match(cookie, /HttpOnly/);

    const sessionValue = cookie.split(";")[0];
    const session = await fetch(`${base}/auth/session`, { headers: { cookie: sessionValue } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).userid, "eto-candy");

    const allowed = await fetch(`${base}/api/review/field-events`, { headers: { cookie: sessionValue } });
    assert.equal(allowed.status, 200);
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
