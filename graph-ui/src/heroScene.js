// 首屏开场:一张图谱"生成式分叉生长" —— 种子长出几个节点、每个又长出几个、邻近分支再交叉关联,
// 像活的神经网络/菌丝一点点铺开(参考 nayuki Animated floating graph nodes 的气质与速度)。
// 生长完成后,整张网作为背景缓慢 3D 倾斜旋转(参考 Vanta NET):伪 3D = z 深度 + 透视 + 缓慢倾斜 + 鼠标联动,零依赖。
// 节点用我们的 eco 绿主色 + 彩色点缀,带 bloom。左下角规模用真实数(由 landing 注入)。纯 vanilla Canvas2D。

const ECO = "#2ee6a8";
const PALETTE = [
  { c: "#2ee6a8", w: 0.42 },  // eco 绿(主)
  { c: "#3fe6c2", w: 0.15 },
  { c: "#2dd4bf", w: 0.13 },
  { c: "#5aa7ff", w: 0.13 },  // 蓝
  { c: "#7cf0be", w: 0.07 },
  { c: "#f5b84d", w: 0.05 },  // 琥珀
  { c: "#a78bfa", w: 0.05 },  // 紫
];

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
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// 时间线(ms):生长放慢,看清"一个长出好几个"
const GROWTH_MS = 9000;
const HOLD_MS = 700;
const RECEDE_MS = 2200;
const REVEAL_AT = GROWTH_MS + HOLD_MS;
const NODE_GROW = 560;  // 单节点冒出时长
const EDGE_GROW = 620;  // 父→子边伸出时长

export function mountHeroScene(container, graph, opts = {}) {
  const reduceMotion = !!opts.reduceMotion;
  const onGrowth = typeof opts.onGrowth === "function" ? opts.onGrowth : () => {};
  const onReveal = typeof opts.onReveal === "function" ? opts.onReveal : () => {};

  const canvas = document.createElement("canvas");
  canvas.className = "hero-canvas";
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: true });
  const rnd = mulberry32(20260623);

  const rect0 = container.getBoundingClientRect();
  const W0 = Math.max(320, rect0.width), H0 = Math.max(320, rect0.height);
  const N = Math.max(120, Math.min(420, Math.round((W0 * H0) / 5200))); // 更宏大:更多节点(小屏下限更低,清爽且省电)

  function pickColor() {
    let r = rnd(), acc = 0;
    for (const p of PALETTE) { acc += p.w; if (r <= acc) return p.c; }
    return ECO;
  }

  // ---- 生成式分叉生长:FIFO 逐层向外发芽 ----
  const nodes = [{ x: 0, y: 0, parent: -1, gen: 0, order: 0, children: 0 }];
  const edges = [];
  const STEP = 1, MIN_DIST = 0.74;
  {
    const frontier = [{ idx: 0, budget: 5, init: 5, base: rnd() * Math.PI * 2 }];
    let order = 1, guard = 0;
    const tooClose = (x, y) => {
      for (let i = 0; i < nodes.length; i++) { const dx = nodes[i].x - x, dy = nodes[i].y - y; if (dx * dx + dy * dy < MIN_DIST * MIN_DIST) return true; }
      return false;
    };
    while (nodes.length < N && frontier.length && guard++ < N * 40) {
      const f = frontier[0];
      const pn = nodes[f.idx];
      const outward = pn.parent >= 0 ? Math.atan2(pn.y - nodes[pn.parent].y, pn.x - nodes[pn.parent].x) : f.base;
      const ci = f.init - f.budget; // 第几个孩子
      let placed = false;
      for (let tryI = 0; tryI < 5 && !placed; tryI++) {
        const ang = outward + (ci - (f.init - 1) / 2) * 0.62 + (rnd() - 0.5) * (0.3 + tryI * 0.25);
        const L = STEP * (0.85 + rnd() * 0.4);
        const x = pn.x + Math.cos(ang) * L, y = pn.y + Math.sin(ang) * L;
        if (tooClose(x, y)) continue;
        const child = { x, y, parent: f.idx, gen: pn.gen + 1, order: order++, children: 0 };
        nodes.push(child); pn.children++;
        edges.push({ a: f.idx, b: nodes.length - 1, struct: true });
        const cb = pn.gen < 1 ? 4 : pn.gen < 3 ? 3 : pn.gen < 5 ? 2 : (rnd() < 0.45 ? 1 : 0);
        if (cb > 0) frontier.push({ idx: nodes.length - 1, budget: cb, init: cb, base: outward });
        placed = true;
      }
      f.budget--;
      if (f.budget <= 0) frontier.shift();
      // frontier 枯竭但还没到 N:从已有叶子再发芽
      if (!frontier.length && nodes.length < N) {
        const leaf = nodes[Math.floor(rnd() * nodes.length)];
        frontier.push({ idx: nodes.indexOf(leaf), budget: 2, init: 2, base: rnd() * Math.PI * 2 });
      }
    }
  }
  const total = nodes.length;

  // ---- 交叉关联边:邻近但未连的节点连起来("节点和节点之间关联") ----
  function dist(i, j) { const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y; return Math.hypot(dx, dy); }
  {
    const has = new Set(edges.map((e) => (e.a < e.b ? `${e.a}-${e.b}` : `${e.b}-${e.a}`)));
    const D = STEP * 1.5;
    for (let i = 0; i < total; i++) {
      const near = [];
      for (let j = 0; j < total; j++) if (j !== i) { const d = dist(i, j); if (d < D) near.push([j, d]); }
      near.sort((p, q) => p[1] - q[1]);
      for (let t = 0; t < 2 && t < near.length; t++) {
        const j = near[t][0]; const k = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!has.has(k)) { has.add(k); edges.push({ a: i, b: j, struct: false }); }
      }
    }
  }

  // ---- 视觉属性 + 出生时间(前重曲线:开头慢、看清分叉,后段加速填充) ----
  const maxChildren = Math.max(1, ...nodes.map((n) => n.children));
  nodes.forEach((nd) => {
    nd.isHub = nd.children >= Math.max(3, maxChildren * 0.5) || nd.gen === 0;
    nd.rad = 1.8 + Math.min(nd.children, 6) * 0.85 + (nd.isHub ? 2.2 : 0);
    nd.color = pickColor();
    nd.z = (rnd() - 0.5) * 0.88;              // 深度(用于伪 3D,略增以强化立体)
    nd.wob = rnd() * Math.PI * 2; nd.wobr = 0.4 + rnd() * 0.8; nd.wph = 0.6 + rnd() * 0.8;
    const u = nd.order / total;
    nd.birth = GROWTH_MS * (1 - Math.pow(1 - u, 2.1)); // 前重
  });
  edges.forEach((e) => { e.bornAt = e.struct ? nodes[e.b].birth : Math.max(nodes[e.a].birth, nodes[e.b].birth); });

  // ---- 归一化坐标 ----
  let cx = 0, cy = 0; nodes.forEach((n) => { cx += n.x; cy += n.y; }); cx /= total; cy /= total;
  const radii = nodes.map((n) => Math.hypot(n.x - cx, n.y - cy)).sort((a, b) => a - b);
  const norm = radii[Math.floor(radii.length * 0.9)] || 1;
  nodes.forEach((n) => { n.nx = (n.x - cx) / norm; n.ny = (n.y - cy) / norm; });

  let W = 0, H = 0, dpr = 1, worldScale = 1, focal = 1;
  function fit() {
    const rect = container.getBoundingClientRect();
    W = Math.max(320, rect.width); H = Math.max(320, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    worldScale = Math.min(W, H) * 0.74; // 更宏大:网铺得更开、更有气势
    focal = worldScale * 3.2;
    nodes.forEach((n) => { n.wx = n.nx * worldScale; n.wy = n.ny * worldScale; n.wz = n.z * worldScale; });
  }

  function withAlpha(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  const glowCache = new Map();
  function glow(color, radius) {
    const key = color + "@" + Math.round(radius);
    let c = glowCache.get(key); if (c) return c;
    const s = Math.max(6, Math.ceil(radius * 6));
    c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, withAlpha(color, 1)); grd.addColorStop(0.3, withAlpha(color, 0.55));
    grd.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    glowCache.set(key, c); return c;
  }

  // ---- 伪 3D 倾斜旋转(生长后渐入,鼠标联动) ----
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  function onPointer(e) {
    const rect = container.getBoundingClientRect();
    pointer.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    pointer.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  }
  let rotX = 0, rotY = 0, cX = 1, sX = 0, cY = 1, sY = 0, camZoom = 1;
  function project(wx, wy, wz) {
    const x1 = wx * cY + wz * sY, z1 = -wx * sY + wz * cY;
    const y1 = wy * cX - z1 * sX, z2 = wy * sX + z1 * cX;
    const f = (focal / (focal + z2)) * camZoom;
    return [W / 2 + x1 * f, H * 0.5 + y1 * f, f];
  }

  let start = null, raf = 0, running = true, revealed = false;

  function draw(now) {
    if (!running) return;
    if (start == null) start = now;
    const t = now - start;
    ctx.clearRect(0, 0, W, H);

    const growthP = clamp01(t / GROWTH_MS);
    const recedeP = clamp01((t - REVEAL_AT) / RECEDE_MS);
    const bgT = Math.max(0, t - REVEAL_AT);

    if (!reduceMotion && t <= GROWTH_MS + 16) onGrowth(easeOutCubic(growthP));
    if (!revealed && (reduceMotion || t >= REVEAL_AT)) { revealed = true; onGrowth(1); onReveal(); }

    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    // 3D 倾斜:生长期≈0(看清分叉),生长后渐入缓慢摆动 + 鼠标
    const rampTo = reduceMotion ? 0 : clamp01((t - REVEAL_AT + 600) / 2600);
    rotY = reduceMotion ? 0 : (Math.sin(bgT / 6500) * 0.3 + pointer.x * 0.42) * rampTo;
    rotX = reduceMotion ? 0 : (Math.sin(bgT / 8200) * 0.17 + pointer.y * -0.27) * rampTo;
    cX = Math.cos(rotX); sX = Math.sin(rotX); cY = Math.cos(rotY); sY = Math.sin(rotY);
    camZoom = reduceMotion ? 1 : (t < GROWTH_MS ? 1.06 - easeOutCubic(growthP) * 0.06 : 1.0);
    const graphA = reduceMotion ? 0.7 : (1 - recedeP * 0.34);

    // 投影每个节点 + 出生进度
    for (let i = 0; i < total; i++) {
      const nd = nodes[i];
      nd._b = reduceMotion ? 1 : easeOutCubic(clamp01((t - nd.birth) / NODE_GROW));
      const wob = nd._b >= 1 && !reduceMotion ? Math.sin(now / 1700 * nd.wph + nd.wob) * nd.wobr : 0;
      const sp = project(nd.wx + wob, nd.wy + wob * 0.6, nd.wz);
      nd._x = sp[0]; nd._y = sp[1]; nd._f = sp[2];
    }

    ctx.globalCompositeOperation = "lighter";

    // 边:结构边从父伸向子(生长),交叉边淡入
    for (const e of edges) {
      const A = nodes[e.a], B = nodes[e.b];
      let ep;
      if (e.struct) { ep = reduceMotion ? 1 : clamp01((t - e.bornAt) / EDGE_GROW); if (A._b <= 0.02) continue; }
      else { ep = reduceMotion ? 1 : clamp01((t - e.bornAt) / 520); }
      if (ep <= 0.01) continue;
      const ee = easeOutCubic(ep);
      const hx = A._x + (B._x - A._x) * ee, hy = A._y + (B._y - A._y) * ee;
      const op = (e.struct ? 0.4 : 0.26) * graphA * (e.struct ? 1 : Math.min(A._b, B._b));
      ctx.strokeStyle = withAlpha(ECO, op);
      ctx.lineWidth = 0.85 * ((A._f + B._f) / 2);
      ctx.beginPath(); ctx.moveTo(A._x, A._y); ctx.lineTo(hx, hy); ctx.stroke();
      if (ep < 1 && e.struct && !reduceMotion) {
        ctx.strokeStyle = withAlpha(ECO, 0.7 * graphA); ctx.lineWidth = 1.5;
        const t0 = Math.max(0, ee - 0.2);
        ctx.beginPath(); ctx.moveTo(A._x + (B._x - A._x) * t0, A._y + (B._y - A._y) * t0); ctx.lineTo(hx, hy); ctx.stroke();
      }
    }

    // 信号脉冲(背景期)
    if (!reduceMotion && t > REVEAL_AT) {
      const period = 2600;
      for (let k = 0; k < edges.length; k += 8) {
        const e = edges[k], A = nodes[e.a], B = nodes[e.b];
        if (A._b < 1 || B._b < 1) continue;
        const ph = ((now + k * 150) % period) / period;
        if (ph > 0.8) continue;
        const sp = easeInOut(ph / 0.8);
        const sx = A._x + (B._x - A._x) * sp, sy = A._y + (B._y - A._y) * sp;
        ctx.globalAlpha = Math.sin(sp * Math.PI) * 0.5 * graphA;
        ctx.drawImage(glow(ECO, 5), sx - 13, sy - 13, 26, 26);
        ctx.globalAlpha = 1;
      }
    }

    // 节点:更亮 + 透视景深(近大远小)
    for (let i = 0; i < total; i++) {
      const nd = nodes[i];
      if (nd._b <= 0.02) continue;
      const persp = nd._f;
      let ignite = 0;
      if (nd.isHub && !reduceMotion) { const since = t - (nd.birth + NODE_GROW); if (since > 0 && since < 700) ignite = Math.sin((since / 700) * Math.PI); }
      const gr = nd.rad * (nd.isHub ? 3.6 : 2.5) * persp * (1 + ignite * 0.7);
      ctx.globalAlpha = Math.min(1, (0.6 + nd._b * 0.5) * (nd.isHub ? 1.1 : 0.9)) * graphA;
      ctx.drawImage(glow(nd.color, gr), nd._x - gr, nd._y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = graphA;
      ctx.fillStyle = withAlpha(nd.color, 1);
      const rr = nd.rad * persp * (0.55 + nd._b * 0.45);
      ctx.beginPath(); ctx.arc(nd._x, nd._y, rr, 0, Math.PI * 2); ctx.fill();
      if (nd.isHub) {
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath(); ctx.arc(nd._x, nd._y, rr * 0.36, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "source-over";

    if (reduceMotion) return;
    raf = requestAnimationFrame(draw);
  }

  fit();
  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { fit(); if (reduceMotion) requestAnimationFrame(draw); }, 160); };
  window.addEventListener("resize", onResize);
  if (!reduceMotion) window.addEventListener("pointermove", onPointer, { passive: true });
  const onVis = () => {
    if (document.hidden) { running = false; cancelAnimationFrame(raf); }
    else if (!reduceMotion) { running = true; raf = requestAnimationFrame(draw); }
  };
  document.addEventListener("visibilitychange", onVis);
  raf = requestAnimationFrame(draw);

  return {
    destroy() {
      running = false; cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVis);
      canvas.remove();
    },
  };
}
