import crypto from "node:crypto";

// 企业微信扫码登录 + HMAC 会话。
// 设计约束:内部/小范围使用,只认企业微信成员身份,不做手机号/邮箱注册。
// 官方端点(developer.work.weixin.qq.com 文档 98152 / 91120):
//   扫码授权: https://login.work.weixin.qq.com/wwlogin/sso/login
//   code 换身份: https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时,覆盖一个工作日

export function wecomConfigFromEnv(env = process.env) {
  return {
    corpId: env.ECO_GRAPH_WECOM_CORP_ID || "",
    agentId: env.ECO_GRAPH_WECOM_AGENT_ID || "",
    corpSecret: env.ECO_GRAPH_WECOM_CORP_SECRET || "",
    redirectUri: env.ECO_GRAPH_WECOM_REDIRECT_URI || "",
    allowedUsers: (env.ECO_GRAPH_WECOM_ALLOWED_USERS || "")
      .split(",").map((item) => item.trim()).filter(Boolean),
    sessionSecret: env.ECO_GRAPH_SESSION_SECRET || "",
  };
}

export function isWecomConfigured(config) {
  return Boolean(config.corpId && config.agentId && config.corpSecret && config.redirectUri && config.sessionSecret);
}

export function buildWecomLoginUrl(config, state = "eco-graph") {
  const params = new URLSearchParams({
    login_type: "CorpApp",
    appid: config.corpId,
    agentid: config.agentId,
    redirect_uri: config.redirectUri,
    state,
  });
  return `https://login.work.weixin.qq.com/wwlogin/sso/login?${params.toString()}`;
}

// code → userid。fetchImpl 可注入,测试不出网。
export async function exchangeWecomCode(code, config, fetchImpl = fetch) {
  const tokenRes = await fetchImpl(
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(config.corpId)}&corpsecret=${encodeURIComponent(config.corpSecret)}`,
  );
  const tokenData = await tokenRes.json();
  if (tokenData.errcode) throw new Error(`企业微信获取 access_token 失败:${tokenData.errmsg || tokenData.errcode}`);
  const userRes = await fetchImpl(
    `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${encodeURIComponent(tokenData.access_token)}&code=${encodeURIComponent(code)}`,
  );
  const userData = await userRes.json();
  if (userData.errcode) throw new Error(`企业微信换取身份失败:${userData.errmsg || userData.errcode}`);
  if (!userData.userid) throw new Error("非本企业成员,拒绝登录");
  return userData.userid;
}

export function isUserAllowed(userid, config) {
  if (!config.allowedUsers.length) return true; // 空白名单 = 放行全企业成员
  return config.allowedUsers.includes(userid);
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueSession(userid, secret, now = Date.now()) {
  const expiry = now + SESSION_TTL_MS;
  const payload = `${Buffer.from(userid, "utf8").toString("base64url")}.${expiry}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(parts[2]);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  if (Number(parts[1]) < now) return null;
  try {
    return Buffer.from(parts[0], "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function parseCookies(header = "") {
  const out = {};
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index > 0) out[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return out;
}

export function sessionCookie(token, { secure = true } = {}) {
  const attrs = ["Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`];
  if (secure) attrs.push("Secure");
  return `eco_graph_session=${token}; ${attrs.join("; ")}`;
}
