import "./landing.css";
import { mountHeroScene } from "./heroScene.js";

// 着陆页原则与主应用一致:不编造任何数字、不放概念假图。
// 首屏背景 = 真实图谱切片"当面织成"的电影感场景;数字带 = 共有导出包实时计数。

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// 标记 JS 已就绪:入场动画的"前置隐藏态"只在有此标记时生效,
// JS 失效 / 无脚本环境下文案保持默认可见(揭幕只增强,不遮挡内容)。
document.documentElement.classList.add("js");
const APP_BASE = import.meta.env.BASE_URL || "/";
function appPath(path) {
  return `${APP_BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/* ---- 首屏开场电影:数字驱动细胞生长 → 退为背景 → 居中文案浮现 ---- */

function setCounters(targets, p) {
  for (const id of Object.keys(targets)) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(Math.round(targets[id] * p));
  }
}

let heroCopyRevealed = false;

function revealHeroCopy(targets = null) {
  if (heroCopyRevealed) return;
  heroCopyRevealed = true;
  if (targets) setCounters(targets, 1); // 落定显示精确真实数(左下角常驻,不隐去)
  document.querySelector(".hero-copy")?.classList.add("in");
  // 「会生长」三字长成后解除裁剪,开启呼吸辉光
  if (!reduceMotion) {
    setTimeout(() => document.querySelector(".grow-word")?.classList.add("grown"), 1750);
  } else {
    document.querySelector(".grow-word")?.classList.add("grown");
  }
}

async function bootHero() {
  const container = document.getElementById("heroGraph");
  let graph, cards;
  try {
    [graph, cards] = await Promise.all([
      fetchJson(appPath("/demo-data/full-shared-graph.json")),
      fetchJson(appPath("/demo-data/full-shared-cards.json")),
    ]);
  } catch {
    // 数据不可达:保持纯色背景,直接呈现文案,不放假图、不显示宣传数
    revealHeroCopy();
    return;
  }
  const targets = {
    statNodes: graph.nodes.length,
    statEdges: graph.edges.length,
    statCards: Array.isArray(cards) ? cards.length : (cards.cards?.length ?? 0),
    statIssues: graph.nodes.filter((n) => n.node_type === "issue_type").length,
  };
  if (!container || !graph?.nodes?.length) { revealHeroCopy(targets); return; }

  const revealFallback = window.setTimeout(
    () => revealHeroCopy(targets),
    reduceMotion ? 0 : 11500,
  );
  mountHeroScene(container, graph, {
    reduceMotion,
    onGrowth: (p) => setCounters(targets, p), // 数字随细胞生长跳动
    onReveal: () => {
      window.clearTimeout(revealFallback);
      revealHeroCopy(targets);
    },  // 织成 → 退为背景 → 文案浮现
  });
}

/* ---- 滚动浮现 ---- */

function bootReveal() {
  const revealVisible = () => {
    document.querySelectorAll("[data-reveal]:not(.in)").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
        el.classList.add("in");
      }
    });
  };
  if (reduceMotion) {
    revealVisible();
    return;
  }
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
  requestAnimationFrame(revealVisible);
  window.addEventListener("hashchange", () => setTimeout(revealVisible, 80));
}

bootHero();
bootReveal();
