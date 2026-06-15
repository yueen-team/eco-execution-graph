// 图谱演示模式:5 张精品开场 + 危废专题全量目录。所有数字与文本来自 pipeline 真实导出,诚实标注未证明项。
import { state, applyDataset, ENTRY_CENTERS, reviewStatusLabel, LEGAL_BASIS_LABEL } from "./state.js";
import {
  initOrUpdateGraph, privateExitAnimation, spotlightEdges,
  clearSpotlight, setDemoNodeFilter, hideTooltip,
} from "./graph.js";
import { renderPanel } from "./panel.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let hooks = null; // { syncControls, updateMetrics, setStatus }
export function initDemo(h) { hooks = h; bindDemoControls(); }
let demoTransitioning = false;

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

const FALLBACK_DIRECTOR_CARDS = [
  {
    card_id: "card:full:0003",
    title: "危废包装容器标签信息不完整或与实物、台账不一致执行卡",
    external_expression: "先从最容易看懂的现场标签开始:只建议核查标签、实物、台账和平台记录是否一致,不做违法认定。",
  },
  {
    card_id: "card:full:0011",
    title: "危废包装容器“一物一码”与平台记录核查执行卡",
    external_expression: "第二步看“一物一码”和平台记录:建议核查二维码、数字识别码、电子台账与平台记录的对应关系。",
  },
  {
    card_id: "card:full:0001",
    title: "危险废物管理台账记录不完整执行卡",
    external_expression: "第三步进入台账主线:建议核查产生、入库、出库、月度汇总、平台申报和联单回填是否一致。",
  },
  {
    card_id: "card:full:0005",
    title: "危废出入库记录、电子标签二维码与转移联单不一致执行卡",
    external_expression: "第四步看转移闭环:出入库记录、电子标签二维码与转移联单之间只表述为存在不一致风险,建议核查闭环。",
  },
  {
    card_id: "card:full:0012",
    title: "危废暂存场所防渗、防漏及泄漏收集措施不完善执行卡",
    external_expression: "第五步落到暂存实体风险:防渗、防漏和泄漏收集措施存在管理风险时,建议结合危废形态和数量进一步完善。",
  },
];

const FALLBACK_DIRECTOR_BY_ID = new Map(FALLBACK_DIRECTOR_CARDS.map((card) => [card.card_id, card]));

function directorCards() {
  const cards = state.datasets.full?.cards || [];
  const ordered = cards
    .filter((card) => Number.isFinite(Number(card.director_demo_order)))
    .sort((a, b) => Number(a.director_demo_order) - Number(b.director_demo_order));
  if (ordered.length) return ordered;
  const byCardId = new Map(cards.map((card) => [card.card_id, card]));
  return FALLBACK_DIRECTOR_CARDS.map((fallback) => byCardId.get(fallback.card_id) || {
    ...fallback,
    external_expression: `${fallback.external_expression} 执行卡数据未装载时使用保底标题,请检查执行卡导出(full-cards)。`,
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
  hooks?.setStatus(`图谱演示:正在查看执行卡 ${card?.card_id || cardId},已定位到根问题类型。`);
}

function hazardousSliceCards() {
  const cards = state.datasets.full?.cards || state.cards || [];
  return cards
    .filter((card) => card.hazardous_slice_scope === "危废全量切片" || /危废|危险废物|hazwaste|HAZWASTE/.test(`${card.title || ""} ${card.root_issue_type || ""}`))
    .sort((a, b) => (Number(a.hazardous_slice_order) || 9999) - (Number(b.hazardous_slice_order) || 9999));
}

function buildCardActs() {
  return directorCards().map((card, index) => ({
    kicker: `第${index + 1}张卡`,
    title: cleanCardTitle(card),
    narration: card.external_expression || "这张卡来自图谱切片,对外只说建议核查、建议完善或存在管理风险,不替代人工审核和监管认定。",
    run: () => focusDirectorCard(card.card_id),
  }));
}

/* ---------- 各幕 ---------- */

const SUPPORT_ACTS = [
  {
    kicker: "上游骨架",
    title: "已接入,也要看得见",
    narration: "先把底座讲清楚:eco-semantic-knowledge-base 提供已审核公共基线,现场经验和私有判断仍留在现场执行图谱治理膜内。",
    run() {
      renderUpstreamPanel();
    },
  },
  {
    kicker: "危废专题",
    title: "危废全量切片目录",
    narration: "开场 5 张讲价值,这一幕展示危废相关切片已经形成目录:精品卡、扩展卡、合并展示卡和候补切片各有边界。",
    run() {
      clearStage();
      setView("shared", "full");
      initOrUpdateGraph({ skipAnimation: true });
      renderHazardousSliceCatalog();
    },
  },
  {
    kicker: "缺口报告",
    title: "把盲区先暴露出来",
    narration: "危废目录之后看缺口报告:哪些义务没有现场覆盖,哪些问题无法条依据。无法条依据只进入管理建议。",
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

function demoActs() {
  return [...buildCardActs(), ...SUPPORT_ACTS];
}

/* ---------- 5 张执行卡主线 ---------- */

function cleanCardTitle(card) {
  return (card?.title || FALLBACK_DIRECTOR_BY_ID.get(card?.card_id)?.title || "图谱演示执行卡").replace(/执行卡$/, "");
}

function renderDirectorCardOverlay(card) {
  const cards = directorCards();
  const quality = card?.quality_score;
  const rootIssue = card?.root_issue_type || card?.field_manifestations?.[0]?.issue_type_ref || "未装载";

  overlay().innerHTML = `<aside class="path-cascade" aria-label="演示目录">
    <p class="demo-rail-kicker">演示目录</p>
    <p class="demo-rail-note">主舞台在图谱画布:高亮流动的边就是当前讲解路径。</p>
    <div class="demo-chapters">${cards.map((item, i) => {
    const isActive = item.card_id === card?.card_id;
    const isDone = i < cards.findIndex((candidate) => candidate.card_id === card?.card_id);
    return `
      <div class="path-step ${isActive ? "is-active" : ""}${isDone ? " is-done" : ""}" style="--d:${i * 0.06}s">
        <div class="ps-rail">
          <div class="ps-node"><i data-lucide="${isActive ? "flag-triangle-right" : isDone ? "check" : "circle"}"></i></div>
          <div class="ps-line"></div>
        </div>
        <div class="ps-body">
          <p class="ps-kicker">${i + 1}/${cards.length} · ${esc(item.card_id)}</p>
          <h4 class="ps-title">${esc(cleanCardTitle(item))}</h4>
          ${isActive ? `<p class="ps-now">正在演示</p>` : ""}
        </div>
      </div>`;
  }).join("")}</div>
    <div class="demo-live-card">
      <p>当前图谱动作</p>
      <strong>现场问题 → 证据链 → 整改闭环 → 报告表达</strong>
      <span>根问题:${esc(rootIssue)}${quality ? ` · 置信度 ${esc((quality.confidence ?? 0).toFixed(2))}` : ""}</span>
      <span>${esc(reviewStatusLabel(card?.review_status) || "待装载审核状态")} · ${esc(LEGAL_BASIS_LABEL[card?.legal_basis_status] || "内部已审核")}</span>
    </div>
  </aside>`;
  overlay().hidden = false;
  window.__refreshIcons?.();
}

/* ---------- 第六幕:危废专题全量目录 ---------- */

function renderHazardousSliceCatalog() {
  const cards = hazardousSliceCards();
  const roleCounts = cards.reduce((acc, card) => {
    const role = card.hazardous_slice_role || "未分组切片";
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});
  const featured = cards.slice(0, 12);
  overlay().innerHTML = `
    <div class="report-panel hazard-catalog-panel">
      <h3>危废全量切片目录</h3>
      <p class="rp-sub">目录来自 full-cards 图谱切片字段,不是手工页面。合并展示卡只证明覆盖,不单独包装成主任主线。</p>
      <div class="slice-summary-grid">
        <div class="gap-cell"><b>${cards.length}</b><span>危废相关<br>执行卡切片</span></div>
        <div class="gap-cell"><b>${roleCounts["主任开场精品"] || 0}</b><span>阶段一<br>精品开场</span></div>
        <div class="gap-cell"><b>${cards.length - (roleCounts["主任开场精品"] || 0)}</b><span>阶段二<br>专题目录</span></div>
      </div>
      <div class="slice-list" aria-label="危废专题切片目录">
        ${featured.map((card) => `
          <button class="slice-row" data-card-id="${esc(card.card_id)}">
            <span class="slice-no">${esc(card.hazardous_slice_order || "")}</span>
            <span class="slice-main">
              <strong>${esc(cleanCardTitle(card))}</strong>
              <small>${esc(card.hazardous_slice_role || "未分组切片")} · ${esc(card.hazardous_slice_display_policy || "目录展示")}</small>
            </span>
            <span class="slice-score">${esc((card.quality_score?.confidence ?? 0).toFixed(2))}</span>
          </button>`).join("")}
      </div>
      <div class="honest-note"><i data-lucide="shield-check"></i><span>
        这一幕可以说明“危废已经不是 5 张孤立卡”,但仍坚持 shared 视图:不展示企业实例、附件路径、证据判定标准、整改模板、报告表达模板和法条全文。
      </span></div>
    </div>`;
  overlay().hidden = false;
  overlay().querySelectorAll("[data-card-id]").forEach((button) => {
    button.addEventListener("click", () => focusDirectorCard(button.dataset.cardId));
  });
  window.__refreshIcons?.();
}

/* ---------- 上游公共语义骨架 ---------- */

export function renderUpstreamPanel() {
  clearStage();
  setView("shared", "full");
  initOrUpdateGraph({ skipAnimation: true });
  const upstream = state.reports.upstream;
  if (!upstream) {
    overlay().innerHTML = `<div class="report-panel"><h3>上游骨架</h3><p class="rp-sub">上游骨架摘要未装载(demo-data/upstream-visibility.json)。请先运行 pnpm upstream:visibility。</p></div>`;
    overlay().hidden = false;
    return;
  }
  const metrics = upstream.visible_metrics || [];
  const nodeCounts = upstream.node_counts || [];
  const edgeCounts = upstream.edge_counts || [];
  const assets = (upstream.asset_rows || []).slice(0, 6);
  overlay().innerHTML = `
    <div class="report-panel upstream-panel">
      <p class="rp-kicker">上游骨架 · 已接入</p>
      <h3>${esc(upstream.title || "上游公共语义骨架接入可见化")}</h3>
      <p class="rp-sub">${esc(upstream.plain_summary || "")}</p>
      <div class="upstream-metrics">
        ${metrics.map((item) => `
          <div class="gap-cell"><b>${esc(item.value)}</b><span>${esc(item.label)}<br>${esc(item.unit || "")}</span></div>`).join("")}
      </div>
      <div class="upstream-columns">
        <section>
          <h4><i data-lucide="database"></i>导入资产</h4>
          <div class="upstream-assets">
            ${assets.map((item) => `
              <div class="asset-row">
                <strong>${esc(item["资产名称"])}</strong>
                <span>${esc(item["导入状态"])} · ${esc(item["记录数量"])} 条</span>
              </div>`).join("")}
          </div>
        </section>
        <section>
          <h4><i data-lucide="spline"></i>变成图里的什么</h4>
          <div class="mini-bars">
            ${nodeCounts.map((item) => miniBar(item.label, item.value)).join("")}
          </div>
        </section>
        <section>
          <h4><i data-lucide="git-fork"></i>支撑哪些关联</h4>
          <div class="mini-bars">
            ${edgeCounts.map((item) => miniBar(item.label, item.value)).join("")}
          </div>
        </section>
      </div>
      <div class="upstream-lock">
        <span>锁定仓库</span><strong>${esc(upstream.repo?.["名称"])}</strong>
        <span>锁定提交</span><code>${esc((upstream.repo?.["提交"] || "").slice(0, 12))}</code>
      </div>
      <div class="honest-note"><i data-lucide="shield-check"></i><span>
        ${esc(upstream.demo_line || "公开标准给骨架,现场经验给血肉。")} ${esc((upstream.role_boundary || []).join(" "))}
      </span></div>
    </div>`;
  overlay().hidden = false;
  hooks?.setStatus("共有视图:正在展示 eco-kb 上游公共语义骨架接入情况。");
  window.__refreshIcons?.();
}

function miniBar(label, value) {
  const width = Math.max(8, Math.min(100, Number(value) / 8));
  return `<div class="mini-bar"><span>${esc(label)}</span><div><b style="width:${width}%"></b></div><strong>${esc(value)}</strong></div>`;
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
        本次图谱演示收束在 5 张精品开场、危废全量目录、缺口报告和授权边界。不演示云南踩雷地图,不演示月报对比,不把“建议核查/建议完善/存在管理风险”升级成违法认定。
      </span></div>
    </div>`;
  overlay().hidden = false;
  window.__refreshIcons?.();
}

/* ---------- 演示条与导航 ---------- */

function renderDemoBar() {
  const bar = document.getElementById("demoBar");
  const acts = demoActs();
  const act = acts[state.demo.act];
  document.getElementById("demoKicker").textContent = `图谱演示 · ${act.kicker}`;
  document.getElementById("demoTitle").textContent = act.title;
  document.getElementById("demoNarration").textContent = act.narration;
  const progress = document.getElementById("demoProgress");
  progress.innerHTML = acts.map((a, i) =>
    `<button data-act="${i}" class="${i < state.demo.act ? "is-done" : ""}${i === state.demo.act ? "is-now" : ""}"
       title="${esc(a.kicker)} ${esc(a.title)}" aria-label="${esc(a.title)}"></button>`,
  ).join("");
  progress.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => gotoAct(Number(b.dataset.act))),
  );
  document.getElementById("demoNext").innerHTML =
    state.demo.act >= acts.length - 1 ? `收幕<i data-lucide="check"></i>` : `下一幕<i data-lucide="chevron-right"></i>`;
  bar.hidden = false;
  window.__refreshIcons?.();
}

export function gotoAct(index) {
  if (demoTransitioning || index < 0) return;
  const acts = demoActs();
  const directorCount = directorCards().length;
  if (index >= acts.length) {
    // 对外只读演示:收幕不回退到内部工作区,而是落到「下一步」CTA(预约/登录/重看)。
    // 内部用户(非只读)收幕仍回到自己的图谱工作区。
    if (state.deployPolicy?.readonlyShared) renderClosingCta();
    else exitDemo();
    return;
  }
  const previousAct = state.demo.act;
  const isCardToCard = previousAct >= 0 && previousAct < directorCount && index >= 0 && index < directorCount;
  if (isCardToCard && previousAct !== index) {
    demoTransitioning = true;
    document.body.classList.add("demo-transitioning");
    setTimeout(() => {
      state.demo.act = index;
      acts[index].run();
      renderDemoBar();
    }, 180);
    setTimeout(() => {
      document.body.classList.remove("demo-transitioning");
      demoTransitioning = false;
    }, 760);
    return;
  }
  state.demo.act = index;
  acts[index].run();
  renderDemoBar();
}

/* ---------- 收幕:回落 CTA(对外只读演示) ---------- */

function renderClosingCta() {
  clearStage();
  document.getElementById("demoBar").hidden = true;
  state.demo.active = false; // 已收幕:键盘导航停在终态,仅保留重看/返回
  overlay().innerHTML = `
    <div class="report-panel demo-closing">
      <p class="rp-kicker">图谱演示 · 已收幕</p>
      <h3>看得见的能力,带不走的判断<br>接下来,想怎么用?</h3>
      <p class="rp-sub">刚才这条主线,是 5 张精品开场 → 危废全量目录 → 缺口报告 → 授权边界的真实切片。两类人,两条路:</p>
      <div class="demo-closing-grid">
        <a class="demo-closing-card" href="./landing.html#contact">
          <span class="dcc-tag">对外 · 了解评估</span>
          <strong>预约现场演示</strong>
          <span class="dcc-sub">约一场带真实数据的现场演示。</span>
        </a>
        <a class="demo-closing-card is-blue" href="./login.html">
          <span class="dcc-tag">对内 · 入图审核</span>
          <strong>内部登录 · 进入审核台</strong>
          <span class="dcc-sub">登录后直达现场经验入图审核台。</span>
        </a>
      </div>
      <div class="demo-closing-foot">
        <button id="demoReplay" class="btn-ghost">↻ 重看演示</button>
        <a class="demo-closing-back" href="./landing.html">← 返回首页</a>
      </div>
    </div>`;
  overlay().hidden = false;
  document.getElementById("demoReplay")?.addEventListener("click", enterDemo);
  window.__refreshIcons?.();
}

export function enterDemo() {
  state.demo.active = true;
  document.body.classList.add("demo-active");
  gotoAct(0);
}

export function exitDemo() {
  demoTransitioning = false;
  state.demo.active = false;
  state.demo.act = 0;
  document.body.classList.remove("demo-active", "demo-transitioning");
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
