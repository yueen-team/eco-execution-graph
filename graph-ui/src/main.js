// 入口:数据装载 → 控件绑定 → 计数器 → 搜索 → 演示模式
import {
  createIcons, Scale, FlagTriangleRight, Factory, LockKeyholeOpen, ShieldCheck, Search,
  Presentation, GitFork, Scan, CloudOff, Lock, Camera, Eye, KeyRound, TriangleAlert,
  GitCommitHorizontal, Gauge, Stamp, ChevronLeft, ChevronRight, X, Check, Database,
  BookOpen, Wrench, FilePen, FileText, FileLock, CheckCircle, Info, FlaskConical,
  PanelRightOpen, Ruler, ClipboardCheck, Workflow, Flame, Droplets, ListChecks,
  BarChart3, Zap, Radar, Circle, BarChart, Share2, Spline, MoveDown,
  GitMerge, ArrowRight, Gavel, FolderOpen,
} from "lucide";
import "./styles.css";
import {
  state, applyDataset, ENTRY_CENTERS, EDGE_GROUPS, nodeMeta,
} from "./state.js";
import { initOrUpdateGraph, onNodeSelect, onEdgeSelect, markCenter, relayout, fitGraph } from "./graph.js";
import { renderPanel, renderEdgePanel } from "./panel.js";
import { initDemo, enterDemo, renderUpstreamPanel } from "./demo.js";
import { initReviewWorkspace } from "./review.js";

const ICONS = {
  Scale, FlagTriangleRight, Factory, LockKeyholeOpen, ShieldCheck, Search, Presentation,
  GitFork, Scan, CloudOff, Lock, Camera, Eye, KeyRound, TriangleAlert, GitCommitHorizontal,
  Gauge, Stamp, ChevronLeft, ChevronRight, X, Check, Database, BookOpen, Wrench, FilePen,
  FileText, FileLock, CheckCircle, Info, FlaskConical, PanelRightOpen, Ruler, ClipboardCheck,
  Workflow, Flame, Droplets, ListChecks, BarChart3, Zap, Radar, Circle, BarChart, Share2,
  Spline, MoveDown, GitMerge, ArrowRight, Gavel, FolderOpen,
};
window.__refreshIcons = () => createIcons({ icons: ICONS });
window.__refreshIcons();
window.__app = state; // 调试与渲染验证句柄(只读使用)

const APP_BASE = import.meta.env.BASE_URL || "/";
function appPath(path) {
  return `${APP_BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

/* ---------- 计数器:数字滚动到真实值 ---------- */

const counterState = new Map();
function animateCounter(id, target) {
  const el = document.getElementById(id);
  const from = counterState.get(id) ?? 0;
  if (from === target) { el.textContent = target; return; }
  const t0 = performance.now();
  const dur = 900;
  function tick(t) {
    const p = Math.min((t - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * eased);
    if (p < 1) requestAnimationFrame(tick);
    else counterState.set(id, target);
  }
  requestAnimationFrame(tick);
}

function updateMetrics() {
  animateCounter("nodeCount", state.graph.nodes.length);
  animateCounter("edgeCount", state.graph.edges.length);
  animateCounter("cardCount", state.cards.length);
  animateCounter("sharedCount", state.graph.nodes.filter((n) => n.tier === "shared").length);
}

function setStatus(text) {
  document.getElementById("viewStatus").textContent = text;
}

/* ---------- 选择节点 ---------- */

function selectNode(nodeId, recenter = false) {
  state.centerId = nodeId;
  if (recenter) initOrUpdateGraph();
  else markCenter(nodeId);
  renderPanel(nodeId);
  document.getElementById("centerTitle").textContent =
    state.graph.nodes.find((n) => n.node_id === nodeId)?.name ?? nodeId;
}

onNodeSelect((id) => selectNode(id));
onEdgeSelect((edgeId) => {
  renderEdgePanel(edgeId);
  if (window.matchMedia("(max-width: 1100px)").matches) {
    document.getElementById("detailPanel").classList.add("is-open");
  }
});

// 关联解释卡里的端点按钮:点击跳到该节点
document.getElementById("detailBody").addEventListener("click", (e) => {
  const jump = e.target.closest("[data-jump]");
  if (jump) selectNode(jump.dataset.jump, true);
});

/* ---------- 边类型筛选 chips ---------- */

function renderEdgeFilters() {
  const counts = {};
  for (const edge of state.graph.edges) counts[edge.edge_type] = (counts[edge.edge_type] || 0) + 1;
  const wrap = document.getElementById("edgeFilters");
  wrap.innerHTML = Object.entries(EDGE_GROUPS).map(([key, group]) => {
    const count = group.types.reduce((sum, t) => sum + (counts[t] || 0), 0);
    const on = state.activeEdgeGroups.has(key);
    return `<button class="edge-chip ${on ? "is-on" : ""}" data-group="${key}" style="--chip-color:${group.color}"
        aria-pressed="${on}">
      <span class="chip-dot"></span>${group.label}<span class="chip-count">${count}</span>
    </button>`;
  }).join("");
  wrap.querySelectorAll(".edge-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.group;
      if (state.activeEdgeGroups.has(key)) state.activeEdgeGroups.delete(key);
      else state.activeEdgeGroups.add(key);
      renderEdgeFilters();
      initOrUpdateGraph();
    });
  });
}

/* ---------- 搜索 ---------- */

function bindSearch() {
  const input = document.getElementById("searchInput");
  const list = document.getElementById("searchResults");
  let focusIndex = -1;

  function close() { list.hidden = true; list.innerHTML = ""; focusIndex = -1; }

  function run(q) {
    const query = q.trim().toLowerCase();
    if (!query) { close(); return; }
    const pool = state.view === "shared"
      ? state.graph.nodes.filter((n) => n.tier === "shared")
      : state.graph.nodes;
    const hits = pool.filter((n) =>
      n.name?.toLowerCase().includes(query) || n.node_id?.toLowerCase().includes(query),
    ).slice(0, 8);
    if (!hits.length) {
      list.innerHTML = `<li class="sr-empty">无匹配节点 —— 试试「标签」「台账」「贮存」</li>`;
      list.hidden = false;
      return;
    }
    list.innerHTML = hits.map((n, i) => {
      const meta = nodeMeta(n.node_type);
      return `<li data-id="${n.node_id}" data-i="${i}">
        <b class="dot t-${n.tier}"></b><span class="sr-name">${n.name}</span>
        <span class="sr-type">${meta.label}</span></li>`;
    }).join("");
    list.hidden = false;
    list.querySelectorAll("li[data-id]").forEach((li) => {
      li.addEventListener("click", () => { selectNode(li.dataset.id, true); close(); input.value = ""; });
    });
  }

  input.addEventListener("input", () => run(input.value));
  input.addEventListener("keydown", (e) => {
    const items = [...list.querySelectorAll("li[data-id]")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      focusIndex = (focusIndex + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((li, i) => li.classList.toggle("is-focus", i === focusIndex));
    } else if (e.key === "Enter") {
      const pick = items[focusIndex >= 0 ? focusIndex : 0];
      if (pick) { selectNode(pick.dataset.id, true); close(); input.value = ""; }
    } else if (e.key === "Escape") { close(); input.blur(); }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box")) close();
  });
}

/* ---------- 控件 ---------- */

function syncControls() {
  document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("is-active", b.dataset.view === state.view));
  document.querySelectorAll("[data-product]").forEach((b) => b.classList.toggle("is-active", b.dataset.product === state.product));
  document.querySelectorAll("[data-entry]").forEach((b) => b.classList.toggle("is-active", b.dataset.entry === state.entry));
  document.querySelectorAll("[data-view], [data-product]").forEach((b) => {
    b.disabled = Boolean(state.deployPolicy.readonlyShared);
    b.setAttribute("aria-disabled", state.deployPolicy.readonlyShared ? "true" : "false");
  });
}

function bindControls() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.deployPolicy.readonlyShared) return;
      if (state.view === button.dataset.view) return;
      state.view = button.dataset.view;
      applyDataset();
      syncControls();
      setStatus(state.view === "shared"
        ? "共有视图:已加载共有导出包(shared_product_v1),私有运行层已物理过滤。"
        : "内部全量视图:可见私有运行层(private runtime)节点。");
      updateMetrics();
      renderEdgeFilters();
      initOrUpdateGraph();
      renderPanel(state.centerId);
    });
  });
  document.querySelectorAll("[data-product]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.deployPolicy.readonlyShared) return;
      if (state.product === button.dataset.product) return;
      state.product = button.dataset.product;
      applyDataset();
      state.centerId = ENTRY_CENTERS[state.product][state.entry];
      syncControls();
      updateMetrics();
      renderEdgeFilters();
      initOrUpdateGraph();
      renderPanel(state.centerId);
    });
  });
  document.querySelectorAll("[data-entry]").forEach((button) => {
    button.addEventListener("click", () => {
      state.entry = button.dataset.entry;
      syncControls();
      selectNode(ENTRY_CENTERS[state.product][state.entry], true);
    });
  });
  document.getElementById("fitButton").addEventListener("click", fitGraph);
  document.getElementById("relayoutButton").addEventListener("click", relayout);
  document.getElementById("upstreamButton").addEventListener("click", renderUpstreamPanel);
  document.getElementById("directorButton").addEventListener("click", enterDemo);
  document.getElementById("detailToggle").addEventListener("click", () => {
    document.getElementById("detailPanel").classList.toggle("is-open");
  });
  // 窄屏下显示执行卡浮动按钮
  const mq = window.matchMedia("(max-width: 1100px)");
  const applyMq = () => { document.getElementById("detailToggle").hidden = !mq.matches; };
  mq.addEventListener("change", applyMq);
  applyMq();
}

/* ---------- 启动 ---------- */

async function fetchJson(path, optional = false) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (optional) return null;
    throw err;
  }
}

async function boot() {
  const loading = document.getElementById("stageLoading");
  const errBox = document.getElementById("stageError");
  loading.hidden = false;
  errBox.hidden = true;
  try {
    const deployPolicy = await fetchJson(appPath("/demo-data/deploy-policy.json"), true);
    const readonlyShared = deployPolicy?.readonly_shared === true;
    const allowReviewWorkspace = deployPolicy?.review_workspace === true || !readonlyShared;
    const requireReviewSession = deployPolicy?.review_requires_session === true;
    const reviewApiBase = deployPolicy?.review_api_base || deployPolicy?.graph_api_base || "";
    const [fullGraph, fullCards, fullSharedGraph, fullSharedCards, p1Graph, p1Cards, gap, monthly, upstream] =
      await Promise.all([
        fetchJson(appPath("/demo-data/full-graph.json")),
        fetchJson(appPath("/demo-data/full-cards.json")),
        fetchJson(appPath("/demo-data/full-shared-graph.json")),
        fetchJson(appPath("/demo-data/full-shared-cards.json")),
        fetchJson(appPath("/demo-data/graph.json")),
        fetchJson(appPath("/demo-data/cards.json")),
        fetchJson(appPath("/demo-data/gap-report.json"), true),
        readonlyShared ? Promise.resolve(null) : fetchJson(appPath("/demo-data/monthly-comparison.json"), true),
        fetchJson(appPath("/demo-data/upstream-visibility.json"), true),
      ]);
    if (readonlyShared) {
      state.deployPolicy.readonlyShared = true;
      state.view = "shared";
      state.product = "full";
    }
    state.datasets = {
      full: { graph: fullGraph, cards: fullCards },
      fullShared: { graph: fullSharedGraph, cards: fullSharedCards },
      p1: { graph: p1Graph, cards: p1Cards },
    };
    state.reports = { gap, monthly, upstream };
    applyDataset();
    state.centerId = ENTRY_CENTERS.full.law;

    bindControls();
    bindSearch();
    initDemo({ syncControls, updateMetrics, setStatus });
    await initReviewWorkspace({
      readonlyShared: state.deployPolicy.readonlyShared,
      allowReviewWorkspace,
      requireReviewSession,
      apiBase: reviewApiBase,
      setStatus,
    });

    updateMetrics();
    renderEdgeFilters();
    loading.hidden = true;

    const params = new URLSearchParams(window.location.search);
    if (params.get("upstream") === "1") {
      syncControls();
      setStatus("共有视图:正在展示 eco-kb 上游公共语义骨架接入情况。");
      renderUpstreamPanel();
    } else if (state.deployPolicy.readonlyShared && params.get("director") === "1") {
      syncControls();
      setStatus("云端只读演示:正在播放图谱演示主线。");
      enterDemo();
    } else if (state.deployPolicy.readonlyShared) {
      syncControls();
      setStatus("云端只读演示:仅加载共有导出包(shared_product_v1),内部能力不进入静态包。");
      initOrUpdateGraph();
      selectNode(state.centerId);
    } else if (params.get("director") === "1") {
      enterDemo();
    } else {
      if (params.get("view") === "shared") {
        state.view = "shared";
        applyDataset();
        syncControls();
        setStatus("共有视图:已加载共有导出包(shared_product_v1),私有运行层已物理过滤。");
        updateMetrics();
        renderEdgeFilters();
      }
      initOrUpdateGraph();
      selectNode(state.centerId);
    }
    window.__refreshIcons();
  } catch (error) {
    loading.hidden = true;
    errBox.hidden = false;
    document.getElementById("stageErrorText").textContent = `数据加载失败:${error.message}`;
    document.getElementById("retryButton").onclick = () => boot();
    window.__refreshIcons();
  }
}

boot();
