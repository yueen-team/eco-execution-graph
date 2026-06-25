// 演示序章:把真实的 483 节点知识图谱铺成一张会呼吸/发光的网络星座,
// 然后镜头"俯冲"进危废切片,交接给 Cytoscape 主舞台。
// 复用 heroScene 的渲染气质(伪 3D 倾斜 + bloom 辉光 + 沿边信号脉冲 + hub 点火),
// 但拓扑是 state.graph 的真实节点与边(按度数向心、按类型分瓣),纯 vanilla Canvas2D、零依赖。
import { nodeMeta, EDGE_TYPE_COLOR } from "./state.js";

const ECO = "#2ee6a8";
const PALETTE = ["#2ee6a8", "#3fe6c2", "#5aa7ff", "#f5b84d", "#a78bfa", "#2dd4bf", "#fb7185"];
const LINE_COLOR = "#49c8a6"; // 网线统一冷绿,克制不抢节点

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// 时间线(ms)
const GROWTH_MS = 3400;   // 节点由内向外点亮
const NODE_GROW = 520;
const DIVE_MS = 1050;

function withAlpha(hex, a) {
  const h = (hex || ECO).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// 去饱和:把颜色按亮度向灰收(amt 越大越灰),让节点颜色克制不刺眼
function desat(hex, amt) {
  const h = (hex || ECO).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const x = (c) => Math.round(c + (l - c) * amt).toString(16).padStart(2, "0");
  return `#${x(r)}${x(g)}${x(b)}`;
}

export function mountCockpitOverture(container, graph, opts = {}) {
  const reduceMotion = !!opts.reduceMotion;
  const canvas = document.createElement("canvas");
  canvas.className = "ov-canvas-el";
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: true });
  const rnd = mulberry32(20260623);

  // ---- 真实拓扑 → 度数 / 类型 ----
  const rawNodes = graph?.nodes || [];
  const rawEdges = graph?.edges || [];
  const idx = new Map(rawNodes.map((n, i) => [n.node_id, i]));
  const deg = new Array(rawNodes.length).fill(0);
  for (const e of rawEdges) {
    const a = idx.get(e.from), b = idx.get(e.to);
    if (a == null || b == null || a === b) continue;
    deg[a]++; deg[b]++;
  }
  const maxDeg = Math.max(1, ...deg);
  const edges = []; // 渲染用的边 = 邻近网(下方按布局最近邻重建,保证均匀连通成网)

  // 类型 → 扇区角(同类节点聚成"瓣"),固定排序保证确定性
  const types = [...new Set(rawNodes.map((n) => n.node_type))].sort();
  const sector = new Map(types.map((t, i) => [t, (i / Math.max(1, types.length)) * Math.PI * 2]));
  const typeCursor = new Map();

  const nodes = rawNodes.map((n, i) => {
    const isHub = deg[i] >= Math.max(6, maxDeg * 0.42);
    // 均匀铺满整张盘(含中心,sqrt = 面积均匀),枢纽略向心
    const rBase = 0.1 + Math.sqrt(rnd()) * 0.92;
    const rNorm = isHub ? rBase * 0.56 : rBase;
    // 类型扇区 + 黄金角填充 + 抖动
    const k = (typeCursor.get(n.node_type) || 0); typeCursor.set(n.node_type, k + 1);
    const ang = sector.get(n.node_type) + k * 2.399963 * 0.11 + (rnd() - 0.5) * 0.5;
    const meta = nodeMeta(n.node_type);
    return {
      nx: Math.cos(ang) * rNorm,
      ny: Math.sin(ang) * rNorm,
      z: (rnd() - 0.5) * 0.9,
      color: desat(meta.color || ECO, 0.42),
      rad: 1.3 + Math.min(deg[i], 8) * 0.3 + (isHub ? 1.5 : 0),
      isHub,
      wob: rnd() * Math.PI * 2, wobr: 0.4 + rnd() * 0.7, wph: 0.6 + rnd() * 0.8,
      birth: GROWTH_MS * Math.pow(clamp01(rNorm / 1.04), 1.05), // 由内向外点亮
    };
  });
  const total = nodes.length;

  // ---- 邻近网:每个点连最近的 K 个邻居 → 均匀连通、更密的立体网(全短边、常驻不剔除) ----
  const K = 5;
  const meshSet = new Set();
  for (let i = 0; i < total; i++) {
    const dl = [];
    for (let j = 0; j < total; j++) {
      if (j === i) continue;
      const dx = nodes[i].nx - nodes[j].nx, dy = nodes[i].ny - nodes[j].ny, dz = (nodes[i].z - nodes[j].z) * 0.45;
      dl.push([j, dx * dx + dy * dy + dz * dz]);
    }
    dl.sort((p, q) => p[1] - q[1]);
    for (let k = 0; k < K && k < dl.length; k++) {
      const j = dl[k][0];
      const key = i < j ? i + "-" + j : j + "-" + i;
      if (meshSet.has(key)) continue;
      meshSet.add(key);
      edges.push({ a: i, b: j, bornAt: Math.max(nodes[i].birth, nodes[j].birth) });
    }
  }

  // 正面彩色尘埃:屏幕均匀分布(含中心),轻微漂移 + 闪烁 + 鼠标视差
  const MOTES = reduceMotion ? 0 : 74;
  const motes = Array.from({ length: MOTES }, () => ({
    x: rnd(), y: rnd(), r: 0.6 + rnd() * 2.4,
    color: desat(PALETTE[Math.floor(rnd() * PALETTE.length)], 0.4),
    vx: (rnd() - 0.5) * 0.00007, vy: (rnd() - 0.5) * 0.00007,
    ph: rnd() * Math.PI * 2, tw: 0.5 + rnd() * 0.9, depth: 0.25 + rnd() * 0.75,
  }));

  // 邻接表 + 移动粒子:粒子在邻近网里前向漫游(每点 ≥3 邻居,永远有"非回头边"可走,不会来回)
  const adj = Array.from({ length: total }, () => []);
  edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
  function spawnPacket() {
    const ei = Math.floor(rnd() * edges.length);
    const e = edges[ei]; const fwd = rnd() < 0.5;
    return { ei, from: fwd ? e.a : e.b, to: fwd ? e.b : e.a, t: rnd(), speed: 0.16 + rnd() * 0.18, color: desat(PALETTE[Math.floor(rnd() * PALETTE.length)], 0.3) };
  }
  const PK = reduceMotion ? 0 : 40;
  const packets = Array.from({ length: PK }, spawnPacket);

  // 俯冲目标(危废根问题),取不到就用最高度数节点
  let diveTarget = idx.get(opts.targetId);
  if (diveTarget == null) { diveTarget = 0; for (let i = 1; i < total; i++) if (deg[i] > deg[diveTarget]) diveTarget = i; }

  let W = 0, H = 0, dpr = 1, worldScale = 1, focal = 1;
  function fit() {
    const rect = container.getBoundingClientRect();
    W = Math.max(320, rect.width); H = Math.max(320, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 竖向受限的横椭圆:绝不溢出上下,横向按视口比例铺开
    const aspect = Math.min(1.7, Math.max(1, W / H));
    const wsY = H * 0.42;
    worldScale = wsY; focal = wsY * 3.2;
    for (const n of nodes) { n.wx = n.nx * wsY * aspect; n.wy = n.ny * wsY; n.wz = n.z * wsY; }
  }

  const glowCache = new Map();
  function glow(color, radius) {
    const key = color + "@" + Math.round(radius);
    let c = glowCache.get(key); if (c) return c;
    const s = Math.max(6, Math.ceil(radius * 6));
    c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, withAlpha(color, 1)); grd.addColorStop(0.3, withAlpha(color, 0.5));
    grd.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    glowCache.set(key, c); return c;
  }

  // ---- 伪 3D 倾斜 + 鼠标视差 ----
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  function onPointer(e) {
    const rect = container.getBoundingClientRect();
    pointer.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  }
  let rotX = 0, rotY = 0, cX = 1, sX = 0, cY = 1, sY = 0;
  function project(wx, wy, wz) {
    const x1 = wx * cY + wz * sY, z1 = -wx * sY + wz * cY;
    const y1 = wy * cX - z1 * sX, z2 = wy * sX + z1 * cX;
    const f = focal / (focal + z2);
    return [W / 2 + x1 * f, H * 0.5 + y1 * f, f];
  }

  let start = null, raf = 0, running = true, prevNow = 0;
  let dive = null; // { t0, fx, fy, done }

  function draw(now) {
    if (!running) return;
    if (start == null) start = now;
    const t = now - start;
    ctx.clearRect(0, 0, W, H);

    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    const growthP = clamp01(t / GROWTH_MS);
    const ramp = reduceMotion ? 0 : clamp01((t - 400) / 2600);
    rotY = reduceMotion ? 0 : (Math.sin(t / 6500) * 0.28 + pointer.x * 0.4) * ramp;
    rotX = reduceMotion ? 0 : (Math.sin(t / 8200) * 0.15 + pointer.y * -0.24) * ramp;
    cX = Math.cos(rotX); sX = Math.sin(rotX); cY = Math.cos(rotY); sY = Math.sin(rotY);

    const dt = prevNow ? Math.min(0.05, (now - prevNow) / 1000) : 0.016; prevNow = now;

    // 投影
    for (let i = 0; i < total; i++) {
      const nd = nodes[i];
      nd._b = reduceMotion ? 1 : easeOutCubic(clamp01((t - nd.birth) / NODE_GROW));
      const wob = nd._b >= 1 && !reduceMotion ? Math.sin(now / 1700 * nd.wph + nd.wob) * nd.wobr : 0;
      const sp = project(nd.wx + wob, nd.wy + wob * 0.6, nd.wz);
      nd._x = sp[0]; nd._y = sp[1]; nd._f = sp[2];
    }

    // 移动粒子前向漫游:到一个节点→点亮它→沿"非回头边"走向下一个点(A→B→C→D→A→E→F),绝不在一根线上来回
    if (!reduceMotion) for (const p of packets) {
      p.t += p.speed * dt;
      while (p.t >= 1) {
        p.t -= 1;
        nodes[p.to]._ig = now;
        const fwd = adj[p.to].filter((ei) => ei !== p.ei); // 排除刚走过的边,只往前
        const pool = fwd.length ? fwd : adj[p.to];          // 度为 1 的死胡同才允许原路返回
        const nei = pool.length ? pool[Math.floor(rnd() * pool.length)] : p.ei;
        const ne = edges[nei];
        p.from = p.to; p.to = ne.a === p.from ? ne.b : ne.a; p.ei = nei;
      }
    }

    // 俯冲:绕目标点 2D 放大 + 渐隐
    let diveP = 0, alpha = 1;
    if (dive) {
      diveP = clamp01((now - dive.t0) / DIVE_MS);
      const z = 1 + easeInCubic(diveP) * 5.2;
      alpha = 1 - clamp01((diveP - 0.25) / 0.75);
      ctx.save();
      ctx.translate(dive.fx, dive.fy); ctx.scale(z, z); ctx.translate(-dive.fx, -dive.fy);
    }

    ctx.globalCompositeOperation = "lighter";

    // 边:常驻立体网 —— 长出后亮度恒定、永不消失(无充能闪烁);线宽设地板防止远处细到亚像素而看不见
    for (const e of edges) {
      const A = nodes[e.a], B = nodes[e.b];
      const b = Math.min(A._b, B._b);
      if (b <= 0.02) continue;
      const ep = reduceMotion ? 1 : clamp01((t - e.bornAt) / 900);
      if (ep <= 0.01) continue;
      ctx.strokeStyle = withAlpha(LINE_COLOR, 0.27 * b * alpha * ep);
      ctx.lineWidth = Math.max(0.5, 0.6 * ((A._f + B._f) / 2));
      ctx.beginPath(); ctx.moveTo(A._x, A._y); ctx.lineTo(B._x, B._y); ctx.stroke();
    }

    // 节点:粒子到达会"点亮"(ignite 闪光),主节点持续搏动
    for (let i = 0; i < total; i++) {
      const nd = nodes[i];
      if (nd._b <= 0.02) continue;
      const persp = nd._f;
      let ignite = 0;
      if (nd.isHub && !reduceMotion) { const since = t - (nd.birth + NODE_GROW); if (since > 0 && since < 700) ignite = Math.sin((since / 700) * Math.PI); }
      if (nd._ig && !reduceMotion) { const s = now - nd._ig; if (s >= 0 && s < 620) ignite = Math.max(ignite, 1 - s / 620); else nd._ig = 0; }
      const pulse = nd.isHub && !reduceMotion ? 0.5 + 0.5 * Math.sin(now / 1600 + nd.wob) : 0;
      const gr = nd.rad * (nd.isHub ? 2.0 : 1.5) * persp * (1 + ignite * 0.4 + pulse * 0.18);
      ctx.globalAlpha = Math.min(1, (0.32 + nd._b * 0.3) * (nd.isHub ? 1.0 + pulse * 0.1 : 0.7) + ignite * 0.2) * alpha;
      ctx.drawImage(glow(nd.color, gr), nd._x - gr, nd._y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = withAlpha(nd.color, 0.92);
      const rr = nd.rad * persp * (0.5 + nd._b * 0.5) * (1 + ignite * 0.25);
      ctx.beginPath(); ctx.arc(nd._x, nd._y, rr, 0, Math.PI * 2); ctx.fill();
      if (nd.isHub || ignite > 0.45) {
        ctx.fillStyle = `rgba(228,242,235,${Math.min(0.62, 0.34 + ignite * 0.28)})`;
        ctx.beginPath(); ctx.arc(nd._x, nd._y, rr * (nd.isHub ? 0.34 : 0.46), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 移动粒子:沿边穿梭的光点(彩色辉光 + 白核)
    for (const p of packets) {
      const A = nodes[p.from], B = nodes[p.to];
      if (!A || !B || A._b < 1 || B._b < 1) continue;
      const tt = p.t < 0 ? 0 : p.t > 1 ? 1 : p.t;
      const x = A._x + (B._x - A._x) * tt, y = A._y + (B._y - A._y) * tt;
      ctx.globalAlpha = alpha;
      ctx.drawImage(glow(p.color, 6), x - 15, y - 15, 30, 30);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 正面彩色尘埃粒子(含中心):漂移 + 闪烁 + 视差
    for (let m = 0; m < MOTES; m++) {
      const o = motes[m];
      o.x += o.vx; o.y += o.vy;
      if (o.x < 0) o.x += 1; else if (o.x > 1) o.x -= 1;
      if (o.y < 0) o.y += 1; else if (o.y > 1) o.y -= 1;
      const sx = o.x * W + pointer.x * 24 * o.depth, sy = o.y * H + pointer.y * 24 * o.depth;
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now / 900 * o.tw + o.ph));
      const gr = o.r * (2.4 + o.depth * 1.8);
      ctx.globalAlpha = 0.3 * tw * alpha * (t > 600 ? 1 : t / 600);
      ctx.drawImage(glow(o.color, gr), sx - gr, sy - gr, gr * 2, gr * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (dive) {
      ctx.restore();
      if (diveP >= 1) { const cb = dive.done; dive = null; running = false; cancelAnimationFrame(raf); cb?.(); return; }
    }
    if (reduceMotion && !dive) return;
    raf = requestAnimationFrame(draw);
  }

  fit();
  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { fit(); if (reduceMotion) requestAnimationFrame(draw); }, 160); };
  window.addEventListener("resize", onResize);
  if (!reduceMotion) window.addEventListener("pointermove", onPointer, { passive: true });
  const onVis = () => {
    if (document.hidden) { running = false; cancelAnimationFrame(raf); }
    else if (!reduceMotion && !dive) { running = true; raf = requestAnimationFrame(draw); }
  };
  document.addEventListener("visibilitychange", onVis);
  raf = requestAnimationFrame(draw);

  function destroy() {
    running = false; cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("pointermove", onPointer);
    document.removeEventListener("visibilitychange", onVis);
    canvas.remove();
  }

  return {
    destroy,
    // 俯冲进目标节点,结束后回调
    diveIn(done) {
      const tgt = nodes[diveTarget];
      const fx = tgt?._x ?? W / 2, fy = tgt?._y ?? H * 0.5;
      if (reduceMotion) { done?.(); return; }
      running = true;
      dive = { t0: performance.now ? performance.now() : Date.now(), fx, fy, done };
      cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
    },
  };
}
