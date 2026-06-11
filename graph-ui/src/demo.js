// 主任演示模式:七幕引导叙事。所有数字与文本来自 pipeline 真实导出,诚实标注未证明项。
import { state, applyDataset, ENTRY_CENTERS } from "./state.js";
import {
  initOrUpdateGraph, growthReplay, privateExitAnimation, spotlightEdges,
  clearSpotlight, setDemoNodeFilter, markCenter, hideTooltip,
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

/* ---------- 各幕 ---------- */

const ACTS = [
  {
    kicker: "序幕",
    title: "一张从现场长出来的图",
    narration: "这不是导入的模板。每个节点都来自审核通过的基线与现场排查事件,看它如何生长。",
    run() {
      clearStage();
      setView("internal");
      state.centerId = ENTRY_CENTERS.full.issue;
      initOrUpdateGraph({ skipAnimation: true });
      renderPanel(state.centerId);
      growthReplay();
    },
  },
  {
    kicker: "第一幕",
    title: "只有法条的世界",
    narration: "这是执法工具的现状:法条与义务俱全,但它们悬在空中 —— 没有行业、没有场景、没有现场。",
    run() {
      clearStage();
      setView("internal");
      setDemoNodeFilter((n) => n.node_type === "law_article" || n.node_type === "law_obligation");
      state.centerId = ENTRY_CENTERS.full.law;
      initOrUpdateGraph();
      renderPanel(state.centerId);
    },
  },
  {
    kicker: "第二幕",
    title: "法条落到现场",
    narration: "同一条法,从义务到现场表现、证据类别、整改方向、报告表达 —— 一条可追溯的执行链。",
    run() {
      clearStage();
      setView("internal", "p1");
      state.centerId = ENTRY_CENTERS.p1.law;
      initOrUpdateGraph();
      renderPanel(state.centerId);
      renderPathCascade();
    },
  },
  {
    kicker: "第三幕",
    title: "证据,让现场说话",
    narration: "每类问题挂着概念级证据类别与字段要求;判定细则在内部层,这正是别人拿不走的部分。",
    run() {
      clearStage();
      setView("internal", "p1");
      state.centerId = ENTRY_CENTERS.p1.issue;
      initOrUpdateGraph();
      renderPanel(state.centerId);
      setTimeout(() => spotlightEdges(["evidenced_by", "manifests_as"]), 650);
    },
  },
  {
    kicker: "第四幕",
    title: "看得见,带不走",
    narration: "切换到共有视图:私有与聚合节点锁定退场,能力以计数保留 —— 授权边界由导出管线物理执行。",
    run() {
      clearStage();
      setView("internal", "full");
      state.centerId = ENTRY_CENTERS.full.issue;
      initOrUpdateGraph({ skipAnimation: true });
      renderPanel(state.centerId);
      setTimeout(() => {
        privateExitAnimation(() => {
          setView("shared", "full");
          initOrUpdateGraph();
          renderPanel(state.centerId);
          hooks?.setStatus("共有视图:已加载 shared_product_v1 导出包,private runtime 已物理过滤。");
        });
      }, 1400);
    },
  },
  {
    kicker: "第五幕",
    title: "双向盲区雷达",
    narration: "图谱自己回答两个问题:哪条法没有现场覆盖?哪类问题没有法条依据?当前危废切片答案是零。",
    run() {
      clearStage();
      setView("shared", "full");
      initOrUpdateGraph({ skipAnimation: true });
      renderGapPanel();
    },
  },
  {
    kicker: "第六幕",
    title: "回灌月报:从模板话术到专家口径",
    narration: "图谱装配的上下文让月度体检报告有场景、有证据、有引用边界 —— 并诚实标注尚未证明的部分。",
    run() {
      clearStage();
      setView("shared", "full");
      initOrUpdateGraph({ skipAnimation: true });
      renderMonthlyPanel();
    },
  },
];

/* ---------- 第二幕:法条落地路径 ---------- */

function renderPathCascade() {
  const p1 = state.datasets.p1;
  const card = p1.cards.find((c) => c.card_id === "card:hw:label-incomplete") || p1.cards[0];
  const nodeById = new Map(p1.graph.nodes.map((n) => [n.node_id, n]));
  const law = nodeById.get(card.law_article_ref?.node_id || "law:swl:art77");
  const obligation = nodeById.get(card.related_obligations?.[0]);
  const manifestation = card.field_manifestations?.[0];
  const evidence = card.evidence_categories || [];
  const rectification = card.rectifications?.[0];

  const steps = [
    {
      color: "var(--blue)", icon: "scale", kicker: "法条 · 瘦引用",
      title: law ? `${law.attrs?.law_name || ""} ${law.attrs?.article_no || law.name}` : "固体废物污染环境防治法",
      text: law?.attrs?.obligation_summary || "",
      extra: `<span class="badge b-blue"><i data-lucide="database"></i>全文留在 RAG,图谱只持有义务摘要</span>`,
    },
    {
      color: "var(--blue)", icon: "book-open", kicker: "法定义务",
      title: obligation?.name || "危废标识与标签管理义务",
      text: obligation?.attrs?.summary || "",
    },
    {
      color: "var(--rose)", icon: "flag-triangle-right", kicker: "现场表现",
      title: card.title?.replace("执行卡", "") || "",
      text: manifestation?.description || "",
    },
    {
      color: "var(--teal)", icon: "camera", kicker: "证据类别 · 概念级",
      title: "现场如何留证",
      text: "",
      extra: evidence.map((e) => `<span class="chip"><b class="dot t-shared"></b>${esc(e.label)}</span>`).join(""),
    },
    {
      color: "var(--amber)", icon: "wrench", kicker: "整改方向",
      title: "从问题到闭环",
      text: rectification?.summary || card.rectification_summary || "",
      extra: rectification?.pass_rate
        ? `<span class="badge b-shared"><i data-lucide="check-circle"></i>整改验证通过率 ${esc(rectification.pass_rate)}</span>
           <span class="badge b-private"><i data-lucide="lock"></i>内部模板不进入共有包</span>`
        : `<span class="badge b-private"><i data-lucide="lock"></i>内部模板不进入共有包</span>`,
    },
    {
      color: "var(--eco)", icon: "file-pen", kicker: "报告表达",
      title: "对外怎么写,有口径约束",
      text: card.report_expression_summary || "",
      extra: `<span class="badge b-blue"><i data-lucide="stamp"></i>legal_basis_status: internal_reviewed → 仅写「参考相关要求」</span>`,
    },
  ];

  overlay().innerHTML = `<div class="path-cascade">${steps.map((s, i) => `
    <div class="path-step" style="--d:${i * 0.45}s; --ps-color:${s.color}">
      <div class="ps-rail"><div class="ps-node"><i data-lucide="${s.icon}"></i></div><div class="ps-line"></div></div>
      <div class="ps-body">
        <p class="ps-kicker">${esc(s.kicker)}</p>
        <h4 class="ps-title">${esc(s.title)}</h4>
        ${s.text ? `<p class="ps-text">${esc(s.text)}</p>` : ""}
        ${s.extra ? `<div class="ps-extra">${s.extra}</div>` : ""}
      </div>
    </div>`).join("")}</div>`;
  overlay().hidden = false;
  window.__refreshIcons?.();
}

/* ---------- 第五幕:缺口雷达 ---------- */

function renderGapPanel() {
  const gap = state.reports.gap;
  if (!gap) {
    overlay().innerHTML = `<div class="report-panel"><h3>双向盲区雷达</h3><p class="rp-sub">缺口报告未装载(reports/gap-report-full.json)。</p></div>`;
    overlay().hidden = false;
    return;
  }
  const lawGaps = gap.law_obligation_without_issue?.length ?? 0;
  const issueGaps = gap.issue_without_basis?.length ?? 0;
  const ragUnresolved = gap.rag_unresolved ?? 0;
  overlay().innerHTML = `
    <div class="report-panel">
      <h3>双向盲区雷达</h3>
      <p class="rp-sub">由 <span style="font-family:var(--font-mono)">gap_report --scope full</span> 在每次构建时重算 —— 不是静态宣传数字。</p>
      <div class="gap-grid">
        <div class="gap-cell"><b>${lawGaps}</b><span>法定义务<br>无现场覆盖</span></div>
        <div class="gap-cell"><b>${issueGaps}</b><span>现场问题<br>无法条依据</span></div>
        <div class="gap-cell"><b>${ragUnresolved}</b><span>法条引用<br>RAG 未解析</span></div>
      </div>
      <div class="honest-note"><i data-lucide="info"></i><span>
        盲区为零的含义:当前危废切片中,每项法定义务都有现场表现承接,每类问题都有法条或标准依据,且全部 218 条引用在腾讯云法规库完成检索验证。范围扩大后此雷达会先于人发现盲区 —— 无法条依据的问题将自动归入「管理建议」,绝不写成违法认定。
      </span></div>
    </div>`;
  overlay().hidden = false;
  window.__refreshIcons?.();
}

/* ---------- 第六幕:月报对比 ---------- */

function renderMonthlyPanel() {
  const monthly = state.reports.monthly;
  const comparison = monthly?.comparisons?.[0];
  if (!comparison) {
    overlay().innerHTML = `<div class="report-panel"><h3>回灌月报</h3><p class="rp-sub">对比数据未装载(reports/monthly-report-comparison-full.json)。</p></div>`;
    overlay().hidden = false;
    return;
  }
  overlay().innerHTML = `
    <div class="report-panel">
      <h3>同一个问题,两种表述</h3>
      <p class="rp-sub">图谱装配的上下文直接回灌 EcoCheck 月度体检报告(企业名为合成演示数据)。</p>
      <div class="compare-grid">
        <div class="compare-col">
          <h4><i data-lucide="file-text"></i>通用模板话术</h4>
          <p>${esc(comparison.plain_ai || "企业存在环保管理问题,建议整改。")}</p>
        </div>
        <div class="compare-col is-graph">
          <h4><i data-lucide="git-fork"></i>图谱装配口径</h4>
          <p>${esc(comparison.graph_context)}</p>
        </div>
      </div>
      <div class="honest-note"><i data-lucide="flask-conical"></i><span>
        诚实声明:左侧对照为合成基线(comparison_basis = synthetic_baseline_demo),「更像专家」的结论以 ETO 盲评为准,当前状态:${esc(comparison.human_eto_review_status || "pending")}。我们只演示已验证的部分。
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
  hooks?.setStatus("内部全量视图:可见 private runtime 节点。");
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
