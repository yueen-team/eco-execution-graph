import { state } from "./state.js";

const STATUS_TABS = ["待审核", "已通过(待聚合)", "已进入聚合候选", "退回补充", "仅保留内部案例", "不入图", "样本不足"];
const APP_BASE = import.meta.env.BASE_URL || "/";
function appPath(path) {
  return `${APP_BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

// 两步制:先选结论,再提交。kind 驱动语义配色,hint 告诉 ETO 这个结论的去向。
const ACTIONS = [
  { label: "通过，进入聚合候选", kind: "approve", hint: "状态将变为「已通过(待聚合)」,满 5 家企业后参与聚合统计。" },
  { label: "合并到已有问题类型", kind: "merge", hint: "状态将变为「已进入聚合候选」,聚合时按合并目标问题类型归并。" },
  { label: "仅保留内部案例", kind: "internal", hint: "保留在私有案例层,不参与聚合,不对外。" },
  { label: "退回补充", kind: "return", hint: "退回 EcoCheck 侧补充现场事实或证据。" },
  { label: "不入图", kind: "reject", hint: "该候选经验不进入图谱。" },
];

let reviewState = {
  enabled: false,
  activeStatus: "待审核",
  selectedId: null,
  items: [],
  source: "demo",
  apiBase: "",
  authToken: "",
  submitting: false,
  notice: null,
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function authHeaders(extra = {}) {
  return reviewState.authToken
    ? { ...extra, Authorization: `Bearer ${reviewState.authToken}` }
    : extra;
}

async function fetchJson(path, optional = false) {
  try {
    const res = await fetch(path, { cache: "no-store", headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

function visibleItems() {
  return reviewState.items.filter((item) => item["当前审核状态"] === reviewState.activeStatus);
}

function statusCounts() {
  const counts = Object.fromEntries(STATUS_TABS.map((status) => [status, 0]));
  for (const item of reviewState.items) {
    const status = item["当前审核状态"];
    if (counts[status] !== undefined) counts[status] += 1;
  }
  return counts;
}

// 合并目标候选:优先取图谱 issue_type 节点,保证合并目标是图里真实存在的问题类型
function issueTypeOptions() {
  const seen = new Map();
  for (const node of state.graph?.nodes || []) {
    if (node.node_type === "issue_type" && node.node_id) seen.set(node.node_id, node.name || node.node_id);
  }
  for (const item of reviewState.items) {
    const ref = item["问题类型引用"];
    if (ref && !seen.has(ref)) seen.set(ref, item["建议问题类型"] || ref);
  }
  return [...seen.entries()].map(([ref, name]) => ({ ref, name }));
}

function renderStatusTabs() {
  const counts = statusCounts();
  const wrap = document.getElementById("reviewStatusTabs");
  wrap.innerHTML = STATUS_TABS.map((status) => `
    <button class="review-tab ${status === reviewState.activeStatus ? "is-active" : ""}"
            data-review-status="${esc(status)}" aria-pressed="${status === reviewState.activeStatus}">
      <span>${esc(status)}</span><b>${counts[status] || 0}</b>
    </button>
  `).join("");
  wrap.querySelectorAll("[data-review-status]").forEach((button) => {
    button.addEventListener("click", () => {
      reviewState.activeStatus = button.dataset.reviewStatus;
      reviewState.notice = null;
      const items = visibleItems();
      reviewState.selectedId = items[0]?.["审核编号"] || reviewState.items[0]?.["审核编号"] || null;
      renderReviewWorkspace();
    });
  });
}

function card(item) {
  const active = item["审核编号"] === reviewState.selectedId;
  const signals = (item["现场表现"] || []).slice(0, 2).map((signal) => `<span>${esc(signal)}</span>`).join("");
  return `
    <button class="review-card ${active ? "is-active" : ""}" data-review-id="${esc(item["审核编号"])}">
      <span class="review-card-status">${esc(item["当前审核状态"])}</span>
      <strong>${esc(item["建议问题类型"])}</strong>
      <p>${esc(item["现场问题摘要"])}</p>
      <div class="review-card-meta">
        <span>${esc(item["环保维度"])}</span>
        <span>${esc(item["区域"])}</span>
        <span>${esc(item["行业"])}</span>
      </div>
      <div class="review-card-signals">${signals || "<span>现场表现待补充</span>"}</div>
    </button>
  `;
}

function renderList() {
  const list = document.getElementById("reviewList");
  const items = visibleItems();
  list.innerHTML = items.length ? items.map(card).join("") : `
    <div class="review-empty">
      <strong>暂无${esc(reviewState.activeStatus)}记录</strong>
      <p>EcoCheck 推送候选现场经验后,会先进入这里等待 ETO 入图审核。</p>
    </div>
  `;
  list.querySelectorAll("[data-review-id]").forEach((button) => {
    button.addEventListener("click", () => {
      reviewState.selectedId = button.dataset.reviewId;
      reviewState.notice = null;
      renderReviewWorkspace();
    });
  });
}

function field(label, value) {
  return `<div class="review-field"><span>${esc(label)}</span><strong>${esc(value || "未提供")}</strong></div>`;
}

function chips(values) {
  const list = values?.length ? values : ["待补充"];
  return `<div class="review-chip-row">${list.map((item) => `<span>${esc(item)}</span>`).join("")}</div>`;
}

function section(title, body) {
  return `<section class="review-detail-section"><h3>${esc(title)}</h3>${body}</section>`;
}

function selectedItem() {
  return reviewState.items.find((item) => item["审核编号"] === reviewState.selectedId) || reviewState.items[0] || null;
}

function noticeHtml() {
  if (!reviewState.notice) return "";
  const { kind, text } = reviewState.notice;
  return `<div id="reviewNotice" class="review-notice ${kind === "ok" ? "ok" : "err"}" role="status">${esc(text)}</div>`;
}

function setNotice(kind, text) {
  reviewState.notice = { kind, text };
  const existing = document.getElementById("reviewNotice");
  if (existing) {
    existing.className = `review-notice ${kind === "ok" ? "ok" : "err"}`;
    existing.textContent = text;
    return;
  }
  document.getElementById("reviewSubmitRow")?.insertAdjacentHTML("afterend", noticeHtml());
}

function renderDetail() {
  const detail = document.getElementById("reviewDetail");
  const item = selectedItem();
  if (!item) {
    detail.innerHTML = `<div class="review-empty"><strong>暂无审核记录</strong><p>等待 EcoCheck 推送候选现场经验。</p></div>`;
    return;
  }
  const evidence = item["证据摘要"] || {};
  const laws = item["法条规范候选"] || [];
  const isDemo = reviewState.source !== "api";
  const options = issueTypeOptions();
  detail.innerHTML = `
    ${isDemo ? "<div class=\"review-mode-banner\">演示模式:审核决定只在本浏览器临时生效,不会落库。</div>" : ""}
    <div class="review-detail-head">
      <span class="review-card-status">${esc(item["当前审核状态"])}</span>
      <h2>${esc(item["建议问题类型"])}</h2>
      <p>${esc(item["来源阶段"])} · ${esc(item["来源时间"])}</p>
    </div>
    ${section("现场事实", `
      <div class="review-field-grid">
        ${field("区域", item["区域"])}
        ${field("行业", item["行业"])}
        ${field("许可类型", item["排污许可类型"])}
        ${field("环保维度", item["环保维度"])}
      </div>
      <p class="review-summary">${esc(item["现场问题摘要"])}</p>
      ${chips(item["现场表现"])}
    `)}
    ${section("系统建议归类", `
      <div class="review-field-grid">
        ${field("建议问题类型", item["建议问题类型"])}
        ${field("归一状态", item["问题类型引用"] ? "已匹配问题类型" : "待归一")}
      </div>
    `)}
    ${section("证据与整改闭环", `
      <div class="review-field-grid">
        ${field("证据数量", evidence["证据数量"])}
        ${field("整改结果", item["整改结果"])}
      </div>
      ${chips(evidence["证据类型"])}
      <p class="review-summary">${esc(item["整改要求"])}</p>
      ${chips(item["复查要点"])}
    `)}
    ${section("法条规范候选", laws.length ? laws.map((law) => `
      <div class="review-law"><strong>${esc(law["名称"])}</strong><span>已建立引用</span></div>
    `).join("") : "<p class=\"review-summary\">暂无候选引用,不得对外写成法律依据。</p>")}
    ${section("聚合准入判断", `
      <div class="review-field-grid">
        ${field("是否允许进入聚合", item["是否允许进入聚合"] ? "是" : "否")}
        ${field("当前审核状态", item["当前审核状态"])}
      </div>
      <p class="review-summary">通过后只进入聚合候选池;同一组合满 5 家企业才可生成聚合统计。</p>
    `)}
    ${section("ETO 审核决定", `
      <div class="review-action-grid" role="group" aria-label="审核结论">
        ${ACTIONS.map((action) => `
          <button class="review-action" data-kind="${action.kind}" data-review-action="${esc(action.label)}"
                  aria-pressed="false">${esc(action.label)}</button>
        `).join("")}
      </div>
      <div id="mergeTargetWrap" class="review-merge-wrap" hidden>
        <label for="mergeTargetIssue">合并目标问题类型(从图谱已有问题类型中选择)</label>
        <input id="mergeTargetIssue" class="review-merge-input" list="issueTypeOptions"
               value="${esc(item["合并目标问题类型"] || "")}" placeholder="输入或选择目标问题类型编号">
        <datalist id="issueTypeOptions">
          ${options.map((option) => `<option value="${esc(option.ref)}">${esc(option.name)}</option>`).join("")}
        </datalist>
      </div>
      <textarea id="reviewComment" class="review-comment" placeholder="审核意见:说明通过、退回或不入图的原因">${esc(item["审核意见"] || "")}</textarea>
      <div id="reviewSubmitRow" class="review-submit-row">
        <button id="reviewSubmit" class="btn-primary review-submit" disabled>提交审核结论</button>
        <span id="reviewSubmitHint" class="review-submit-hint">先选择上方的审核结论。</span>
      </div>
      ${noticeHtml()}
    `)}
    <details class="review-trace">
      <summary>追溯信息</summary>
      <div class="review-field-grid">
        ${Object.entries(item["技术追溯"] || {}).map(([label, value]) => field(label, value)).join("")}
      </div>
    </details>
  `;

  // 选结论 → 提交:状态切换全部就地更新,不重渲染,避免丢失已输入的审核意见
  let pending = null;
  const actionButtons = [...detail.querySelectorAll("[data-review-action]")];
  const mergeWrap = detail.querySelector("#mergeTargetWrap");
  const submitButton = detail.querySelector("#reviewSubmit");
  const submitHint = detail.querySelector("#reviewSubmitHint");

  actionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      pending = ACTIONS.find((action) => action.label === button.dataset.reviewAction) || null;
      actionButtons.forEach((other) => {
        const selected = other === button;
        other.classList.toggle("is-selected", selected);
        other.setAttribute("aria-pressed", String(selected));
      });
      mergeWrap.hidden = pending?.kind !== "merge";
      submitButton.disabled = !pending;
      submitHint.textContent = pending?.hint || "先选择上方的审核结论。";
      if (pending?.kind === "merge") detail.querySelector("#mergeTargetIssue")?.focus();
    });
  });

  submitButton.addEventListener("click", () => {
    if (!pending || reviewState.submitting) return;
    const comment = detail.querySelector("#reviewComment")?.value || "";
    const mergeTarget = pending.kind === "merge" ? (detail.querySelector("#mergeTargetIssue")?.value || "").trim() : "";
    if (pending.kind === "merge") {
      if (!mergeTarget) {
        setNotice("err", "合并到已有问题类型时,必须先填写合并目标问题类型。");
        detail.querySelector("#mergeTargetIssue")?.focus();
        return;
      }
      const known = issueTypeOptions().some((option) => option.ref === mergeTarget);
      if (!known) {
        setNotice("err", `「${mergeTarget}」不在图谱已有问题类型中,请从下拉候选中选择。`);
        detail.querySelector("#mergeTargetIssue")?.focus();
        return;
      }
    }
    submitReviewDecision(item["审核编号"], pending.label, comment, mergeTarget);
  });
}

function applyDecisionToItem(item, action, comment, mergeTarget = "") {
  item["审核人"] = "ETO";
  item["审核时间"] = new Date().toISOString();
  item["审核意见"] = comment;
  item["是否允许进入聚合"] = false;
  item["进入聚合候选时间"] = null;
  if (action === "通过，进入聚合候选") {
    item["当前审核状态"] = "已通过(待聚合)";
    item["是否允许进入聚合"] = true;
    item["进入聚合候选时间"] = item["审核时间"];
  } else if (action === "合并到已有问题类型") {
    item["当前审核状态"] = "已进入聚合候选";
    item["是否允许进入聚合"] = true;
    item["进入聚合候选时间"] = item["审核时间"];
    item["合并目标问题类型"] = mergeTarget;
  } else if (action === "仅保留内部案例") item["当前审核状态"] = "仅保留内部案例";
  else if (action === "退回补充") item["当前审核状态"] = "退回补充";
  else if (action === "不入图") item["当前审核状态"] = "不入图";
  return item;
}

function replaceItem(updated) {
  reviewState.items = reviewState.items.map((record) => (
    record["审核编号"] === updated["审核编号"] ? updated : record
  ));
}

async function submitReviewDecision(id, action, comment, mergeTarget) {
  const item = reviewState.items.find((record) => record["审核编号"] === id);
  if (!item) return;
  reviewState.submitting = true;
  try {
    if (reviewState.source === "api") {
      let res;
      try {
        res = await fetch(`${reviewState.apiBase}/api/review/field-events/${encodeURIComponent(id)}/decision`, {
          method: "POST",
          cache: "no-store",
          headers: authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            "审核结论": action,
            "审核人": "ETO",
            "审核意见": comment,
            "合并目标问题类型": mergeTarget,
          }),
        });
      } catch {
        setNotice("err", "无法连接 graph 审核服务,结论未保存,请确认 graph-api 是否在运行。");
        return;
      }
      if (!res.ok) {
        const error = await res.json().catch(() => ({ reason: "提交失败" }));
        setNotice("err", `审核结论未保存:${error.reason || res.status}`);
        return;
      }
      const data = await res.json();
      replaceItem(data.item);
      reviewState.activeStatus = data.item["当前审核状态"];
      reviewState.selectedId = data.item["审核编号"];
      reviewState.notice = { kind: "ok", text: `审核结论已写入 private staging,当前状态:${data.item["当前审核状态"]}。` };
    } else {
      const updated = applyDecisionToItem(item, action, comment, mergeTarget);
      replaceItem(updated);
      reviewState.activeStatus = updated["当前审核状态"];
      reviewState.notice = { kind: "ok", text: `演示模式:结论仅在本浏览器生效,未落库。当前状态:${updated["当前审核状态"]}。` };
    }
    renderReviewWorkspace();
  } finally {
    reviewState.submitting = false;
  }
}

function renderPendingHint() {
  const el = document.getElementById("reviewPendingHint");
  if (!el) return;
  const pending = statusCounts()["待审核"] || 0;
  const total = reviewState.items.length;
  el.hidden = false;
  el.innerHTML = total === 0
    ? "候选队列为空 —— EcoCheck 暂未推送新的现场经验。"
    : pending > 0
      ? `当前有 <b>${pending}</b> 条候选待你审核 · 共 ${total} 条在库`
      : `待审核队列已清空 · 共 ${total} 条已处理`;
}

function renderReviewWorkspace() {
  renderStatusTabs();
  renderList();
  renderDetail();
  renderPendingHint();
  window.__refreshIcons?.();
}

export async function initReviewWorkspace({ readonlyShared, setStatus }) {
  const button = document.getElementById("reviewButton");
  const graphWorkspace = document.querySelector(".workspace");
  const reviewWorkspace = document.getElementById("reviewWorkspace");
  if (readonlyShared) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  const params = new URLSearchParams(window.location.search);
  reviewState.authToken = sessionStorage.getItem("ecoGraphReviewToken") || "";
  reviewState.apiBase = window.ECO_GRAPH_API_BASE || "";
  const apiData = await fetchJson(`${reviewState.apiBase}/api/review/field-events`, true);
  const demoData = await fetchJson(appPath("/review-data/field-event-review-demo.json"), true);
  reviewState.source = apiData?.items?.length ? "api" : "demo";
  reviewState.items = reviewState.source === "api" ? apiData.items : demoData?.items || [];
  reviewState.selectedId = visibleItems()[0]?.["审核编号"] || reviewState.items[0]?.["审核编号"] || null;
  renderReviewWorkspace();

  function showReview() {
    reviewState.enabled = true;
    graphWorkspace.hidden = true;
    reviewWorkspace.hidden = false;
    button.classList.add("is-reviewing");
    setStatus?.("现场经验入图审核台:候选现场经验必须经 ETO 审核后才能进入聚合。");
    renderReviewWorkspace();
  }
  function showGraph() {
    reviewState.enabled = false;
    graphWorkspace.hidden = false;
    reviewWorkspace.hidden = true;
    button.classList.remove("is-reviewing");
    setStatus?.("内部全量视图:可见私有运行层(private runtime)节点。");
  }

  button.addEventListener("click", () => {
    if (reviewState.enabled) showGraph();
    else showReview();
  });
  if (params.get("workspace") === "review") showReview();
}
