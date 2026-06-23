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
    // 末字破土生长结束(delay 1.42s + 时长 1.75s ≈ 3.17s)后再解除裁剪、起呼吸辉光
    setTimeout(() => document.querySelector(".grow-word")?.classList.add("grown"), 3300);
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

/* ---- 叙事光流:置信度主轨随滚动充能 + 节点旁白 ---- */

function bootStory() {
  const story = document.getElementById("story");
  const rail = story?.querySelector(".story-rail");
  const confEl = document.getElementById("storyConf");
  const stageEl = document.getElementById("storyStage");
  const readout = story?.querySelector(".story-readout");
  if (!story || !confEl || !stageEl || !readout) return;

  const beats = [...story.querySelectorAll("[data-beat]")];
  const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

  // 与闭环同款"播放头驱动"的元素:到视口中线才点亮 / 出现(滚回则复原)
  const audRows = [...document.querySelectorAll(".aud-row")];
  const tiers = [...document.querySelectorAll(".tier")];
  const note = document.querySelector(".loop-note");
  const riseEls = [...document.querySelectorAll("[data-rise]")];

  // 缩减动效:直接落到终态,全部点亮 / 出现,不做滚动驱动
  if (reduceMotion) {
    confEl.textContent = "71";
    stageEl.textContent = "整改验证 · 一次次挣回来";
    audRows.forEach((e) => e.classList.add("lit"));
    tiers.forEach((e) => e.classList.add("lit"));
    note?.classList.add("lit");
    riseEls.forEach((e) => e.classList.add("shown"));
    return;
  }

  // 数字"挣回来":每经过一个节点,平滑跳到该节点的置信度
  let shownConf = 0;
  let tweenId = 0;
  function tweenConf(target) {
    cancelAnimationFrame(tweenId);
    const from = shownConf;
    const start = performance.now();
    const dur = 620;
    const step = (now) => {
      const t = clamp01((now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      shownConf = from + (target - from) * eased;
      confEl.textContent = String(Math.round(shownConf));
      if (t < 1) tweenId = requestAnimationFrame(step);
      else shownConf = target;
    };
    tweenId = requestAnimationFrame(step);
  }

  // 激活状态直接由滚动位置推导(对快速甩动 / 跳转都稳,不会漏拍)
  let activeIdx = -1;
  const loopBeats = beats.filter((b) => b.matches(".loop-line li"));

  // 主轨充能 + 领光点下行 + 当前节点旁白:以视口中线为播放头
  let ticking = false;
  const draw = () => {
    ticking = false;
    const rect = story.getBoundingClientRect();
    const playhead = window.innerHeight * 0.5;
    const p = clamp01((playhead - rect.top) / rect.height);
    story.style.setProperty("--story-p", p.toFixed(4));
    rail.style.setProperty("--story-cap", `${(p * rect.height).toFixed(1)}px`);

    // 窄屏底部 HUD:仅当叙事段落跨过视口中段时浮现
    const vh = window.innerHeight;
    document.body.classList.toggle(
      "story-active",
      rect.top < vh * 0.55 && rect.bottom > vh * 0.45,
    );

    // 播放头扫过的最后一个节点 = 当前旁白
    let idx = -1;
    for (let i = 0; i < beats.length; i++) {
      if (beats[i].getBoundingClientRect().top <= playhead) idx = i;
    }
    // 闭环节点:被扫过即点亮(累积"挣得"感)
    loopBeats.forEach((li) => {
      li.classList.toggle("lit", li.getBoundingClientRect().top <= playhead);
    });
    // 受众 / 红线标题 + 硬约束框:同样到中线才点亮(滚回则熄灭,可重复)
    audRows.forEach((el) => {
      el.classList.toggle("lit", el.getBoundingClientRect().top <= playhead);
    });
    tiers.forEach((el) => {
      el.classList.toggle("lit", el.getBoundingClientRect().top <= playhead);
    });
    if (note) note.classList.toggle("lit", note.getBoundingClientRect().top <= playhead);
    // 行动区:文案/按钮从底部缓慢升起(进入视口下三分之一即触发)
    const riseLine = vh * 0.84;
    riseEls.forEach((el) => {
      el.classList.toggle("shown", el.getBoundingClientRect().top <= riseLine);
    });
    if (idx !== activeIdx) {
      activeIdx = idx;
      if (idx < 0) {
        tweenConf(0);
        stageEl.textContent = "置信度 · 从零起步";
        readout.dataset.tone = rail.dataset.tone = "up";
      } else {
        const el = beats[idx];
        tweenConf(Number(el.dataset.conf) || 0);
        stageEl.textContent = el.dataset.stage || "";
        const tone = el.dataset.tone || "up";
        readout.dataset.tone = rail.dataset.tone = tone;
      }
    }
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(draw);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  draw();
}

bootHero();
bootReveal();
bootStory();
