/* 基础工具：数学、噪声、颜色、手绘笔触、纸纹、阵风 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  // 缩放滤波：实时播放用较省的档位（高档位会把帧率拖到 20fps 左右）；带 ?t= 的逐帧导出模式用最高质量
  (function () { const p = new URLSearchParams(location.search); window.__ISQ = p.get('isq') || (p.has('t') && !p.has('live') ? 'high' : 'medium'); })();
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (a, b, x) => { const t = seg(x, a, b); return t * t * (3 - 2 * t); };
  const ease = {
    io: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: t => 1 - Math.pow(1 - t, 3),
    in: t => t * t * t,
    sine: t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t)),
    back: t => { const c = 1.9; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  };
  const q = (t, fps) => Math.floor(t * fps + 1e-6) / fps;   // 抽帧：一拍二 = 12，一拍三 = 8

  function RNG(seed) {
    let a = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
    const f = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.r = (lo, hi) => lo + (hi - lo) * f();
    f.i = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.sign = () => (f() < 0.5 ? -1 : 1);
    f.g = () => (f() + f() + f() - 1.5) / 1.5;            // 近似高斯 -1..1
    return f;
  }
  function ih(x, y) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const hash1 = n => ih(n, 7919);
  function noise1(x) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(ih(i, 31), ih(i + 1, 31), u);
  }
  function noise2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = ih(ix, iy), b = ih(ix + 1, iy), c = ih(ix, iy + 1), d = ih(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm1(x, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * noise1(x * f + i * 17.3); n += a; f *= 2.03; a *= 0.5; } return s / n; }
  function fbm2(x, y, o = 4) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * noise2(x * f + i * 5.1, y * f - i * 3.7); n += a; f *= 2.03; a *= 0.5; } return s / n; }

  // ---------- 颜色 ----------
  const _hc = {};
  function hex(h) {
    if (typeof h !== 'string') return h;
    if (_hc[h]) return _hc[h];
    const n = parseInt(h.slice(1), 16);
    return (_hc[h] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
  }
  function mix(a, b, t) { a = hex(a); b = hex(b); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function rgba(c, a = 1) { c = hex(c); return 'rgba(' + clamp(c[0], 3, 251).toFixed(0) + ',' + clamp(c[1], 3, 249).toFixed(0) + ',' + clamp(c[2], 4, 244).toFixed(0) + ',' + a.toFixed(3) + ')'; }
  function vary(c, rng, amt = 10, warm = 0) {
    c = hex(c); const v = (rng() - 0.5) * 2 * amt, w = (rng() - 0.5) * 2 * warm;
    return [c[0] + v + w, c[1] + v * 0.9, c[2] + v * 0.8 - w];
  }
  function ramp(stops, t) {                      // stops: [[pos,color],...]
    t = clamp(t, stops[0][0], stops[stops.length - 1][0]);
    for (let i = 0; i < stops.length - 1; i++) {
      if (t <= stops[i + 1][0]) return mix(stops[i][1], stops[i + 1][1], seg(t, stops[i][0], stops[i + 1][0]));
    }
    return hex(stops[stops.length - 1][1]);
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = window.__ISQ || 'high';
    return [c, g];
  }

  // ---------- 曲线 ----------
  function spline(pts, per = 8, closed = false) {            // Catmull-Rom 加密
    const n = pts.length, out = [];
    const P = i => closed ? pts[(i % n + n) % n] : pts[clamp(i, 0, n - 1)];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    if (!closed) out.push(pts[n - 1].slice());
    return out;
  }
  function tracePoly(ctx, pts, close = true) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
  }
  // 手绘形：给一圈控制点加抖动并样条化，得到没有尺规感的有机轮廓
  function organic(pts, jit, rng, per = 6) {
    const p = pts.map(a => [a[0] + rng.g() * jit, a[1] + rng.g() * jit]);
    return spline(p, per, true);
  }
  function blobPts(x, y, rx, ry, rot, wob, rng, n = 11) {
    const pts = [], c = Math.cos(rot), s = Math.sin(rot), ph = rng() * TAU;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + ph + rng.g() * 0.12;
      const r = 1 + rng.g() * wob;
      const px = Math.cos(a) * rx * r, py = Math.sin(a) * ry * r;
      pts.push([x + px * c - py * s, y + px * s + py * c]);
    }
    return spline(pts, 5, true);
  }
  function blob(ctx, x, y, rx, ry, rot, wob, rng, n) { tracePoly(ctx, blobPts(x, y, rx, ry, rot, wob, rng, n)); }

  // 柔边填充（用离屏阴影模拟湿画法的晕染边缘；不依赖 ctx.filter）
  const OFF = 30000;
  function soft(ctx, blur, color, pathFn) {
    const m = ctx.getTransform();
    ctx.save();
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e - OFF, m.f);
    ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = OFF; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#444441';
    pathFn(ctx);
    ctx.fill();
    ctx.restore();
  }

  // 变宽带状笔画：pts 为折线，wf(t, i) 返回该处半宽
  function ribbon(ctx, pts, wf) {
    const n = pts.length; if (n < 2) return;
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const w = wf(i / (n - 1), i);
      L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]); R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath(); ctx.fill();
  }
  // 铅笔/钢笔淡彩线：笔压起伏、两端收尖、偶尔断线
  function pencil(ctx, pts, w, color, alpha, rng, o) {
    o = o || {};
    const gap = o.gap == null ? 0.1 : o.gap, dense = o.raw ? pts : spline(pts, o.per || 6);
    const n = dense.length; if (n < 2) return;
    const s0 = rng() * 100, wob = o.wob == null ? 0.5 : o.wob, jit = o.jit || 0;
    if (jit) for (let i = 0; i < n; i++) { dense[i][0] += (noise1(s0 + i * 0.37) - 0.5) * jit; dense[i][1] += (noise1(s0 + 50 + i * 0.37) - 0.5) * jit; }
    ctx.fillStyle = rgba(color, alpha);
    let start = 0;
    const flush = (a, b) => {
      if (b - a < 2) return;
      const sub = dense.slice(a, b + 1), m = sub.length - 1;
      ribbon(ctx, sub, (t, i) => {
        const g = (a + i) / (n - 1);
        const tp = Math.pow(Math.sin(Math.PI * clamp(g * 0.94 + 0.03)), o.taper == null ? 0.55 : o.taper);
        const loc = Math.min(1, Math.min(i, m - i) / 2.5 + 0.15);
        return 0.5 * w * tp * loc * (1 - wob * 0.5 + wob * noise1(s0 + g * (o.freq || 9)));
      });
    };
    for (let i = 1; i < n; i++) {
      if (gap > 0 && noise1(s0 + 200 + i * 0.21) < gap) { flush(start, i - 1); start = i + 1 + ((rng() * 2) | 0); i = start; }
    }
    flush(start, n - 1);
  }
  // 干笔触：一笔水粉，宽度不匀、带飞白
  function dab(ctx, x0, y0, x1, y1, w, color, alpha, rng, bend) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0;
    const b = (bend == null ? rng.g() * 0.18 : bend);
    const c = [mx - dy * b, my + dx * b];
    const pts = spline([[x0, y0], c, [x1, y1]], 6);
    const s0 = rng() * 100, sk = rng.r(0.5, 1.6);
    ctx.fillStyle = rgba(color, alpha);
    ribbon(ctx, pts, t => 0.5 * w * Math.pow(Math.sin(Math.PI * clamp(Math.pow(t, sk) * 0.9 + 0.05)), 0.45) * (0.7 + 0.6 * noise1(s0 + t * 5)));
    if (w > 5 && rng() < 0.6) {                               // 飞白：边缘再拖一丝
      const off = (rng() - 0.5) * w * 0.9, nx = -dy / (Math.hypot(dx, dy) || 1), ny = dx / (Math.hypot(dx, dy) || 1);
      ctx.fillStyle = rgba(color, alpha * 0.6);
      ribbon(ctx, pts.map(p => [p[0] + nx * off, p[1] + ny * off]), t => 0.5 * w * 0.16 * Math.sin(Math.PI * clamp(t * 1.3 - 0.15)) * (0.4 + noise1(s0 + 9 + t * 11)));
    }
  }
  // 用大量笔触铺满一个区域。colorAt(x,y,rng) -> [r,g,b]
  function scumble(ctx, x0, y0, x1, y1, n, o, colorAt, rng) {
    const len = o.len || 60, w = o.w || 18, ang = o.ang || 0, aj = o.aj == null ? 0.25 : o.aj, al = o.alpha || 0.5;
    for (let i = 0; i < n; i++) {
      const x = rng.r(x0, x1), y = rng.r(y0, y1);
      const a = (typeof ang === 'function' ? ang(x, y) : ang) + rng.g() * aj;
      const l = len * rng.r(0.5, 1.5), ww = w * rng.r(0.5, 1.5);
      const c = colorAt(x, y, rng); if (!c) continue;
      dab(ctx, x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2, x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2, ww, c, al * rng.r(0.6, 1.2), rng);
    }
  }

  // ---------- 纸纹 ----------
  function makeGrain(size, seed, o) {
    o = o || {};
    const [c, g] = canvas(size, size), id = g.createImageData(size, size), d = id.data;
    const base = o.base || 243, amp = o.amp || 20, fib = o.fib == null ? 10 : o.fib, sc = o.scale || 1;
    const wrap = (fn, x, y) => {                                // 可平铺
      const u = x / size, v = y / size;
      const a = fn(x, y), b = fn(x - size, y), cc = fn(x, y - size), dd = fn(x - size, y - size);
      return lerp(lerp(a, b, u), lerp(cc, dd, u), v);
    };
    const f1 = (x, y) => fbm2(x * 0.5 * sc + seed, y * 0.5 * sc, 3);
    const f2 = (x, y) => noise2(x * 0.045 * sc + seed * 3, y * 0.045 * sc);
    const f3 = (x, y) => noise2(x * 0.9 * sc, y * 0.06 * sc + seed) * noise2(x * 0.05 * sc + 9, y * 1.1 * sc);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let v = base + (wrap(f1, x, y) - 0.5) * amp * 2 + (wrap(f2, x, y) - 0.5) * amp * 0.9 + (wrap(f3, x, y) - 0.25) * fib;
      v += (ih(x + seed * 13, y) - 0.5) * amp * 0.5;
      const i = (y * size + x) * 4;
      d[i] = clamp(v + 1, 8, 252); d[i + 1] = clamp(v, 8, 251); d[i + 2] = clamp(v - 1, 8, 250); d[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  function applyGrain(ctx, w, h, grain, alpha, mode) {
    // 正片叠底只作用于已有颜料的地方（保持透明区域透明）
    const [tc, tg] = canvas(w, h);
    tg.drawImage(ctx.canvas, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = mode || 'multiply'; ctx.globalAlpha = alpha * 0.4;      // 各图层自带的纸纹只留很轻的一层
    ctx.fillStyle = ctx.createPattern(grain, 'repeat');
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(tc, 0, 0);
    ctx.restore();
  }

  // ---------- 阵风 ----------
  // 风从左往右扫过：位置 x 处会比 x=0 晚 x/900 秒被吹到。快速压倒 + 缓慢回弹 + 回弹时轻微颤动
  function gustEnv(u) {
    if (u <= 0) return 0;
    const att = u < 0.22 ? Math.pow(u / 0.22, 0.6) : 1;
    const dec = u < 0.22 ? 1 : Math.exp(-(u - 0.22) / 1.25);
    return att * dec * (1 + 0.22 * Math.sin(u * 8.5) * Math.exp(-u * 0.9));
  }
  function wind(x, t) {
    const G = window.CUES_STORY.gusts; let s = 0;
    const tt = t - x / 900;
    for (let i = 0; i < G.length; i++) { const u = tt - G[i][0]; if (u > 0 && u < 8) s += G[i][1] * gustEnv(u); }
    const steady = smooth(32, 38, t) * (1 - smooth(60, 67, t)) * 0.32;
    const breath = 0.05 + 0.05 * noise1(t * 0.35 + x * 0.0013) + steady * (0.7 + 0.6 * noise1(tt * 0.9));
    return s + breath;
  }

  window.L = { TAU, clamp, lerp, seg, smooth, ease, q, RNG, ih, hash1, noise1, noise2, fbm1, fbm2, hex, mix, rgba, vary, ramp, canvas, spline, tracePoly, organic, blobPts, blob, soft, ribbon, pencil, dab, scumble, makeGrain, applyGrain, wind, gustEnv };
})();
