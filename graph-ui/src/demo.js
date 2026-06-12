// 主任演示模式:审核后的 5 张执行卡主线。所有数字与文本来自 pipeline 真实导出,诚实标注未证明项。
import { state, applyDataset, ENTRY_CENTERS, reviewStatusLabel, LEGAL_BASIS_LABEL } from "./state.js";
import {
  initOrUpdateGraph, privateExitAnimation, spotlightEdges,
  clearSpotlight, setDemoNodeFilter, hideTooltip,
} from "./graph.js";
import { renderPanel } from "./panel.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let hooks = null; // { syncControls, updateMetrics, setStatus }
export function initDemo(h) { hooks = h; bindDemoControls(); }

const overlay = () => document.getElementById("actOverlay");

function clearStage() {
  overlay().hidden = true;
  overlay().innerHTML = "";
  setDemoNodeFilter(null);
  clearSpotlight();
  hideTooltip();
}

function setView(view, product = "full") {
  state.view = view;
  state.product = product;
  applyDataset();
  hooks?.syncControls();
  hooks?.updateMetrics();
}

const DIRECTOR_CARD_IDS = [
  "card:full:0003",
  "card:full:0011",
  "card:full:0001",
  "card:full:0005",
  "card:full:0012",
];

const DIRECTOR_CARD_FALLBACK_TITLES = {
  "card:full:0003": "危废包装容器标签信息不完整或与实物、台账不一致",
  "card:full:0011": "危废包装容器“一物一码”与平台记录核查",
  "card:full:0001": "危险废物管理台账记录不完整",
  "card:full:0005": "危废出入库记录、电子标签二维码与转移联单不一致",
  "card:full:0012": "危废暂存场所防渗、防漏及泄漏收集措施不完善",
};

function directorCards() {
  const cards = state.datasets.full?.cards || [];
  const byCardId = new Map(cards.map((card) => [card.card_id, card]));
  return DIRECTOR_CARD_IDS.map((cardId) => byCardId.get(cardId) || {
    card_id: cardId,
    title: `${DIRECTOR_CARD_FALLBACK_TITLES[cardId]}执行卡`,
    external_expression: "执行卡数据未装载,请刷新页面或检查执行卡导出(full-cards)。",
  });
}

function directorCard(cardId) {
  return directorCards().find((card) => card.card_id === cardId);
}

function focusDirectorCard(cardId) {
  clearStage();
  setView("internal", "full");
  const card = directorCard(cardId);
  const centerId = card?.root_issue_type || card?.field_manifestations?.[0]?.issue_type_ref || ENTRY_CENTERS.full.issue;
  state.centerId = centerId;
  initOrUpdateGraph();
  renderPanel(centerId);
  renderDirectorCardOverlay(card);
  setTimeout(() => spotlightEdges(["manifests_as", "evidenced_by", "rectified_by", "reported_as"]), 450);
  hooks?.setStatus(`主任演示:正在查看执行卡 ${card?.card_id || cardId},已定位到根问题类型。`);
}

/* ---------- 各幕 ---------- */

const ACTS = [
  {
    kicker: "第一张卡",
    title: DIRECTOR_CARD_FALLBACK_TITLES["card:full:0003"],
    narration: "先从最容易看懂的现场标签开始:只建议核查标签、实物、台账和平台记录是否一致,不做违法认定。",
    run: () => focusDirectorCard("card:full:0003"),
  },
  {
    kicker: "第二张卡",
    title: DIRECTOR_CARD_FALLBACK_TITLES["card:full:0011"],
    narration: "第二步看“一物一码”和平台记录:建议核查二维码、数字识别码、电子台账与平台记录的对应关系。",
    run: () => focusDirectorCard("card:full:0011"),
  },
  {
    kicker: "第三张卡",
    title: DIRECTOR_CARD_FALLBACK_TITLES["card:full:0001"],
    narration: "第三步进入台账主线:建议核查产生、入库、出库、月度汇总、平台申报和联单回填是否一致。",
    run: () => focusDirectorCard("card:full:0001"),
  },
  {
    kicker: "第四张卡",
    title: DIRECTOR_CARD_FALLBACK_TITLES["card:full:0005"],
    narration: "第四步看转移闭环:出入库记录、电子标签二维码与转移联单之间只表述为存在不一致风险,建议核查闭环。",
    run: () => focusDirectorCard("card:full:0005"),
  },
  {
    kicker: "第五张卡",
    title: DIRECTOR_CARD_FALLBACK_TITLES["card:full:0012"],
    narration: "第五步落到暂存实体风险:防渗、防漏和泄漏收集措施存在管理风险时,建议结合危废形态和数量进一步完善。",
    run: () => focusDirectorCard("card:full:0012"),
  },
  {
    kicker: "缺口报告",
    title: "把盲区先暴露出来",
    narration: "5 张卡之后只看缺口报告:哪些义务没有现场覆盖,哪些问题无法条依据。无法条依据只进入管理建议。",
    run() {
      clearStage();
      setView("shared", "full");
      initOrUpdateGraph({ skipAnimation: true });
      renderGapPanel();
    },
  },
  {
    kicker: "授权边界",
    title: "看得见,带不走",
    narration: "收束到授权边界:共有包只交付问题、瘦引用、证据类别与聚合信号;私有判断、模板和报告表达不带走。",
    run() {
      renderBoundaryAct();
    },
  },
];

/* ---------- 5 张执行卡主线 ---------- */

function cleanCardTitle(card) {
  return (card?.title || DIRECTOR_CARD_FALLBACK_TITLES[card?.card_id] || "主任演示执行卡").replace(/执行卡$/, "");
}

function renderDirectorCardOverlay(card) {
  const cards = directorCards();
  const expression = card?.external_expression || card?.report_expression_summary || "建议核查相关记录与现场情况,不作违法认定。";
  const evidence = card?.evidence_summary || "概念级证据类别:现场照片、台账记录、平台截图、标签或联单。";
  const quality = card?.quality_score;
  const rootIssue = card?.root_issue_type || card?.field_manifestations?.[0]?.issue_type_ref || "未装载";

  overlay().innerHTML = `<div class="path-cascade">${cards.map((item, i) => {
    const isActive = item.card_id === card?.card_id;
    return `
    <div class="path-step" style="--d:${i * 0.08}s; --ps-color:${isActive ? "var(--rose)" : "var(--teal)"}; opacity:${isActive ? "1" : "0.55"}">
      <div class="ps-rail"><div class="ps-node"><i data-lucide="${isActive ? "flag-triangle-right" : "check"}"></i></div><div class="ps-line"></div></div>
      <div class="ps-body">
        <p class="ps-kicker">${i + 1}/5 · ${esc(item.card_id)}</p>
        <h4 class="ps-title">${esc(cleanCardTitle(item))}</h4>
        ${isActive ? `<p class="ps-text">${esc(expression)}</p>
          <div class="ps-extra">
            <span class="badge b-blue"><i data-lucide="git-fork"></i>根问题类型 ${esc(rootIssue)}</span>
            <span class="badge b-plain"><i data-lucide="shield-check"></i>${esc(reviewStatusLabel(card?.review_status) || "待装载审核状态")}</span>
            <span class="badge b-blue"><i data-lucide="stamp"></i>${esc(LEGAL_BASIS_LABEL[card?.legal_basis_status] || "内部已审核")} · 不写违法认定</span>
            ${quality ? `<span class="badge b-shared"><i data-lucide="gauge"></i>置信度 ${esc((quality.confidence ?? 0).toFixed(2))}</span>` : ""}
          </div>
          <p class="ps-text">${esc(evidence)}</p>` : ""}
      </div>
    </div>`;
  }).join("")}
    <div class="honest-note"><i data-lucide="info"></i><span>
      主线逻辑:现场标签 → 一物一码 → 台账记录 → 转移闭环 → 暂存实体风险。当前演示不进入云南踩雷地图,不演示月报对比;所有外部表达仅使用“建议核查 / 建议完善 / 存在管理风险”。
    </span></div>
  </div>`;
  overlay().hidden = false;
  window.__refreshIcons?.();
}

/* ---------- 第五幕:缺口雷达 ---------- */

function renderGapPanel() {
  const gap = state.reports.gap;
  if (!gap) {
    overlay().innerHTML = `<div class="report-panel"><h3>缺口报告</h3><p class="rp-sub">缺口报告未装载(reports/gap-report-full.json)。</p></div>`;
    overlay().hidden = false;
    return;
  }
  const lawGaps = gap.law_obligation_without_issue?.length ?? 0;
  const issueGaps = gap.issue_without_basis?.length ?? 0;
  const ragUnresolved = gap.rag_unresolved ?? 0;
  overlay().innerHTML = `
    <div class="report-panel">
      <h3>缺口报告</h3>
      <p class="rp-sub">由 <span style="font-family:var(--font-mono)">gap_report --scope full</span> 在每次构建时重算 —— 不是静态宣传数字。</p>
      <div class="gap-grid">
        <div class="gap-cell"><b>${lawGaps}</b><span>法定义务<br>无现场覆盖</span></div>
        <div class="gap-cell"><b>${issueGaps}</b><span>现场问题<br>无法条依据</span></div>
        <div class="gap-cell"><b>${ragUnresolved}</b><span>法条引用<br>RAG 未解析</span></div>
      </div>
      <div class="honest-note"><i data-lucide="info"></i><span>
        缺口报告只暴露治理盲区,不替代人工审核。范围扩大后,无法条依据的问题归入「管理建议」,候选或存疑依据不得对外引用,绝不写成违法认定。
      </span></div>
    </div>`;
  overlay().hidden = false;
  window.__refreshIcons?.();
}

/* ---------- 授权边界 ---------- */

function renderBoundaryAct() {
  const card = directorCard("card:full:0012") || directorCards().at(-1);
  const centerId = card?.root_issue_type || ENTRY_CENTERS.full.issue;
  clearStage();
  setView("internal", "full");
  state.centerId = centerId;
  initOrUpdateGraph({ skipAnimation: true });
  renderPanel(centerId);
  setTimeout(() => {
    privateExitAnimation(() => {
      setView("shared", "full");
      state.centerId = centerId;
      initOrUpdateGraph();
      renderPanel(centerId);
      renderBoundaryPanel();
      hooks?.setStatus("共有视图:已加载共有导出包(shared_product_v1),私有运行层已物理过滤。");
    });
  }, 900);
}

function renderBoundaryPanel() {
  overlay().innerHTML = `
    <div class="report-panel">
      <h3>授权边界:看得见,带不走</h3>
      <p class="rp-sub">共有视图只消费物理过滤后的共有导出包(shared_product_v1);私有运行层(private runtime)不进入前端共有包。</p>
      <div class="compare-grid">
        <div class="compare-col">
          <h4><i data-lucide="share-2"></i>可以交付</h4>
          <p>问题分类、法条瘦引用、证据类别、概念级字段要求、聚合信号和缺口报告。</p>
        </div>
        <div class="compare-col is-graph">
          <h4><i data-lucide="lock"></i>只展示能力存在</h4>
          <p>证据判断标准、整改模板、报告表达、ETO 审核笔记和企业实例留在内部层,共有视图只显示数量占位。</p>
        </div>
      </div>
      <div class="honest-note"><i data-lucide="shield-check"></i><span>
        本次主任演示收束在 5 张已审核基线(APPROVED_BASELINE)卡、缺口报告和授权边界。不演示云南踩雷地图,不演示月报对比,不把“建议核查/建议完善/存在管理风险”升级成违法认定。
      </span></div>
    </div>`;
  overlay().hidden = false;
  window.__refreshIcons?.();
}

/* ---------- 演示条与导航 ---------- */

function renderDemoBar() {
  const bar = document.getElementById("demoBar");
  const act = ACTS[state.demo.act];
  document.getElementById("demoKicker").textContent = `主任演示 · ${act.kicker}`;
  document.getElementById("demoTitle").textContent = act.title;
  document.getElementById("demoNarration").textContent = act.narration;
  const progress = document.getElementById("demoProgress");
  progress.innerHTML = ACTS.map((a, i) =>
    `<button data-act="${i}" class="${i < state.demo.act ? "is-done" : ""}${i === state.demo.act ? "is-now" : ""}"
       title="${esc(a.kicker)} ${esc(a.title)}" aria-label="${esc(a.title)}"></button>`,
  ).join("");
  progress.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => gotoAct(Number(b.dataset.act))),
  );
  document.getElementById("demoNext").innerHTML =
    state.demo.act >= ACTS.length - 1 ? `收幕<i data-lucide="check"></i>` : `下一幕<i data-lucide="chevron-right"></i>`;
  bar.hidden = false;
  window.__refreshIcons?.();
}

export function gotoAct(index) {
  if (index < 0) return;
  if (index >= ACTS.length) { exitDemo(); return; }
  state.demo.act = index;
  ACTS[index].run();
  renderDemoBar();
}

export function enterDemo() {
  state.demo.active = true;
  document.body.classList.add("demo-active");
  gotoAct(0);
}

export function exitDemo() {
  state.demo.active = false;
  state.demo.act = 0;
  document.body.classList.remove("demo-active");
  document.getElementById("demoBar").hidden = true;
  clearStage();
  setView("internal", "full");
  state.centerId = ENTRY_CENTERS.full.law;
  initOrUpdateGraph();
  renderPanel(state.centerId);
  hooks?.setStatus("内部全量视图:可见私有运行层(private runtime)节点。");
}

function bindDemoControls() {
  document.getElementById("demoNext").addEventListener("click", () => gotoAct(state.demo.act + 1));
  document.getElementById("demoPrev").addEventListener("click", () => gotoAct(state.demo.act - 1));
  document.getElementById("demoExit").addEventListener("click", exitDemo);
  document.addEventListener("keydown", (e) => {
    if (!state.demo.active) return;
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); gotoAct(state.demo.act + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); gotoAct(state.demo.act - 1); }
    if (e.key === "Escape") exitDemo();
  });
}
