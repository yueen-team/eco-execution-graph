import { state } from "./state.js";
import { copilotSection } from "./copilotView.js";

const STATUS_TABS = ["待审核", "已通过(待聚合)", "已进入聚合候选", "退回补充", "仅保留内部案例", "不入图", "样本不足"];
const APP_BASE = import.meta.env.BASE_URL || "/";
const GRAPH_API_BASE = (import.meta.env.VITE_GRAPH_API_BASE || "https://www.yueen.cc/container-eco-execution-graph").replace(/\/$/, "");
function appPath(path) {
  return `${APP_BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function normalizeApiBase(value = "") {
  return String(value || GRAPH_API_BASE).replace(/\/$/, "");
}

function apiPath(path) {
  return `${reviewState.apiBase}/${path.replace(/^\//, "")}`;
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
  filtered: { nonRuntime: 0, total: 0 },
  apiBase: "",
  authToken: "",
  submitting: false,
  notice: null,
  // 副驾回执:就地采纳/驳回,跨重渲染持久化;P2 起随 decision 提交(copilotReceipt → body 第 5 键)
  copilot: {},
  // [请十律复核] 进行中的审核编号:防重复触发,失败/完成后清空
  recheckingId: null,
};

const VALUE_LABELS = new Map([
  ["not_for_runtime_import", "不进入运行库"],
  ["synthetic_smoke", "系统联通测试"],
  ["synthetic-region", "合成区域"],
  ["synthetic-industry", "合成行业"],
  ["synthetic-permit", "合成许可"],
  ["synthetic observation", "系统测试观察"],
  ["Synthetic graph smoke issue", "系统联通测试问题"],
  ["Synthetic problem summary only.", "系统联通测试摘要。"],
  ["historical_archive", "历史回档"],
  ["VERIFIED", "已验收通过"],
  ["REJECTED", "验收驳回"],
  ["OPEN", "处理中"],
  ["YELLOW", "黄色预警"],
]);

const NON_RUNTIME_PATTERNS = [
  /not_for_runtime_import/i,
  /synthetic[_-]smoke/i,
  /synthetic[_-]/i,
  /\bsynthetic\b/i,
  /Synthetic graph smoke issue/i,
  /Synthetic problem summary only/i,
];

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char]));
}

function readableText(value) {
  const text = String(value ?? "");
  if (!text) return text;
  if (VALUE_LABELS.has(text)) return VALUE_LABELS.get(text);
  return text.replace(/\bS(\d{2})\b/g, "风险域 S$1");
}

function humanize(value) {
  if (Array.isArray(value)) return value.map(humanize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, humanize(item)]));
  }
  return readableText(value);
}

function itemText(item) {
  if (item === null || item === undefined) return "";
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return String(item);
  if (Array.isArray(item)) return item.map(itemText).join(" ");
  if (typeof item === "object") return Object.values(item).map(itemText).join(" ");
  return "";
}

function isNonRuntimeReviewItem(item) {
  const text = itemText(item);
  return NON_RUNTIME_PATTERNS.some((pattern) => pattern.test(text));
}

function filterRuntimeItems(items = [], apiFiltered = {}) {
  const list = Array.isArray(items) ? items : [];
  const runtimeItems = list.filter((item) => !isNonRuntimeReviewItem(item));
  const clientHidden = list.length - runtimeItems.length;
  return {
    items: runtimeItems,
    filtered: {
      nonRuntime: Number(apiFiltered.non_runtime ?? clientHidden ?? 0),
      total: Number(apiFiltered.total ?? list.length ?? 0),
    },
  };
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
      // 移动端:切换状态时回到列表视图,避免停留在上一条详情
      document.getElementById("reviewWorkspace")?.classList.remove("is-detail-view");
      renderReviewWorkspace();
    });
  });
}

function card(item) {
  const active = item["审核编号"] === reviewState.selectedId;
  const source = humanize(item);
  const sigs = reviewSignals(item);
  const attention = sigs.filter((s) => s.level !== "ok").length;
  const dots = sigs.map((s) => `<i class="rv-dot" data-level="${s.level}" title="${esc(s.title)}:${LEVEL_TEXT[s.level]}"></i>`).join("");
  const readyLabel = attention ? `${attention} 项待核` : "信号良好";
  const readyLevel = sigs.some((s) => s.level === "bad") ? "bad" : attention ? "warn" : "ok";
  return `
    <button class="review-card ${active ? "is-active" : ""}" data-review-id="${esc(item["审核编号"])}">
      <span class="review-card-status">${esc(source["当前审核状态"])}</span>
      <strong>${esc(source["建议问题类型"])}</strong>
      <p>${esc(source["现场问题摘要"])}</p>
      <div class="review-card-meta">
        <span>${esc(source["区域"])}</span>
        <span>${esc(source["行业"])}</span>
        <span>证据 ${esc(item["证据摘要"]?.["证据数量"] ?? 0)} 条</span>
      </div>
      <div class="review-card-readiness" data-level="${readyLevel}">
        <span class="rv-dots">${dots}</span>
        <span class="rv-ready-label">${esc(readyLabel)}</span>
      </div>
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
      // 移动端:点候选卡 → 进入详情视图(桌面端 CSS 不响应此 class,三栏始终并列)
      document.getElementById("reviewWorkspace")?.classList.add("is-detail-view");
      renderReviewWorkspace();
      document.getElementById("reviewDetail")?.scrollIntoView({ block: "start" });
    });
  });
}

function field(label, value) {
  return `<div class="review-field"><span>${esc(label)}</span><strong>${esc(displayValue(value))}</strong></div>`;
}

function chips(values) {
  const list = values?.length ? values : ["待补充"];
  return `<div class="review-chip-row">${list.map((item) => `<span>${esc(displayValue(item))}</span>`).join("")}</div>`;
}

function section(title, body) {
  return `<section class="review-detail-section"><h3>${esc(title)}</h3>${body}</section>`;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "未提供";
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join("、") : "未提供";
  if (typeof value === "object") {
    if ("值" in value) return displayValue(value["值"]);
    if ("名称" in value) return displayValue(value["名称"]);
    return Object.entries(value).map(([key, item]) => `${key}:${displayValue(item)}`).join("；");
  }
  return readableText(value);
}

function completionRows(rows) {
  const list = rows?.length ? rows : [{ "字段": "待补充", "状态": "待核对", "值": "未提供" }];
  return list.map((row) => `
    <div class="review-completion-row">
      <strong>${esc(displayValue(row["字段"] || "待核对字段"))}</strong>
      <span>${esc(displayValue(row["状态"] || "待核对"))}</span>
      <small>${esc(displayValue(row["值"] || row["原因"] || row["补充动作"]))}</small>
    </div>
  `).join("");
}

function completionPanel(completion = {}) {
  return `
    <div class="review-completion">
      <div class="review-completion-group">
        <b>必补字段</b>
        ${completionRows(completion["必补字段"])}
      </div>
      <div class="review-completion-group">
        <b>可候选字段</b>
        ${completionRows(completion["可候选字段"])}
      </div>
      <div class="review-completion-group">
        <b>不强行补字段</b>
        ${completionRows(completion["不强行补字段"])}
      </div>
    </div>
    <p class="review-summary">${esc(completion["摘要"] || "字段补齐状态待补充。")}</p>
  `;
}

function machineFillPanel(rows = []) {
  const list = rows.length ? rows : [{ "字段": "机器补填", "方法": "暂无补填说明", "置信度": null }];
  return `<div class="review-fill-list">${list.map((row) => `
    <div class="review-fill-row">
      <strong>${esc(displayValue(row["字段"]))}</strong>
      <span>${esc(displayValue(row["方法"]))}</span>
      <small>${row["置信度"] === null || row["置信度"] === undefined ? "置信度待核对" : `置信度 ${esc(row["置信度"])}`}</small>
    </div>
  `).join("")}</div>`;
}

function historyPanel(history = {}) {
  return `
    <div class="review-field-grid">
      ${field("任务状态", history["任务状态"])}
      ${field("最新状态", history["最新状态"])}
      ${field("整改轮次", history["最新轮次"] || history["总记录数"])}
      ${field("驳回次数", history["驳回次数"])}
    </div>
    <p class="review-summary">${esc(displayValue(history["整改要求摘要"] || "整改要求待补充"))}</p>
    <p class="review-summary">${esc(displayValue(history["整改提交摘要"] || "整改提交摘要待补充"))}</p>
    <p class="review-summary">${esc(displayValue(history["ETO审核意见摘要"] || "ETO审核意见待补充"))}</p>
  `;
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

// ============ 判断信号:从真实字段透明推导,绝不凭空造结论 ============
// 是否已归一到图谱问题类型。注意 graph-api 对未归一项回填哨兵值 "issue:pending"(真值),
// 不能只判 Boolean,否则真实数据会误显示「已匹配」。
function isMatchedIssue(item) {
  const ref = item["问题类型引用"];
  return Boolean(ref) && !/pending|待归一/i.test(ref);
}

// 整改闭环:VERIFIED / 已通过 = 闭环;未形成闭环 / 被驳回 / 有驳回 = 未闭环
function closureState(item) {
  const taskStatus = item["整改历史摘要"]?.["任务状态"] || "";
  const result = item["整改结果"] || "";
  const rejects = Number(item["整改历史摘要"]?.["驳回次数"] || 0);
  if (/未形成闭环|被驳回|驳回|REJECTED/i.test(result) || rejects > 0) return { ok: false, label: "整改未闭环" };
  if (/VERIFIED|已通过|已闭环/i.test(taskStatus) || /已通过/.test(result)) return { ok: true, label: "整改已闭环" };
  return { ok: null, label: "整改状态待确认" };
}

// 三个判断维度 → 每个给出 level(ok/warn/bad)、一句话结论、证据行、以及「要核对什么」
function reviewSignals(item) {
  const signals = [];

  // 1. 信源可信:证据数量 + 整改闭环
  const n = Number(item["证据摘要"]?.["证据数量"] ?? 0);
  const types = (item["证据摘要"]?.["证据类型"] || []).join("、");
  const closure = closureState(item);
  let srcLevel = n >= 2 ? "ok" : n === 1 ? "warn" : "bad";
  if (closure.ok === false) srcLevel = "bad";
  signals.push({
    key: "source", icon: "shield-check", title: "信源可信",
    level: srcLevel,
    head: srcLevel === "ok" ? "信源充分" : (closure.ok === false ? "整改未闭环" : n === 0 ? "证据缺失" : "信源偏弱"),
    sub: `证据 ${n} 条${types ? ` · ${types}` : ""} · ${closure.label}`,
    look: srcLevel === "ok" ? "" : (closure.ok === false
      ? "整改未形成闭环 —— 核对是否应退回补充"
      : "证据偏少 —— 核对现场照片 / 台账是否足以支撑入图"),
  });

  // 2. 归类就绪:是否归一到图谱问题类型 + 法条候选
  const matched = isMatchedIssue(item);
  const lawN = (item["法条规范候选"] || []).length;
  signals.push({
    key: "class", icon: "git-merge", title: "归类就绪",
    level: matched ? (lawN ? "ok" : "warn") : "warn",
    head: matched ? "已匹配问题类型" : "待归一",
    sub: `${item["建议问题类型"] || "—"} · ${lawN ? `${lawN} 条法条候选` : "无法条候选"}`,
    look: matched
      ? (lawN ? "" : "无法条候选 —— 通过后只能作管理经验,不可写成法律依据")
      : "尚未归一到图谱问题类型 —— 确认归类或选择合并目标",
  });

  // 3. 字段就绪:必补字段补齐与确认情况
  const must = item["字段补齐状态"]?.["必补字段"] || [];
  if (must.length) {
    const confirmed = must.filter((r) => /已确认|已补齐|已核对/.test(r["状态"] || "")).length;
    const pending = must.length - confirmed;
    signals.push({
      key: "field", icon: "list-checks", title: "字段就绪",
      level: pending ? "warn" : "ok",
      head: pending ? `${pending} 项必补待确认` : "必补字段已补齐",
      sub: `共 ${must.length} 项必补 · 机器补填待 ETO 确认`,
      look: pending ? "逐项确认或修改机器补填值,再决定是否通过" : "",
    });
  } else {
    signals.push({
      key: "field", icon: "list-checks", title: "字段就绪",
      level: "warn", head: "字段补齐未提供", sub: "无机器补填明细",
      look: "缺字段补齐状态 —— 核对信息是否完整",
    });
  }

  return signals;
}

// 建议方向:仅在规则足够明确时给,否则不硬给(ETO 才是裁决者)
function recommendedKind(item) {
  const closure = closureState(item);
  if (closure.ok === false) return "return";
  if (/个案|过窄|样本不足|不适合(进入)?聚合|作为?内部/.test(item["现场问题摘要"] || "")) return "internal";
  const matched = isMatchedIssue(item);
  const n = Number(item["证据摘要"]?.["证据数量"] ?? 0);
  if (matched && n >= 2 && closure.ok === true && (item["法条规范候选"] || []).length) return "approve";
  return null;
}

const LEVEL_TEXT = { ok: "良好", warn: "待确认", bad: "需核对" };

function signalCard(sig) {
  return `
    <div class="rv-signal" data-level="${sig.level}">
      <span class="rv-signal-ico"><i data-lucide="${sig.icon}"></i></span>
      <div class="rv-signal-main">
        <div class="rv-signal-top"><span class="rv-signal-title">${esc(sig.title)}</span><span class="rv-signal-pill">${LEVEL_TEXT[sig.level]}</span></div>
        <strong class="rv-signal-head">${esc(sig.head)}</strong>
        <span class="rv-signal-sub">${esc(sig.sub)}</span>
        ${sig.look ? `<span class="rv-signal-look"><i data-lucide="arrow-right"></i>${esc(sig.look)}</span>` : ""}
      </div>
    </div>
  `;
}

function readinessBanner(signals, recKind) {
  const bad = signals.filter((s) => s.level === "bad").length;
  const warn = signals.filter((s) => s.level === "warn").length;
  const level = bad ? "bad" : warn ? "warn" : "ok";
  const title = bad ? `${bad} 项需重点核对` : warn ? `${warn} 项待你确认` : "三项信号良好,可直接判断";
  const rec = recKind ? ACTIONS.find((a) => a.kind === recKind) : null;
  return `
    <div class="rv-readiness" data-level="${level}">
      <div class="rv-readiness-main">
        <span class="rv-readiness-kicker">就绪度评估</span>
        <strong class="rv-readiness-title">${esc(title)}</strong>
      </div>
      ${rec ? `<div class="rv-readiness-rec"><span>建议方向</span><b>${esc(rec.label)}</b></div>` : ""}
    </div>
  `;
}

function renderDetail() {
  const detail = document.getElementById("reviewDetail");
  const item = selectedItem();
  if (!item) {
    const hidden = reviewState.filtered.nonRuntime || 0;
    detail.innerHTML = `<div class="review-empty"><strong>暂无可审核记录</strong><p>等待 EcoCheck 推送新的运行候选现场经验。${hidden ? `已隐藏 ${hidden} 条系统测试或非运行库记录。` : ""}</p></div>`;
    return;
  }
  const view = humanize(item);
  const evidence = item["证据摘要"] || {};
  const laws = item["法条规范候选"] || [];
  const sourceTags = item["信源标签"] || [];
  const completion = item["字段补齐状态"] || {};
  const machineFill = item["机器补填说明"] || [];
  const history = item["整改历史摘要"] || {};
  const batch = item["回档批次"] || {};
  const isDemo = reviewState.source !== "api";
  const options = issueTypeOptions();
  const signals = reviewSignals(item);
  const recKind = recommendedKind(item);
  detail.innerHTML = `
    <button type="button" id="reviewBackToList" class="review-back">
      <span class="review-back-arrow" aria-hidden="true">←</span><span>返回候选列表</span>
    </button>
    ${isDemo ? "<div class=\"review-mode-banner\">演示模式:审核决定只在本浏览器临时生效,不会落库。</div>" : ""}
    <div class="rv-head">
      <span class="review-card-status">${esc(view["当前审核状态"])}</span>
      <h2>${esc(view["建议问题类型"])}</h2>
      <p class="rv-head-meta">${esc(view["来源阶段"])} · ${esc(view["来源时间"])} · ${esc(view["区域"])} · ${esc(view["行业"])}</p>
      <p class="rv-head-summary">${esc(displayValue(item["现场问题摘要"]))}</p>
      ${sourceTags.length ? chips(sourceTags) : ""}
    </div>

    ${readinessBanner(signals, recKind)}

    <div class="rv-signals" aria-label="判断信号">
      ${signals.map(signalCard).join("")}
    </div>

    ${copilotSection(item)}

    <section class="rv-decision">
      <h3><i data-lucide="gavel"></i>提交 ETO 结论</h3>
      <p class="rv-decision-hint">读完上方信号后选择一个结论再提交。退回 / 不入图 / 仅内部保留请在意见里写清原因。通过后只进入聚合候选池,同一组合满 5 家企业才生成聚合统计。</p>
      <div class="review-action-grid" role="group" aria-label="审核结论">
        ${ACTIONS.map((action) => `
          <button class="review-action" data-kind="${action.kind}" data-review-action="${esc(action.label)}"
                  aria-pressed="false"${action.kind === recKind ? " data-recommended=\"true\"" : ""}>
            <span>${esc(action.label)}</span>${action.kind === recKind ? "<em class=\"rv-rec-tag\">建议</em>" : ""}
          </button>
        `).join("")}
      </div>
      <div id="mergeTargetWrap" class="review-merge-wrap" hidden>
        <label for="mergeTargetIssue">合并目标问题类型(从图谱已有问题类型中选择)</label>
        <input id="mergeTargetIssue" class="review-merge-input" list="issueTypeOptions"
               value="${esc(item["合并目标问题类型"] || "")}" placeholder="输入或选择目标问题类型编号">
        <datalist id="issueTypeOptions">
          ${options.map((option) => `<option value="${esc(option.ref)}">${esc(displayValue(option.name))}</option>`).join("")}
        </datalist>
      </div>
      <textarea id="reviewComment" class="review-comment" placeholder="审核意见:说明通过、退回或不入图的原因">${esc(item["审核意见"] || "")}</textarea>
      <div id="reviewSubmitRow" class="review-submit-row">
        <button id="reviewSubmit" class="btn-primary review-submit" disabled>提交审核结论</button>
        <span id="reviewSubmitHint" class="review-submit-hint">先选择上方的审核结论。</span>
      </div>
      ${noticeHtml()}
    </section>

    <details class="rv-raw">
      <summary><i data-lucide="folder-open"></i>完整资料<span>检查信息 · 回档批次 · 字段补齐 · 整改历史 · 法条候选 · 追溯</span></summary>
      <div class="rv-raw-body">
        ${section("现场表现", chips(item["现场表现"]))}
        ${section("历史检查信息", `<div class="review-field-grid">
            ${field("检查月份", item["检查月份"])}
            ${field("检查日期", item["检查日期"])}
            ${field("区域", item["区域"])}
            ${field("行业", item["行业"])}
            ${field("许可类型", item["排污许可类型"])}
            ${field("环保维度", item["环保维度"])}
          </div>`)}
        ${section("回档批次", `<div class="review-field-grid">
            ${field("批次编号", batch["批次编号"])}
            ${field("来源期间", batch["来源期间"])}
            ${field("来源类型", batch["来源类型"])}
            ${field("证据数量", evidence["证据数量"])}
          </div>${chips(evidence["证据类型"])}`)}
        ${section("系统建议归类", `<div class="review-field-grid">
            ${field("建议问题类型", item["建议问题类型"])}
            ${field("归一状态", isMatchedIssue(item) ? "已匹配问题类型" : "待归一")}
            ${field("整改结果", item["整改结果"])}
            ${field("整改要求", item["整改要求"])}
          </div>${chips(item["复查要点"])}`)}
        ${section("字段补齐状态", completionPanel(completion))}
        ${section("机器补填说明", machineFillPanel(machineFill))}
        ${section("整改历史摘要", historyPanel(history))}
        ${section("法条规范候选", laws.length ? laws.map((law) => `
          <div class="review-law"><strong>${esc(displayValue(law["名称"]))}</strong><span>候选引用</span></div>
        `).join("") : "<p class=\"review-summary\">暂无候选引用,不得对外写成法律依据。</p>")}
        ${section("追溯信息", `<div class="review-field-grid">
          ${Object.entries(item["技术追溯"] || {}).map(([label, value]) => field(label, value)).join("")}
        </div>`)}
      </div>
    </details>
  `;

  // 移动端:从详情返回候选列表(桌面端此按钮被 CSS 隐藏)
  detail.querySelector("#reviewBackToList")?.addEventListener("click", () => {
    document.getElementById("reviewWorkspace")?.classList.remove("is-detail-view");
    document.getElementById("reviewWorkspace")?.scrollIntoView({ block: "start" });
  });

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

  // 副驾段交互(采纳/驳回回执 + [请十律复核]):抽成函数,复核成功就地重渲 .rv-copilot 后可再绑
  bindCopilotSection(detail, item);

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

// 副驾段交互绑定:① 采纳/驳回回执(就地切换,不重渲染,跨重渲染从 reviewState.copilot 复原)
// ② [请十律复核] 按钮。复核成功后 .rv-copilot outerHTML 就地替换,需对新 markup 重新调用本函数。
function bindCopilotSection(detail, item) {
  const receiptButtons = [...detail.querySelectorAll("[data-receipt]")];
  if (receiptButtons.length) {
    const bucket = (reviewState.copilot[item["审核编号"]] ||= { receipt: { "采纳": new Set(), "驳回": new Set() } });
    const paint = (code) => {
      receiptButtons.filter((other) => other.dataset.code === code).forEach((other) => {
        const on = bucket.receipt[other.dataset.receipt].has(code);
        other.classList.toggle("is-on", on);
        other.setAttribute("aria-pressed", String(on));
      });
    };
    receiptButtons.forEach((button) => {
      paint(button.dataset.code); // 复原已持久化的回执
      button.addEventListener("click", () => {
        const { code, receipt: kind } = button.dataset;
        const other = kind === "采纳" ? "驳回" : "采纳";
        if (bucket.receipt[kind].has(code)) {
          bucket.receipt[kind].delete(code); // 再点一次取消
        } else {
          bucket.receipt[kind].add(code);
          bucket.receipt[other].delete(code); // 采纳/驳回互斥
        }
        paint(code);
      });
    });
  }
  bindCopilotRecheck(detail, item);
}

function setRecheckState(detail, text) {
  const stateEl = detail.querySelector("[data-copilot-recheck-state]");
  if (stateEl) stateEl.textContent = text || "";
}

// [请十律复核]:仅 api 源发请求;演示模式提示需 graph-api(不发请求)。
function bindCopilotRecheck(detail, item) {
  const button = detail.querySelector("[data-copilot-recheck]");
  if (!button) return;
  button.addEventListener("click", () => {
    if (reviewState.source !== "api") {
      setRecheckState(detail, "演示模式无后端,十律复核需 graph-api。");
      return;
    }
    if (reviewState.recheckingId) return; // 进行中防重复触发
    requestCopilotRecheck(detail, item);
  });
}

// POST /copilot → 拿回 {item}(含更新后的副驾研判)→ 用 copilotSection 就地重渲 .rv-copilot(pattern B,
// 绝不 renderReviewWorkspace,保住已输入审核意见)。三态:加载(按钮 disabled + 「十律复核中…」)/
// 失败(setNotice err,保留确定性 backbone,副驾不沉默)/降级(门禁 partial/blocked 时 copilotSection 自渲降级横幅)。
async function requestCopilotRecheck(detail, item) {
  const id = item["审核编号"];
  const button = detail.querySelector("[data-copilot-recheck]");
  const label = button?.querySelector("[data-recheck-label]");
  reviewState.recheckingId = id;
  if (button) button.disabled = true;
  if (label) label.textContent = "十律复核中…";
  setRecheckState(detail, "");
  try {
    let res;
    try {
      res = await fetch(`${reviewState.apiBase}/api/review/field-events/${encodeURIComponent(id)}/copilot`, {
        method: "POST",
        cache: "no-store",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({}),
      });
    } catch {
      setNotice("err", "无法连接 graph 副驾服务,十律复核未完成,既有确定性研判仍然有效。");
      return;
    }
    if (!res.ok) {
      const error = await res.json().catch(() => ({ reason: "复核失败" }));
      setNotice("err", `十律复核未完成:${error.reason || res.status};既有确定性研判仍然有效。`);
      return;
    }
    const data = await res.json();
    const updated = data.item || item;
    replaceItem(updated); // 持久化新副驾研判到 state(但不整页重渲染,保住已输入审核意见)
    const copilotEl = detail.querySelector(".rv-copilot");
    if (copilotEl) {
      copilotEl.outerHTML = copilotSection(updated); // 就地重渲;门禁≠pass 时自带降级横幅
      window.__refreshIcons?.();                     // 新注入的 <i data-lucide> 重新成图标
      bindCopilotSection(detail, updated);           // 对新 markup 重绑回执 + 复核按钮
    }
  } finally {
    reviewState.recheckingId = null;
    // 失败态(未替换 outerHTML)恢复按钮;成功态此处选到的是新按钮,置回亦无副作用
    const b = detail.querySelector("[data-copilot-recheck]");
    const l = b?.querySelector("[data-recheck-label]");
    if (b) b.disabled = false;
    if (l) l.textContent = "请十律复核";
  }
}

// 副驾回执:把 P0c 就地采纳/驳回的 Set 转数组 + 整体研判.建议方向,随 decision 提交供 delta 飞轮捕获。
// reviewState.copilot 模块级、跨重渲染持久化;无副驾数据时方向 null、两数组空,不改既有提交行为。
function copilotReceipt(id, item) {
  const receipt = reviewState.copilot[id]?.receipt || {};
  return {
    "副驾建议方向": item?.["副驾研判"]?.["整体研判"]?.["建议方向"] ?? null,
    "采纳异议码": receipt["采纳"] ? [...receipt["采纳"]] : [],
    "驳回异议码": receipt["驳回"] ? [...receipt["驳回"]] : [],
  };
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
  // 演示模式同样盖上副驾回执(仅本浏览器生效,与既有 demo 横幅一致)
  item["副驾回执"] = copilotReceipt(item["审核编号"], item);
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
            "副驾回执": copilotReceipt(id, item),
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
  const hidden = reviewState.filtered.nonRuntime || 0;
  const hiddenText = hidden ? ` · 已隐藏 <b>${hidden}</b> 条系统测试/非运行库记录` : "";
  el.hidden = false;
  el.innerHTML = total === 0
    ? `候选队列为空 —— EcoCheck 暂未推送新的运行候选现场经验${hiddenText}。`
    : pending > 0
      ? `当前有 <b>${pending}</b> 条候选待你审核 · 共 ${total} 条可处理${hiddenText}`
      : `待审核队列已清空 · 共 ${total} 条可处理${hiddenText}`;
}

function renderReviewWorkspace() {
  renderStatusTabs();
  renderList();
  renderDetail();
  renderPendingHint();
  window.__refreshIcons?.();
}

export async function initReviewWorkspace({
  readonlyShared,
  allowReviewWorkspace = !readonlyShared,
  requireReviewSession = false,
  apiBase = "",
  setStatus,
}) {
  const button = document.getElementById("reviewButton");
  const graphWorkspace = document.querySelector(".workspace");
  const reviewWorkspace = document.getElementById("reviewWorkspace");
  if (!allowReviewWorkspace) {
    button.hidden = true;
    return;
  }
  const params = new URLSearchParams(window.location.search);
  reviewState.authToken = sessionStorage.getItem("ecoGraphReviewToken") || "";
  reviewState.apiBase = normalizeApiBase(apiBase || window.ECO_GRAPH_API_BASE);
  const session = reviewState.authToken ? { can_review: true } : await fetchJson(apiPath("/auth/session"), true);
  if (session?.can_review === false || (requireReviewSession && !session && !reviewState.authToken)) {
    button.hidden = true;
    if (params.get("workspace") === "review") {
      setStatus?.("审核台需要企业微信授权,请从内部入口重新登录。");
    }
    return;
  }
  button.hidden = false;
  const apiData = await fetchJson(apiPath("/api/review/field-events"), true);
  const demoData = await fetchJson(appPath("/review-data/field-event-review-demo.json"), true);
  if (apiData) {
    const runtime = filterRuntimeItems(apiData.items, apiData.filtered);
    reviewState.source = "api";
    reviewState.items = runtime.items;
    reviewState.filtered = runtime.filtered;
  } else {
    reviewState.source = "demo";
    reviewState.items = demoData?.items || [];
    reviewState.filtered = { nonRuntime: 0, total: reviewState.items.length };
  }
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
