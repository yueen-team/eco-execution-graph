import "./login.css";

const notice = document.getElementById("loginNotice");
const wecomButton = document.getElementById("wecomLogin");
const wecomHint = document.getElementById("wecomHint");
const APP_BASE = import.meta.env.BASE_URL || "/";
const GRAPH_API_BASE = (import.meta.env.VITE_GRAPH_API_BASE || "https://www.yueen.cc/container-eco-execution-graph").replace(/\/$/, "");

function appPath(path = "") {
  return `${APP_BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function apiPath(path) {
  return `${GRAPH_API_BASE}/${path.replace(/^\//, "")}`;
}

function setNotice(text, ok = false) {
  notice.textContent = text;
  notice.className = `login-notice${ok ? " ok" : ""}`;
  notice.hidden = !text;
}

async function fetchJson(path, options) {
  const res = await fetch(path, { cache: "no-store", ...options });
  let data = null;
  try { data = await res.json(); } catch { /* 非 JSON 响应按状态码处理 */ }
  return { ok: res.ok, status: res.status, data };
}

async function boot() {
  // 已有企业微信会话 → 直接进入内部工作区
  const session = await fetchJson(apiPath("/auth/session")).catch(() => null);
  if (session?.ok) {
    setNotice(`已登录:${session.data?.userid || ""},正在进入…`, true);
    const target = session.data?.can_review ? "app.html?workspace=review" : "app.html";
    window.location.replace(appPath(target));
    return;
  }
  if (session && session.data?.wecom_configured === false) {
    wecomButton.disabled = true;
    wecomHint.textContent = "企业微信登录尚未在服务端配置(ECO_GRAPH_WECOM_*);可先使用内部访问令牌。";
  }
}

wecomButton.addEventListener("click", () => {
  window.location.href = apiPath("/auth/wecom/start");
});

document.getElementById("tokenLogin").addEventListener("click", async () => {
  const token = document.getElementById("tokenInput").value.trim();
  if (!token) {
    setNotice("请先粘贴内部访问令牌。");
    return;
  }
  const check = await fetchJson(apiPath("/api/review/field-events"), {
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (check?.ok) {
    sessionStorage.setItem("ecoGraphReviewToken", token);
    setNotice("令牌有效,正在进入审核台…", true);
    window.location.href = appPath("app.html?workspace=review");
  } else {
    setNotice(check?.data?.reason || "令牌无效或审核服务不可达,请确认 graph-api 正在运行。");
  }
});

boot();
