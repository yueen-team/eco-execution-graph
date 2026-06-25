// 常驻环境层:#cy 背后一层极淡的漂移粒子 + 呼吸辉光,给每一幕都垫上纵深。
// 刻意压到很暗,只做氛围底,不与主图谱抢视线。纯 vanilla Canvas2D。
const PALETTE = ["#2ee6a8", "#3fe6c2", "#5aa7ff", "#2dd4bf"];

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function withAlpha(hex, a) {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function mountAmbientField(container, opts = {}) {
  const reduceMotion = !!opts.reduceMotion;
  const canvas = document.createElement("canvas");
  canvas.className = "ambient-canvas";
  canvas.setAttribute("aria-hidden", "true");
  container.insertBefore(canvas, container.firstChild);
  const ctx = canvas.getContext("2d", { alpha: true });
  const rnd = mulberry32(424242);

  const glowCache = new Map();
  function glow(color, radius) {
    const key = color + "@" + Math.round(radius);
    let c = glowCache.get(key); if (c) return c;
    const s = Math.max(8, Math.ceil(radius * 6));
    c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, withAlpha(color, 1)); grd.addColorStop(0.35, withAlpha(color, 0.5));
    grd.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    glowCache.set(key, c); return c;
  }

  const N = reduceMotion ? 0 : 62;
  const motes = Array.from({ length: N }, () => ({
    x: rnd(), y: rnd(), r: 1.0 + rnd() * 3.0,
    color: PALETTE[Math.floor(rnd() * PALETTE.length)],
    vx: (rnd() - 0.5) * 0.00006, vy: (rnd() - 0.5) * 0.00006,
    ph: rnd() * Math.PI * 2, tw: 0.4 + rnd() * 0.7,
  }));

  let W = 0, H = 0, dpr = 1;
  function fit() {
    const rect = container.getBoundingClientRect();
    W = Math.max(160, rect.width); H = Math.max(160, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let raf = 0, running = true;
  function draw(now) {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    // 呼吸辉光:中心偏上的一团淡绿,缓慢起伏(加亮,给整套演示一层可感的纵深底)
    const breathe = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(now / 4200);
    const gr = Math.min(W, H) * (0.44 + breathe * 0.07);
    ctx.globalAlpha = 0.09 + breathe * 0.05;
    ctx.drawImage(glow("#2ee6a8", gr), W * 0.5 - gr, H * 0.46 - gr, gr * 2, gr * 2);
    // 副辉光:右下一团极淡蓝,拉开冷暖纵深
    const gr2 = Math.min(W, H) * 0.34;
    ctx.globalAlpha = 0.05 + (1 - breathe) * 0.03;
    ctx.drawImage(glow("#5aa7ff", gr2), W * 0.74 - gr2, H * 0.66 - gr2, gr2 * 2, gr2 * 2);
    // 漂移粒子
    for (const o of motes) {
      o.x += o.vx; o.y += o.vy;
      if (o.x < 0) o.x += 1; else if (o.x > 1) o.x -= 1;
      if (o.y < 0) o.y += 1; else if (o.y > 1) o.y -= 1;
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now / 1100 * o.tw + o.ph));
      const g = o.r * 3;
      ctx.globalAlpha = 0.22 * tw;
      ctx.drawImage(glow(o.color, g), o.x * W - g, o.y * H - g, g * 2, g * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (reduceMotion) return;
    raf = requestAnimationFrame(draw);
  }

  fit();
  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { fit(); if (reduceMotion) requestAnimationFrame(draw); }, 160); };
  window.addEventListener("resize", onResize);
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
      document.removeEventListener("visibilitychange", onVis);
      canvas.remove();
    },
  };
}
