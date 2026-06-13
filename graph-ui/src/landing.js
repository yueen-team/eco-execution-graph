import "./landing.css";
import cytoscape from "cytoscape";
import { NODE_TYPE_META, EDGE_TYPE_COLOR } from "./state.js";

// 着陆页原则与主应用一致:不编造任何数字、不放概念假图。
// 首屏背景 = 真实 P1 图谱切片生长回放;数字带 = 共有导出包实时计数。

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const APP_BASE = import.meta.env.BASE_URL || "/";
function appPath(path) {
  return `${APP_BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/* ---- 首屏真实图谱生长 ---- */

const HERO_NODE_CAP = 130;

function heroElements(graph) {
  const nodes = graph.nodes.slice(0, HERO_NODE_CAP);
  const ids = new Set(nodes.map((n) => n.node_id));
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  return [
    ...nodes.map((node) => ({
      data: {
        id: node.node_id,
        color: NODE_TYPE_META[node.node_type]?.color || "#8fae9e",
        size: node.node_type === "issue_type" || node.node_type === "law_article" ? 16 : 9,
      },
    })),
    ...edges.map((edge) => ({
      data: {
        id: edge.edge_id,
        source: edge.from,
        target: edge.to,
        color: EDGE_TYPE_COLOR[edge.edge_type] || "#5b7282",
      },
    })),
  ];
}

async function bootHeroGraph() {
  const container = document.getElementById("heroGraph");
  let graph;
  try {
    graph = await fetchJson(appPath("/demo-data/graph.json"));
  } catch {
    return; // 数据不可达时保持纯色背景,不放假图
  }
  const cy = cytoscape({
    container,
    elements: heroElements(graph),
    style: [
      {
        selector: "node",
        style: {
          width: "data(size)",
          height: "data(size)",
          "background-color": "data(color)",
          "background-opacity": 0.85,
          label: "",
          "border-width": 0,
        },
      },
      {
        selector: "edge",
        style: {
          width: 1,
          "line-color": "data(color)",
          "line-opacity": 0.34,
          "curve-style": "haystack",
        },
      },
    ],
    layout: { name: "cose", animate: false, nodeRepulsion: 9000, idealEdgeLength: 60, padding: 60 },
    userZoomingEnabled: false,
    userPanningEnabled: false,
    boxSelectionEnabled: false,
    autoungrabify: true,
    pixelRatio: 1,
  });
  cy.fit(undefined, 40);

  if (reduceMotion) return;

  // 生长回放:全体先隐藏,按波次浮现;之后缓慢呼吸式缩放漂移
  const els = cy.elements();
  els.style("opacity", 0);
  els.forEach((el, index) => {
    setTimeout(() => el.animate({ style: { opacity: el.isNode() ? 1 : 0.6 } }, { duration: 600 }), 250 + index * 14);
  });
  const drift = () => {
    cy.animate(
      { zoom: cy.zoom() * 1.06, center: { eles: els } },
      {
        duration: 14000,
        easing: "ease-in-out-sine",
        complete: () => {
          cy.animate(
            { zoom: cy.zoom() / 1.06, center: { eles: els } },
            { duration: 14000, easing: "ease-in-out-sine", complete: drift },
          );
        },
      },
    );
  };
  setTimeout(drift, els.length * 14 + 1200);
}

/* ---- 真实数字带 ---- */

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  if (reduceMotion) { el.textContent = String(target); return; }
  const t0 = performance.now();
  const dur = 1400;
  const tick = (t) => {
    const p = Math.min((t - t0) / dur, 1);
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function bootStats() {
  try {
    const [graph, cards] = await Promise.all([
      fetchJson(appPath("/demo-data/full-shared-graph.json")),
      fetchJson(appPath("/demo-data/full-shared-cards.json")),
    ]);
    animateCounter("statNodes", graph.nodes.length);
    animateCounter("statEdges", graph.edges.length);
    animateCounter("statCards", Array.isArray(cards) ? cards.length : (cards.cards?.length ?? 0));
    animateCounter("statIssues", graph.nodes.filter((n) => n.node_type === "issue_type").length);
  } catch {
    document.querySelector(".stats-note").textContent = "共有导出包未装载,数字带已隐藏 —— 本页不显示任何静态宣传数。";
    document.querySelectorAll(".stat").forEach((el) => { el.hidden = true; });
  }
}

/* ---- 滚动浮现 ---- */

function bootReveal() {
  if (reduceMotion) return;
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    }),
    { threshold: 0.18 },
  );
  document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
}

bootHeroGraph();
bootStats();
bootReveal();
