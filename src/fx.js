/* 特效：体积积雨云、水汽、丁达尔光束、雨与水花、风沙与落沙、植被生长 */
(function () {
  'use strict';
  const { TAU, clamp, lerp, seg, smooth, ease, q, RNG, ih, noise1, noise2, fbm2, mix, rgba, vary, canvas, spline, tracePoly, blob, blobPts, soft, ribbon, pencil, dab, wind } = window.L;
  const C = window.CUES_STORY, W = window.WORLD, T = window.TOWER;

  let clockT = null; const clk = t => (clockT == null ? t : clockT);       // 成片时间（由总装每帧设置）

  // 可平铺的噪声表
  const NT = 256, noiseA = new Float32Array(NT * NT), noiseB = new Float32Array(NT * NT);
  (function () {
    const wrap = (fn, x, y) => { const u = x / NT, v = y / NT; return lerp(lerp(fn(x, y), fn(x - NT, y), u), lerp(fn(x, y - NT), fn(x - NT, y - NT), u), v); };
    for (let y = 0; y < NT; y++) for (let x = 0; x < NT; x++) {
      noiseA[y * NT + x] = wrap((a, b) => fbm2(a / 26 + 3, b / 26, 4), x, y);
      noiseB[y * NT + x] = wrap((a, b) => fbm2(a / 9 + 40, b / 9, 3), x, y);
    }
  })();

  // 球体并集高度场 → 手绘式四色块面。puffs: [x,y,r,z]（画布像素）
  function shadeField(id, w, h, puffs, pal, o) {
    const H = shadeField.H && shadeField.H.length >= w * h ? shadeField.H : (shadeField.H = new Float32Array(w * h));
    const E = shadeField.E && shadeField.E.length >= w * h ? shadeField.E : (shadeField.E = new Float32Array(w * h));
    H.fill(-1e4, 0, w * h); E.fill(0, 0, w * h);
    for (let k = 0; k < puffs.length; k++) {
      const p = puffs[k], px = p[0], py = p[1], pr = p[2], pz = p[3]; if (pr < 1) continue;
      const x0 = Math.max(0, Math.floor(px - pr)), x1 = Math.min(w - 1, Math.ceil(px + pr)), y0 = Math.max(0, Math.floor(py - pr)), y1 = Math.min(h - 1, Math.ceil(py + pr)), r2 = pr * pr;
      for (let y = y0; y <= y1; y++) {
        const dy0 = y - py, dy = dy0 > 0 ? dy0 * (p[4] || 1) : dy0, dy2 = dy * dy, row = y * w;
        for (let x = x0; x <= x1; x++) {
          const dx = x - px, d2 = dx * dx + dy2; if (d2 >= r2) continue;
          const cap = Math.sqrt(r2 - d2), hh = pz + cap, i = row + x;
          if (hh > H[i]) H[i] = hh; if (cap > E[i]) E[i] = cap;
        }
      }
    }
    const d = id.data, warp = o.warp, ox = o.ox | 0, oy = o.oy | 0, lx = o.lx, ly = o.ly, lz = o.lz;
    const lit = pal.lit, mid = pal.mid, sh = pal.sh, deep = pal.deep, rim = pal.rim || 0, sunX = o.sunX, sunY = o.sunY;
    const y0b = o.baseY0, y1b = o.baseY1, edge = o.edge || 4, alphaK = o.alpha == null ? 1 : o.alpha;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n1 = noiseA[((y + oy) & 255) * NT + ((x + ox) & 255)], n2 = noiseA[((y + 77 + oy) & 255) * NT + ((x + 131) & 255)];
      let wx = x + ((n1 - 0.5) * warp) | 0, wy = y + ((n2 - 0.5) * warp) | 0;
      wx = wx < 1 ? 1 : wx > w - 2 ? w - 2 : wx; wy = wy < 1 ? 1 : wy > h - 2 ? h - 2 : wy;
      const i = wy * w + wx, o4 = (y * w + x) * 4, e = E[i];
      if (e <= 0) { d[o4 + 3] = 0; continue; }
      const hc = H[i];
      let hl = H[i - 1], hr = H[i + 1], hu = H[i - w], hd = H[i + w];
      if (hl < -9e3) hl = hc - 5; if (hr < -9e3) hr = hc - 5; if (hu < -9e3) hu = hc - 5; if (hd < -9e3) hd = hc - 5;
      const gx = (hr - hl) * 0.5, gy = (hd - hu) * 0.5, inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      let k = (-gx * lx - gy * ly + lz) * inv;
      const nb = noiseB[((y + (y >> 1) + oy) & 255) * NT + ((x + (x >> 1) + ox * 2) & 255)];
      k += (nb - 0.5) * 0.3 + (n1 - 0.5) * 0.3;
      k -= 0.5 * (hc - hl - hr + hc + hc - hu - hd + hc < -3 ? 1 : 0) * 0.3;              // 球与球之间的凹缝压暗
      if (y1b > y0b) { let b = (y - y0b) / (y1b - y0b); b = b < 0 ? 0 : b > 1 ? 1 : b; k -= b * b * (o.baseK || 0.75);
        if (o.scud > 0) { const ns = noiseA[((y + (oy >> 1) + 90) & 255) * NT + (((x >> 1) + ox) & 255)]; k += ((0.1 + (ns - 0.42) * 0.9 + (nb - 0.5) * 0.18) - k) * Math.min(1, b * 1.5) * o.scud; } }
      let t1 = (k - 0.02) / 0.2; t1 = t1 < 0 ? 0 : t1 > 1 ? 1 : t1; t1 = t1 * t1 * (3 - 2 * t1);
      let t2 = (k - 0.3) / 0.16; t2 = t2 < 0 ? 0 : t2 > 1 ? 1 : t2; t2 = t2 * t2 * (3 - 2 * t2);
      let t3 = (k - 0.56) / 0.16; t3 = t3 < 0 ? 0 : t3 > 1 ? 1 : t3; t3 = t3 * t3 * (3 - 2 * t3);
      let r = deep[0] + (sh[0] - deep[0]) * t1, g = deep[1] + (sh[1] - deep[1]) * t1, b = deep[2] + (sh[2] - deep[2]) * t1;
      r += (mid[0] - r) * t2; g += (mid[1] - g) * t2; b += (mid[2] - b) * t2;
      r += (lit[0] - r) * t3; g += (lit[1] - g) * t3; b += (lit[2] - b) * t3;
      if (rim > 0) {                                                                  // 逆光的金边
        const dd = Math.hypot(x - sunX, y - sunY), rk = rim * Math.max(0, 1 - e / (edge * 3.2)) * Math.exp(-dd / o.rimR);
        r += (253 - r) * rk; g += (240 - g) * rk; b += (206 - b) * rk;
      }
      let a = e / edge; a = a > 1 ? 1 : a; a = a * a * (3 - 2 * a);
      if (o.fadeY1 > o.fadeY0) { let fd = (y - o.fadeY0 + (n1 - 0.5) * 30) / (o.fadeY1 - o.fadeY0); fd = fd < 0 ? 0 : fd > 1 ? 1 : fd; a *= 1 - fd * fd * (3 - 2 * fd) * o.fadeK; }
      d[o4] = r; d[o4 + 1] = g; d[o4 + 2] = b; d[o4 + 3] = a * 255 * alphaK;
    }
  }

  // ---------- 巨型积雨云 ----------
  const CS = 0.4, CW = Math.round(2880 * CS), CH = Math.round(1320 * CS), CX0 = -160, CY0 = -420;
  const cloud = (function () {
    const [cv, cg] = canvas(CW, CH), id = cg.createImageData(CW, CH), rng = RNG(2024), puffs = [], N = 190;
    for (let i = 0; i < N; i++) {
      const tau = Math.pow(i / (N - 1), 0.85), halfW = 130 + 1650 * Math.pow(tau, 0.72), topY = 430 - 720 * Math.sqrt(tau), baseY = 505 + 70 * tau;
      const u = clamp(rng.g() * 0.8 + (rng() - 0.5) * 0.5, -1, 1), cxm = 1560 - 190 * tau;
      const hTop = topY + (baseY - topY - 130) * Math.pow(Math.abs(u), 1.7), v = Math.pow(rng(), 1.5);
      const R = rng.r(95, 215) * (0.62 + 0.55 * (1 - Math.abs(u))) * (0.7 + 0.5 * tau);
      const x = cxm + u * halfW, y = lerp(hTop + R * 0.4, baseY - R * 0.25, v);
      const persist = rng() < 0.2;
      const dSun = Math.hypot(x - W.SUN.x, y - W.SUN.y);
      const kids = []; for (let k = 0, nk = 3 + ((rng() * 3) | 0); k < nk; k++) { const ka = -Math.PI * rng.r(0.05, 0.95), kd = rng.r(0.4, 0.72), kr = rng.r(0.4, 0.62); kids.push([Math.cos(ka) * kd, Math.sin(ka) * kd * 0.9, kr, rng.r(-0.1, 0.25)]); if (rng() < 0.4) kids.push([Math.cos(ka) * (kd + kr * 0.55), Math.sin(ka) * (kd + kr * 0.55) * 0.9, kr * rng.r(0.5, 0.7), rng.r(0, 0.3)]); }
      puffs.push({ kids, flat: rng.r(1.4, 2.1), x, y, R, z: rng.g() * 150 + v * 90, t0: C.cloudGrow - 1.2 + tau * 7.6 + rng() * 0.7, grow: rng.r(3.2, 6), ox: 1560 + u * halfW * 0.28, oy: Math.min(y + R, 470), ph: rng() * TAU, persist, tEnd: 61.5 + clamp(dSun / 2400) * 5 + rng() * 2.6, drift: rng.r(4, 11) * (x < 1300 ? -1 : 1) });
    }
    for (let i = 0; i < 46; i++) {                                   // 云底：连成一片的暗色云幕
      const x = -260 + i * 68 + rng.g() * 70, R = rng.r(105, 280), y = 556 + rng.g() * 34 - R * 0.3, dSun = Math.hypot(x - W.SUN.x, y - W.SUN.y);
      puffs.push({ x, y, R, z: rng.g() * 90 + 80, t0: 40.2 + Math.abs(x - 1500) / 1500 * 5.2 + rng() * 0.6, grow: rng.r(3, 5), ox: lerp(1500, x, 0.6), oy: 500, ph: rng() * TAU, persist: rng() < 0.12, tEnd: 61.8 + clamp(dSun / 2400) * 5 + rng() * 2.4, drift: rng.r(4, 11) * (x < 1300 ? -1 : 1) });
    }
    const PAL = {
      sun: { lit: [252, 245, 226], mid: [236, 229, 216], sh: [176, 178, 201], deep: [134, 139, 170] },
      storm: { lit: [226, 224, 220], mid: [186, 187, 198], sh: [140, 144, 168], deep: [104, 109, 138] },
      after: { lit: [254, 251, 240], mid: [240, 240, 236], sh: [182, 198, 226], deep: [146, 166, 206] }
    };
    const mixPal = (a, b, t) => { const o = {}; for (const k of ['lit', 'mid', 'sh', 'deep']) o[k] = [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t), lerp(a[k][2], b[k][2], t)]; return o; };
    let last = -1;
    return {
      canvas: cv, active: false,
      update(t) {
        const t8 = q(t, 8); if (t8 === last) return; last = t8;
        this.active = t8 > C.cloudGrow - 1.2;
        if (!this.active) return;
        const list = [];
        for (const p of puffs) {
          const a = (t8 - p.t0) / p.grow; if (a <= 0) continue;
          const e = ease.out(clamp(a));
          let r = p.R * e * (1 + 0.035 * Math.sin(t8 * 0.9 + p.ph)), x = lerp(p.ox, p.x, e), y = lerp(p.oy, p.y, e);
          const dis = smooth(p.tEnd, p.tEnd + (p.persist ? 6 : 4.5), t8);
          r *= p.persist ? 1 - dis * 0.5 : 1 - dis; x += p.drift * Math.max(0, t8 - p.t0 - p.grow) * 0.35 + dis * p.drift * 14; y -= dis * 30;
          if (r < 2) continue;
          list.push([(x - CX0) * CS, (y - CY0) * CS, r * CS, p.z * CS, p.flat || 1]);
          if (p.kids) for (const c of p.kids) list.push([(x + c[0] * r - CX0) * CS, (y + c[1] * r - CY0) * CS, c[2] * r * CS, (p.z + c[3] * r) * CS, 1.3]);
        }
        const storm = smooth(43, 49, t8) * (1 - smooth(61, 67, t8)), aft = smooth(61, 68, t8);
        let pal = mixPal(PAL.sun, PAL.storm, storm); pal = mixPal(pal, PAL.after, aft * (1 - storm));
        pal.rim = 0.9 * smooth(42, 47, t8);
        shadeField(id, CW, CH, list, pal, { warp: 26, ox: Math.floor(t8 * 2.2), oy: Math.floor(t8 * 0.8), lx: 0.5, ly: -0.62, lz: 0.5, baseY0: (lerp(430, 190, storm) - CY0) * CS, baseY1: (lerp(700, 470, storm) - CY0) * CS, baseK: 0.75 + storm * 0.5, scud: storm, edge: 4.6, fadeY0: (560 - CY0) * CS, fadeY1: (760 - CY0) * CS, fadeK: storm, sunX: (W.SUN.x - CX0) * CS, sunY: (W.SUN.y - CY0) * CS, rimR: 150 });
        cg.putImageData(id, 0, 0);
      },
      draw(ctx) { if (!this.active) return; ctx.drawImage(cv, CX0, CY0, 2880, 1320); ctx.globalAlpha = 0.5; ctx.drawImage(cv, CX0 + 2.4, CY0 + 1.4, 2880, 1320); ctx.globalAlpha = 0.34; ctx.drawImage(cv, CX0 - 1.4, CY0 + 2.4, 2880, 1320); ctx.globalAlpha = 0.25; ctx.drawImage(cv, CX0 + 1.2, CY0 - 2.2, 2880, 1320); ctx.globalAlpha = 1; }   // 多次微偏移叠画：抹掉取样锯齿
    };
  })();

  // ---------- 水汽 ----------
  const vaporSprites = (function () {
    const out = [], rng = RNG(66);
    for (let k = 0; k < 6; k++) {
      const S = 112, [c, g] = canvas(S, S), id = g.createImageData(S, S), list = [];
      const n = 5 + ((rng() * 4) | 0);
      for (let i = 0; i < n; i++) { const a = rng() * TAU, d = rng() * 24; list.push([S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d * 0.85, rng.r(14, 27), rng.g() * 8]); }
      shadeField(id, S, S, list, { lit: [253, 248, 232], mid: [240, 236, 226], sh: [203, 202, 220], deep: [176, 178, 205] }, { warp: 9, ox: k * 37, oy: k * 11, lx: 0.5, ly: -0.62, lz: 0.5, baseY0: 0, baseY1: 0, edge: 9, alpha: 0.92 });
      g.putImageData(id, 0, 0); out.push(c);
    }
    return out;
  })();
  const VP = []; (function () { const r = RNG(909); for (let i = 0; i < 190; i++) VP.push({ b: C.vaporStart + i * ((C.vaporEnd - C.vaporStart) / 190) + r.g() * 0.12, life: r.r(4.2, 6.4), sx: r.g(), ph: r() * TAU, sp: (r() * 6) | 0, sz: r.r(0.8, 1.5), flip: r() < 0.5 }); })();
  const SPK = []; (function () { const r = RNG(1717); for (let i = 0; i < 70; i++) SPK.push({ b: C.vaporStart + 0.3 + r() * (C.vaporEnd - C.vaporStart), life: r.r(2.2, 4), sx: r.g(), ph: r() * TAU, s: r.r(2.2, 5) }); })();
  function drawVapor(ctx, t) {
    const t12 = q(t, 12); if (t12 < C.vaporStart - 0.1 || t12 > C.vaporEnd + 7) return;
    const X = T.DOME.x, Y = T.DOME.y - 78;
    // 喷口的亮柱
    const jet = smooth(C.vaporStart, C.vaporStart + 0.8, t12) * (1 - smooth(C.vaporEnd - 1.5, C.vaporEnd + 0.5, t12));
    if (jet > 0.01) {
      const r = RNG(Math.floor(t12 * 12));
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      soft(ctx, 26, rgba('#fbe9c0', 0.6 * jet), c => { const p = [[X - 26, Y + 20], [X - 16 + r.g() * 4, Y - 60], [X - 34 + r.g() * 8, Y - 150], [X + r.g() * 10, Y - 205], [X + 34 + r.g() * 8, Y - 150], [X + 16 + r.g() * 4, Y - 60], [X + 26, Y + 20]]; tracePoly(c, spline(p, 5, true)); });
      ctx.restore();
    }
    for (const p of VP) {
      const a = t12 - p.b; if (a <= 0 || a >= p.life) continue;
      const u = a / p.life, wd = wind(X, t12 - a * 0.4);
      const y = Y - 380 * (1 - Math.exp(-a * 0.8)) - 26 * a;
      const x = X + p.sx * (10 + a * 24) + Math.sin(a * 1.4 + p.ph) * 9 * a * 0.4 + wd * a * 13 - a * a * 2.2;
      const sz = (26 + 54 * Math.pow(a, 0.85)) * p.sz, al = smooth(0, 0.07, u) * (1 - smooth(0.5, 1, u)) * 0.9;
      const s = vaporSprites[p.sp];
      ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y); if (p.flip) ctx.scale(-1, 1);
      ctx.drawImage(s, -sz, -sz, sz * 2, sz * 2); ctx.restore();
    }
    // 水汽里的微光
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < SPK.length; i++) {
      const p = SPK[i], a = t12 - p.b; if (a <= 0 || a >= p.life) continue;
      const u = a / p.life; if (ih(i, Math.floor(t12 * 12)) < 0.35) continue;                 // 闪烁
      const y = Y - 300 * (1 - Math.exp(-a * 0.9)) - 34 * a, x = X + p.sx * (8 + a * 30) + Math.sin(a * 2 + p.ph) * 12;
      const s = p.s * (1 - u * 0.5), al = (1 - smooth(0.6, 1, u)) * 0.9, rot = p.ph + a;
      ctx.fillStyle = rgba(i % 3 ? '#fde9b6' : '#d9f0e6', al);
      ribbon(ctx, [[x - Math.cos(rot) * s, y - Math.sin(rot) * s], [x, y], [x + Math.cos(rot) * s, y + Math.sin(rot) * s]], t2 => 0.9 * Math.sin(Math.PI * t2) + 0.1);
      ribbon(ctx, [[x + Math.sin(rot) * s * 0.7, y - Math.cos(rot) * s * 0.7], [x, y], [x - Math.sin(rot) * s * 0.7, y + Math.cos(rot) * s * 0.7]], t2 => 0.8 * Math.sin(Math.PI * t2) + 0.1);
    }
    ctx.restore();
  }

  // ---------- 丁达尔光束 ----------
  const beamSprite = (function () {
    const w = 512, h = 128, [c, g] = canvas(w, h), id = g.createImageData(w, h), d = id.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = (y / h) * 2 - 1, spread = 0.3 + 0.7 * u;                   // 越远越宽
      const vv = v / spread; let a = 0;
      if (Math.abs(vv) < 1) {
        a = Math.pow(1 - Math.pow(Math.abs(vv), 1.7), 1.6) * smooth(0, 0.07, u) * Math.pow(1 - u, 0.9);
        a *= 0.5 + 0.9 * noise2(vv * 7 + 3, u * 1.6) * (0.6 + 0.4 * noise2(vv * 23, u * 3 + 9));     // 光束里的条纹
        a *= 0.85 + 0.3 * ih(x, y);                                                    // 空气里的微粒
        if (ih(x * 7, y * 13) > 0.9965) a += 0.28 * (1 - u);
      }
      const i = (y * w + x) * 4, cw = clamp(1 - u * 1.25 + Math.abs(vv) * 0.2);
      d[i] = lerp(214, 253, cw); d[i + 1] = lerp(212, 236, cw); d[i + 2] = lerp(228, 186, cw); d[i + 3] = clamp(a, 0, 1) * 255;
    }
    g.putImageData(id, 0, 0); return c;
  })();
  const BEAMS = [[2.02, 1750, 250, 0.9, 1], [2.2, 1900, 170, 0.7, 2], [2.37, 2100, 330, 1, 3], [2.55, 2050, 150, 0.65, 4], [2.7, 2200, 260, 0.85, 5], [2.87, 2100, 120, 0.5, 6], [1.83, 1500, 140, 0.55, 7]];
  function drawBeams(ctx, t, amt) {
    if (amt < 0.01) return;
    const t8 = q(t, 8), sx = W.SUN.x - 70, sy = W.SUN.y - 90;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (const b of BEAMS) {
      const k = amt * b[3] * (0.55 + 0.6 * noise1(t8 * 0.32 + b[4] * 7.7)); if (k < 0.02) continue;
      ctx.save(); ctx.globalAlpha = clamp(k); ctx.translate(sx, sy); ctx.rotate(b[0] + (noise1(t8 * 0.1 + b[4]) - 0.5) * 0.03);
      ctx.drawImage(beamSprite, 150, -b[2], b[1], b[2] * 2); ctx.restore();
    }
    // 光束中浮动的尘埃
    const r = RNG(31337);
    for (let i = 0; i < 64; i++) {
      const b = BEAMS[i % BEAMS.length], along = r.r(0.25, 0.9), across = r.g() * 0.5, ph = r() * 9;
      const tw = noise1(t8 * 1.3 + ph); if (tw < 0.45) continue;
      const d = 150 + b[1] * along + Math.sin(t * 0.2 + ph) * 20, off = across * b[2] * (0.3 + 0.7 * along) + Math.sin(t * 0.3 + ph * 2) * 8;
      const x = sx + Math.cos(b[0]) * d - Math.sin(b[0]) * off, y = sy + Math.sin(b[0]) * d + Math.cos(b[0]) * off;
      ctx.fillStyle = rgba('#fdf0c8', amt * (tw - 0.45) * 1.5); blob(ctx, x, y, r.r(1.6, 3.6), r.r(1.4, 3), 0, 0.3, r, 6); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- 雨 ----------
  const RAIN = [];
  (function () { const r = RNG(5150); const L = [[340, 13, 22, 1.0, 860, 0.3], [170, 30, 50, 1.6, 1300, 0.4], [24, 90, 160, 3.6, 2100, 0.17]];
    L.forEach((l, li) => { for (let i = 0; i < l[0]; i++) RAIN.push({ li, x: r(), ph: r(), len: r.r(l[1], l[2]), w: l[3] * r.r(0.7, 1.3), sp: l[4] * r.r(0.85, 1.2), a: l[5] * r.r(0.6, 1.2), rank: r(), c: r() < 0.5 }); }); })();
  function rainAmt(t) { return smooth(C.rainStart, C.rainFull, t) * (1 - 0.62 * smooth(C.rainThin - 1.5, C.rainThin + 1.5, t)) * (1 - smooth(C.rainThin + 1, C.rainEnd, t)); }
  // 雨幕：斜向的条纹状雨雾，铺在远景与塔之间，把雨“放进”空间里
  const veilSprite = (function () {
    const w = 256, h = 256, [c, g] = canvas(w, h), id = g.createImageData(w, h), d = id.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = (x + y * 0.22) / w, v = y / h, i = (y * w + x) * 4;
      let a = noise2(u * 26, v * 2.2) * 0.6 + noise2(u * 70 + 5, v * 5) * 0.4;
      a = smooth(0.38, 0.8, a) * (0.25 + 0.75 * noise2(u * 3 + 9, v * 1.5)) * smooth(0, 0.3, v) * (1 - smooth(0.86, 1, v)) * (0.85 + 0.3 * ih(x, y));
      d[i] = 196; d[i + 1] = 202; d[i + 2] = 214; d[i + 3] = clamp(a) * 150;
    }
    g.putImageData(id, 0, 0); return c;
  })();
  function drawRainVeil(ctx, t) {                                    // 世界坐标：从云底垂到地平线
    const amt = rainAmt(t); if (amt < 0.01) return;
    const t12 = q(clk(t), 12), sh = (t12 * 420) % 640;
    ctx.save(); ctx.globalAlpha = amt * 0.62;
    for (let k = 0; k < 2; k++) { const off = k ? 320 : 0, y0 = 300 + ((sh + off) % 640) - 640;
      for (let x = -200; x < 2760; x += 760) { ctx.drawImage(veilSprite, x + k * 190, y0 + 300, 780, 660); ctx.drawImage(veilSprite, x + k * 190, y0 + 940, 780, 660); } }
    ctx.restore();
    // 地平线上的雨雾
    if (!drawRainVeil.mist) { const [mc, mg] = canvas(720, 90), r = RNG(9090); for (let i = 0; i < 12; i++) soft(mg, 16, rgba('#c5c9d3', 0.3), c => blob(c, 60 + i * 55 + r.g() * 20, 45 + r.g() * 9, 110, 13, 0, 0.3, r)); drawRainVeil.mist = mc; }
    ctx.save(); ctx.globalAlpha = amt * 0.8; const mo = Math.floor(t12 * 3) % 2 * 40;
    for (let x = -260; x < 2760; x += 1380) ctx.drawImage(drawRainVeil.mist, x + mo, 1128, 1440, 180);
    ctx.restore();
  }
  // layer: 0 远（细密、淡）1 中 2 近（稀疏、长、虚）。画在屏幕空间；zoom 影响雨丝的粗细长短
  function drawRain(ctx, t, SW, SH, zoom, camX, layer) {
    const amt = rainAmt(t); if (amt < 0.004) return;
    const t24 = q(clk(t), 24), zk = Math.pow(zoom / 0.65, 0.5), wd = wind(1280, q(t, 24)), slant = -(0.1 + wd * 0.22);
    for (let i = 0; i < RAIN.length; i++) {
      const d = RAIN[i]; if (d.li !== layer || d.rank > amt * 1.05) continue;
      const len = d.len * zk, span = SH + len * 2, T0 = span / (d.sp * zk), ph = t24 / T0 + d.ph, cyc = Math.floor(ph), p = ph - cyc;
      const y = -len + p * span, par = (d.li + 1) * 0.22;
      const x = ((d.x + ih(i, cyc) * 0.73 - camX * par / SW) % 1 + 1) % 1 * SW * 1.3 - SW * 0.1 - slant * (SH - y) * (0.6 + d.li * 0.3);
      const dx = -slant * len * (0.6 + d.li * 0.3);
      ctx.fillStyle = rgba(d.c ? '#dfe4dc' : '#b4c2d0', d.a * (0.75 + 0.35 * ih(i * 3, cyc)));
      ribbon(ctx, [[x + dx, y - len], [x + dx * 0.45, y - len * 0.45], [x, y]], u => d.w * zk * 0.5 * (0.15 + 0.85 * Math.pow(u, 0.8)) * (u > 0.93 ? 0.6 : 1));
    }
  }
  // 地面与塔身上的小水花（世界坐标）
  function drawSplashes(ctx, t, view) {
    const amt = rainAmt(t); if (amt < 0.01) return;
    const t12 = q(clk(t), 12), n = Math.round(230 * amt);
    for (let i = 0; i < n; i++) {
      const per = 0.42 + ih(i, 5) * 0.4, ph = t12 / per + ih(i, 9), cyc = Math.floor(ph), f = Math.floor((ph - cyc) * per * 12);
      if (f > 4) continue;
      const hx = ih(i * 7 + 1, cyc), hd = ih(i * 5 + 3, cyc);
      let x = lerp(view.x0 - 40, view.x1 + 40, hx), y;
      if (i % 9 === 0) { const L = T.info.ledges[(i / 9 | 0) % T.info.ledges.length]; x = L[0] + (hx - 0.5) * L[2]; y = L[1]; }
      else y = W.PF(x) + 8 + hd * hd * 380;
      if (y > view.y1 + 10 || y < view.y0 - 10) continue;
      const s = (i % 9 === 0 ? 0.55 : 0.5 + clamp((y - 1340) / 420) * 1.3), r = RNG(i * 131 + cyc);
      const col = r() < 0.6 ? '#eef0e2' : '#c5d2da', al = 0.8 * (1 - f / 5.5);
      // 向外散开的短弧与跳起的小水珠
      const rr = (2.5 + f * 2.6) * s;
      for (let k = 0; k < 2; k++) { const a0 = r() * TAU, pts = []; for (let j = 0; j <= 4; j++) { const a = a0 + j / 4 * (1.2 + r()); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.34]); } pencil(ctx, pts, 1.2 * s, col, al * 0.8, r, { raw: true, gap: 0 }); }
      if (f < 3) for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + r.g() * 1.0, v = (5 + r() * 7) * s, h = (f + 1) * v * 0.55 - (f + 1) * (f + 1) * s * 0.9; const px = x + Math.cos(a) * v * (f + 1) * 0.4, py = y - Math.max(0, h); ctx.fillStyle = rgba(col, al); blob(ctx, px, py, 1.1 * s, 1.5 * s, 0, 0.3, r, 5); ctx.fill(); }
    }
  }
  // 积水上的涟漪
  function drawRipples(ctx, t, wetAmt) {
    if (wetAmt < 0.3) return;
    const t12 = q(clk(t), 12), amt = Math.max(rainAmt(t), t < C.rainEnd + 6 && t > C.rainFull ? 0.12 : 0);
    if (amt < 0.01) return;
    W.PUDDLES.forEach((p, pi) => {
      const n = 1 + Math.round(4 * amt);
      for (let k = 0; k < n; k++) {
        const per = 0.9 + ih(pi, k) * 0.7, ph = t12 / per + ih(pi * 3, k * 7), cyc = Math.floor(ph), u = ph - cyc, r = RNG(pi * 977 + k * 31 + cyc);
        const x = p[0] + r.g() * p[2] * 0.6, y = p[1] + r.g() * p[3] * 0.5, R = (4 + u * 30) * (0.7 + p[2] / 160);
        for (let ring = 0; ring < 2; ring++) {
          const rr = R * (1 - ring * 0.42); if (rr < 2) continue;
          const pts = blobPts(x, y, rr, rr * 0.26, 0, 0.05, r, 10).filter((_, i) => i % 3 === 0); pts.push(pts[0]);
          pencil(ctx, pts, 1.6 - ring * 0.4, ring ? '#55626e' : '#eef1e4', (1 - u) * 0.7 * wetAmt, r, { raw: true, gap: 0.22, freq: 14 });
        }
      }
    });
  }
  // 第一滴雨：落在鼻尖
  function drawFirstDrop(ctx, t, nose) {
    const t0 = C.firstDrop - 0.62, t24 = q(t, 24);
    if (t24 < t0 || t24 > C.firstDrop + 0.5) return;
    if (t24 < C.firstDrop) {
      const u = (t24 - t0) / (C.firstDrop - t0), y = nose[1] - 4 - (1 - u * u) * 330, x = nose[0] + 1 + (1 - u) * 16, s = 2.6;
      const sh = [[x, y - s * 4.2], [x + s * 0.9, y - s * 1.2], [x + s * 1.25, y + s * 0.3], [x, y + s * 1.5], [x - s * 1.25, y + s * 0.3], [x - s * 0.9, y - s * 1.2]];
      ctx.fillStyle = rgba('#c9dbe3', 0.9); tracePoly(ctx, spline(sh, 5, true)); ctx.fill();
      ctx.fillStyle = rgba('#f4f6ea', 0.95); blob(ctx, x - s * 0.35, y + s * 0.1, s * 0.42, s * 0.62, 0.3, 0.2, RNG(3), 6); ctx.fill();
      ctx.fillStyle = rgba('#7f97ad', 0.55); ribbon(ctx, [[x + s * 0.7, y - s * 0.6], [x + s * 0.8, y + s * 0.5], [x + s * 0.2, y + s * 1.25]], () => 0.45);
    } else {
      const f = Math.floor((t24 - C.firstDrop) * 12), r = RNG(404 + f);
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.42 + r.g() * 0.1, v = 5 + (k % 3) * 2.4, d = (f + 1) * v * 0.62, h = d - (f + 1) * (f + 1) * 0.75;
        const px = nose[0] + Math.cos(a) * d * 0.9, py = nose[1] - 2 + Math.sin(a) * Math.max(h, -4) * 1;
        ctx.fillStyle = rgba('#eef2e6', 0.95 * (1 - f / 6)); blob(ctx, px, py, 1.25 - f * 0.12, 1.7 - f * 0.15, a + 1.57, 0.25, r, 6); ctx.fill();
      }
      if (f < 4) { const pts = blobPts(nose[0], nose[1] - 1.5, 3 + f * 2.2, 1.4 + f * 0.8, -0.1, 0.08, r, 9).filter((_, i) => i % 3 === 0); pts.push(pts[0]); pencil(ctx, pts, 1, '#f4f6ea', 0.8 * (1 - f / 4), r, { raw: true, gap: 0.2 }); }
    }
  }

  // ---------- 风沙 ----------
  const WINT = (function () { const n = 80 * 20 + 2, a = new Float32Array(n); let s = 0; for (let i = 0; i < n; i++) { a[i] = s; s += wind(1280, i / 20) / 20; } return a; })();
  const windInt = t => { const f = clamp(t, 0, 79.9) * 20, i = f | 0; return lerp(WINT[i], WINT[i + 1], f - i); };
  const GRAINS = []; (function () { const r = RNG(808); for (let i = 0; i < 420; i++) GRAINS.push({ x: r() * 3000, d: Math.pow(r(), 1.3), v: r.r(420, 900), ph: r() * 100, lift: r.r(2, 26), w: r.r(0.7, 1.9), c: r() }); })();
  const wispSprite = (function () {
    const w = 256, h = 64, [c, g] = canvas(w, h), id = g.createImageData(w, h), d = id.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w, v = (y / h) * 2 - 1, env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.6)), 1.3) * Math.pow(Math.max(0, 1 - Math.abs(v) / (0.25 + 0.75 * u)), 1.5);
      const a = env * (0.3 + 1.0 * noise2(u * 5 + 2, v * 3.5 + u * 2)) * (0.75 + 0.5 * ih(x, y)), i = (y * w + x) * 4;
      d[i] = 243; d[i + 1] = 214; d[i + 2] = 166; d[i + 3] = clamp(a) * 215;
    }
    g.putImageData(id, 0, 0); return c;
  })();
  const WISPS = [[868, 0, 1.2], [760, 18, 0.8], [2050, 0, 0.9], [420, 30, 0.7], [1330, 34, 0.75], [1720, 22, 0.6], [2380, 14, 0.8], [1000, 60, 0.55]];
  function drawSand(ctx, t, dryAmt, view) {
    if (dryAmt < 0.02) return;
    const t24 = q(t, 24), wi = windInt(t24);
    // 沙脊上被吹起的“沙烟”
    for (let k = 0; k < WISPS.length; k++) {
      const w = WISPS[k], x = w[0], g = wind(x, t24), a = clamp(g * 1.25 - 0.12) * dryAmt * 0.85; if (a < 0.02) continue;
      const y = W.PF(x) + w[1], len = (190 + g * 260) * w[2], hh = (26 + g * 30) * w[2];
      ctx.save(); ctx.globalAlpha = clamp(a); ctx.translate(x - 20, y - 2); ctx.rotate(-0.1 - 0.05 * Math.sin(t24 * 3 + k));
      const fr = Math.floor(t24 * 12) % 2; if (fr) ctx.scale(1, -1);
      ctx.drawImage(wispSprite, 0, -hh, len, hh * 2); ctx.restore();
    }
    for (let i = 0; i < GRAINS.length; i++) {
      const p = GRAINS[i], x = ((p.x + p.v * (wi + t24 * 0.05) * (0.5 + p.d * 0.9)) % 3000) - 220;
      if (x < view.x0 - 60 || x > view.x1 + 60) continue;
      const g = wind(x, t24), a = clamp(g * 1.5 - 0.08) * dryAmt; if (a < 0.03) continue;
      const base = (i % 4 === 0 ? W.PM(x) : W.PF(x)) + 4 + p.d * p.d * 330;
      const y = base - p.lift * (0.3 + g) * (0.5 + noise1(x * 0.011 + p.ph)) - 2, len = (6 + g * 26) * (0.5 + p.d), sl = (noise1(x * 0.02 + p.ph + 7) - 0.5) * 0.5;
      ctx.fillStyle = rgba(p.c < 0.6 ? '#f5dcae' : p.c < 0.85 ? '#e9b77c' : '#b97a52', a * 0.85);
      ribbon(ctx, [[x - len, y + len * sl], [x - len * 0.4, y + len * sl * 0.3], [x, y]], u => p.w * (0.4 + p.d) * 0.5 * Math.pow(u, 0.7));
    }
  }
  // 齿轮咬合时从塔身、帆翼上震落的沙土
  const FALLS = [];
  function initFalls() {
    const r = RNG(2323), ev = [[C.gearJerk1, 1], [C.gearSlip, 0.5], [C.gearJerk2, 1.2], [C.rotorStart + 0.9, 0.5], [C.rotorStart + 2.3, 0.4], [C.rotorStart + 4.2, 0.3]];
    const pts = T.info.ledges.map(l => [l[0], l[1], l[2], 1]);
    for (const G of T.GEARS) pts.push([G.x, G.y + G.r * 0.6, G.r * 1.6, 1.4]);
    for (let a = 0; a < 6; a++) { const an = 0.38 + a * TAU / 6; for (const rr of [150, 260, 370]) pts.push([T.HUB.x + Math.cos(an) * rr, T.HUB.y + Math.sin(an) * rr, 50, 0.8]); }
    for (const e of ev) for (const p of pts) {
      const n = Math.round(12 * e[1] * p[3] * r.r(0.4, 1.3));
      for (let i = 0; i < n; i++) FALLS.push({ t: e[0] + Math.pow(r(), 1.6) * (0.5 + e[1]), x: p[0] + r.g() * p[2] * 0.5, y: p[1] + r() * 4, vx: r.g() * 14, s: r.r(0.9, 2.6), c: r(), stream: r() < 0.22 });
      FALLS.push({ t: e[0] + 0.02, x: p[0], y: p[1], dust: p[2] * (0.5 + e[1] * 0.5), c: r() });
    }
  }
  function drawFalls(ctx, t, view) {
    if (t < C.gearJerk1 - 0.1 || t > C.rotorStart + 9) return;
    const t24 = q(t, 24), t12 = q(t, 12);
    for (let i = 0; i < FALLS.length; i++) {
      const p = FALLS[i], a = (p.dust ? t12 : t24) - p.t; if (a <= 0) continue;
      if (p.x < view.x0 - 80 || p.x > view.x1 + 80) continue;
      if (p.dust) {                                                  // 扬起的尘团
        if (a > 1.5) continue; const u = a / 1.5, r = RNG(i * 17 + Math.floor(t12 * 6));
        ctx.fillStyle = rgba(p.c < 0.5 ? '#edc48c' : '#d9a06a', 0.2 * (1 - u) * (1 - u));
        for (let k = 0; k < 3; k++) { blob(ctx, p.x + r.g() * p.dust * 0.4 + u * 12, p.y - u * 12 - r() * 8 + k * 3, p.dust * (0.22 + u * 0.4), p.dust * (0.12 + u * 0.22), r.g() * 0.3, 0.3, r, 9); ctx.fill(); }
        continue;
      }
      if (a > 2.4) continue;
      const y = p.y + 420 * a * a + 20 * a, gy = W.PF(p.x) + 30; if (y > gy) continue;
      const x = p.x + p.vx * a + wind(p.x, t24) * a * 26, v = 840 * a + 20, len = clamp(v * 0.012, 1.6, 7) * (p.stream ? 2.2 : 1);
      ctx.fillStyle = rgba(p.c < 0.55 ? '#efc58e' : p.c < 0.85 ? '#d99a5c' : '#9a5a40', 0.85);
      ribbon(ctx, [[x - p.vx * 0.02, y - len], [x, y]], u => p.s * 0.5 * (0.3 + 0.7 * u));
    }
  }

  // ---------- 枯根与植被 ----------
  const STRAW = ['#c9a868', '#b38d5a', '#d9c088', '#a47c52', '#c4a070'];
  const GREENS = ['#7fb04e', '#93ba52', '#5c9a50', '#3d7d5a', '#a4c860', '#6ea548', '#b9d470', '#4a8c5e'];
  const PETALS = [['#f4ecd6', '#e9d9b4'], ['#ecd27a', '#dcb458'], ['#e5a6a2', '#cf8686'], ['#98a6d6', '#7d8ac0'], ['#f1dcc0', '#e0b89a']];
  const FLORA = [];
  function initFlora() {
    const r = RNG(6006);
    const add = (x, depth, kind, o) => { const y = W.PF(x) + 8 + depth, dist = Math.hypot(x - 1380, (y - 1470) * 2); FLORA.push(Object.assign({ x, y, kind, tb: C.sprout + dist * 0.0052 + r() * 3.6, dur: r.r(2.2, 3.6), seed: (r() * 1e6) | 0, sc: 0.75 + clamp((y - 1340) / 420) * 1.25 }, o || {})); };
    for (let i = 0; i < 70; i++) add(r.r(1080, 1520), Math.pow(r(), 1.3) * 120, r() < 0.62 ? 'grass' : r() < 0.6 ? 'flower' : 'leaf');
    for (let i = 0; i < 80; i++) add(r.r(520, 1100), Math.pow(r(), 1.2) * 230, r() < 0.68 ? 'grass' : r() < 0.6 ? 'flower' : 'leaf');
    for (let i = 0; i < 80; i++) add(r.r(1500, 2500), Math.pow(r(), 1.2) * 250, r() < 0.68 ? 'grass' : r() < 0.6 ? 'flower' : 'leaf');
    for (let i = 0; i < 46; i++) add(r.r(-60, 2640), 150 + r() * 260, r() < 0.6 ? 'grass' : 'flower');
    for (const p of W.PUDDLES) for (let i = 0; i < 9; i++) { const a = r() * TAU; FLORA.push({ x: p[0] + Math.cos(a) * p[2] * 1.12, y: p[1] + Math.sin(a) * p[3] * 1.5, kind: r() < 0.75 ? 'grass' : 'flower', tb: C.sprout + 1 + r() * 5, dur: r.r(2.2, 3.4), seed: (r() * 1e6) | 0, sc: 0.75 + clamp((p[1] - 1340) / 420) * 1.25 }); }
    // 枯草丛：开场就在，雨后原地返青
    const dryAt = (x, depth, big) => { const y = W.PF(x) + 8 + depth, dist = Math.hypot(x - 1380, (y - 1470) * 2); FLORA.push({ x, y, kind: 'grass', dry: true, tb: C.sprout - 0.5 + dist * 0.004 + r() * 3, dur: 3.2, seed: (r() * 1e6) | 0, sc: (0.8 + clamp((y - 1340) / 420) * 1.2) * (big || 1) }); };
    for (const c of [[610, 12, 9], [760, 40, 7], [905, 30, 6], [1040, 70, 8], [1130, 44, 7], [1330, 36, 9], [1480, 60, 6], [1700, 30, 8], [1880, 60, 9], [2040, 24, 8], [2200, 70, 9], [2420, 40, 8], [300, 60, 8], [80, 130, 7], [1250, 190, 8], [1640, 210, 9], [900, 250, 8], [2300, 230, 8], [520, 200, 7]])
      for (let i = 0; i < c[2]; i++) dryAt(c[0] + r.g() * 60, Math.max(0, c[1] + r.g() * 26), i === 0 ? 1.35 : 1);
    // 溪岸的水草
    for (let i = 0; i < 44; i++) { const p = W.streamAt(r()), sd = r.sign(); FLORA.push({ x: p[0] + p[4] * sd * (p[2] + 5), y: p[1] + p[5] * sd * (p[2] + 3) + 2, kind: r() < 0.8 ? 'grass' : 'flower', tb: W.STREAM_T0 + p[3] * W.STREAM_DUR + 1 + r() * 4, dur: r.r(2.2, 3.4), seed: (r() * 1e6) | 0, sc: 0.8 + clamp((p[1] - 1340) / 420) * 1.2 }); }
    // 沙狐最后嗅的那几朵（长在复苏的枯根上）
    FLORA.push({ x: W.PLANT_X + 12, y: W.groundY(W.PLANT_X + 12) + 2, kind: 'flower', tb: 61.5, dur: 3.4, seed: 4242, sc: 1.55, hero: true, pal: 0, h: 27 });
    FLORA.push({ x: W.PLANT_X - 13, y: W.groundY(W.PLANT_X - 13) + 3, kind: 'flower', tb: 62.4, dur: 3.2, seed: 4243, sc: 1.3, hero: true, pal: 1, h: 20 });
    FLORA.push({ x: W.PLANT_X + 34, y: W.groundY(W.PLANT_X + 34) + 4, kind: 'flower', tb: 63.2, dur: 3.2, seed: 4244, sc: 1.2, hero: true, pal: 2, h: 16 });
    FLORA.sort((a, b) => a.y - b.y);
    // 沿塔基向上蔓延的藤蔓与苔藓
    const VP2 = [
      [[1300, 1500], [1312, 1440], [1296, 1380], [1330, 1320], [1368, 1262], [1392, 1196], [1388, 1130]],
      [[1410, 1470], [1404, 1420], [1432, 1372], [1420, 1330], [1446, 1290], [1436, 1240]],
      [[1650, 1462], [1662, 1410], [1640, 1362], [1668, 1318], [1652, 1270], [1676, 1226]],
      [[1790, 1440], [1802, 1392], [1826, 1350], [1812, 1300], [1790, 1262], [1772, 1210], [1780, 1160]],
      [[1520, 1470], [1508, 1430], [1528, 1392], [1512, 1350]],
      [[1180, 1510], [1196, 1462], [1186, 1420]]
    ];
    VP2.forEach((p, i) => VINES.push({ pts: spline(p, 10), tb: 59.5 + i * 0.7 + r() * 0.8, dur: 7 + r() * 3, seed: 70 + i, leaves: Array.from({ length: Math.round(p.length * 3.4) }, (_, k) => ({ u: (k + 0.4 + r() * 0.5) / (p.length * 3.4), side: k % 2 ? 1 : -1, s: r.r(5, 10), col: r.pick(GREENS), a: r.g() * 0.4, fl: r() < 0.14 ? r.pick(PETALS) : null })) }));
    const mossSpots = [[1362, 1474, 46], [1470, 1476, 60], [1600, 1470, 50], [1716, 1452, 54], [1408, 1352, 40], [1500, 1336, 44], [1640, 1334, 50], [1740, 1338, 36], [1420, 1150, 24], [1470, 1046, 30], [1620, 1042, 34], [1690, 1284, 26], [1392, 808, 22], [1700, 806, 24]];
    for (const m of mossSpots) { const n = 5 + ((r() * 5) | 0); for (let k = 0; k < n; k++) MOSS.push({ x: m[0] + r.g() * m[2], y: m[1] + r.g() * 4 + Math.abs(r.g()) * 9, rx: r.r(6, 17), ry: r.r(3, 7), tb: 59 + (1480 - m[1]) * 0.012 + r() * 3, col: r.pick(GREENS), seed: (r() * 1e5) | 0, drip: r() < 0.3 ? r.r(8, 26) : 0 }); }
  }
  const VINES = [], MOSS = [];

  function drawDryPlant(ctx, t) {
    const t12 = q(t, 12), x0 = W.PLANT_X, y0 = W.groundY(x0) + 3, wd = wind(x0, t12), r = RNG(55);
    const wetK = smooth(54, 60, t12), rb = RNG(600 + Math.floor(t12 * 8));
    const stems = [[-10, -0.5, 40, 2.6, 1], [6, 0.3, 50, -3.1, -1], [-2, -0.15, 30, 3.4, 1], [17, 0.75, 33, -2.4, -1], [-21, -0.9, 24, 2.2, 1], [10, 0.1, 19, 3.6, -1]];
    ctx.fillStyle = rgba(mix('#b8875a', '#5a3d30', wetK), 0.5); blob(ctx, x0, y0 + 1, 22, 4, 0, 0.3, r, 9); ctx.fill();
    stems.forEach((s, i) => {
      const pts = [[x0 + s[0], y0]]; let a = -Math.PI / 2 + s[1] * 0.55, px = x0 + s[0], py = y0; const n = 9, sway = wd * 0.16 * s[4] * 0.3 + wd * 0.13;
      for (let k = 1; k <= n; k++) { const u = k / n; a += (u > 0.45 ? s[3] * 0.17 * (u - 0.3) * 2.4 : s[1] * 0.04) + sway * u * 0.5 + (noise1(t12 * 9 + i * 3) - 0.5) * 0.05 * wd * u; px += Math.cos(a) * s[2] / n; py += Math.sin(a) * s[2] / n; pts.push([px, py]); }
      const col = mix(i % 2 ? '#7c5a44' : '#9a7652', '#4e3a30', wetK * 0.7);
      pencil(ctx, pts, 3.2 - i * 0.25, col, 0.95, rb, { gap: 0.02, taper: 0.4, jit: 0.4 });
      pencil(ctx, pts.map(p => [p[0] + 0.7, p[1] - 0.5]), 0.9, mix('#d9b98c', '#8a7868', wetK), 0.6, rb, { gap: 0.3, taper: 0.5 });
      if (i < 4) { const m = pts[4 + (i % 2)], a2 = -0.6 * s[4] - 1.3; pencil(ctx, [m, [m[0] + Math.cos(a2) * 6, m[1] + Math.sin(a2) * 6], [m[0] + Math.cos(a2 + s[4]) * 10, m[1] + Math.sin(a2 + s[4]) * 9]], 1.4, col, 0.9, rb, { gap: 0, taper: 0.6 }); }
      // 复苏：枯枝上抽出的嫩叶
      const g = ease.out(seg(t12, 58.2 + i * 0.5, 61.5 + i * 0.5));
      if (g > 0) for (let k = 0; k < 3; k++) { const m = pts[2 + k * 2 + (i % 2)], side = (k % 2 ? 1 : -1) * s[4], la = -Math.PI / 2 + side * 0.9 + wd * 0.2, L = (5 + k * 1.2) * g;
        const tip = [m[0] + Math.cos(la) * L, m[1] + Math.sin(la) * L]; ctx.fillStyle = rgba(vary(GREENS[(i + k) % GREENS.length], r, 8), 0.95);
        ribbon(ctx, [m, [(m[0] + tip[0]) / 2 + side, (m[1] + tip[1]) / 2 - 1], tip], u => 2.3 * g * Math.sin(Math.PI * clamp(u * 0.92 + 0.04))); }
    });
  }

  function drawFloraItem(ctx, F, t12, boil) {
    let a = (t12 - F.tb) / F.dur; const greenK = F.dry ? clamp(a) : 1; if (F.dry) a = 1; if (a <= 0) return;
    const g = (a >= 1 ? 1 : ease.back(clamp(a))) * (F.dry ? 0.82 + 0.3 * ease.sine(greenK) : 1), r = RNG(F.seed), sc = F.sc, wd = wind(F.x, t12);
    const sway = wd * 0.42 + (noise1(t12 * 2.1 + F.seed % 97) - 0.5) * 0.06;
    if (F.kind === 'grass') {
      const n = 4 + ((r() * 5) | 0);
      for (let k = 0; k < n; k++) {
        const h = r.r(9, 24) * sc * g, lean = r.g() * (F.dry ? 0.75 - 0.3 * greenK : 0.42), bx = F.x + r.g() * 5 * sc, cg = vary(r.pick(GREENS), r, 9, 6), cur = r.g() * (F.dry ? 0.9 - 0.5 * greenK : 0.35), ww = r.r(1.5, 2.7) * sc * (F.dry ? 0.75 : 1);
        const col = F.dry ? mix(vary(r.pick(STRAW), r, 8, 5), cg, ease.sine(greenK)) : cg;
        const a1 = -Math.PI / 2 + lean + sway * (0.6 + r() * 0.6), a2 = a1 + cur + sway * 0.9;
        const mid = [bx + Math.cos(a1) * h * 0.55, F.y + Math.sin(a1) * h * 0.55], tip = [mid[0] + Math.cos(a2) * h * 0.5, mid[1] + Math.sin(a2) * h * 0.5];
        ctx.fillStyle = rgba(col, 0.96); ribbon(ctx, spline([[bx, F.y], mid, tip], 4), u => ww * 0.5 * Math.pow(1 - u, 0.7) + 0.15);
        if (k % 3 === 0) { ctx.fillStyle = rgba(mix(col, '#e3e6b0', 0.5), 0.7); ribbon(ctx, [mid, tip], u => ww * 0.22 * (1 - u)); }
      }
    } else if (F.kind === 'leaf') {
      const n = 2 + ((r() * 3) | 0), h = r.r(7, 13) * sc * g, a0 = -Math.PI / 2 + sway * 0.7 + r.g() * 0.15, top = [F.x + Math.cos(a0) * h, F.y + Math.sin(a0) * h];
      ctx.fillStyle = rgba(mix(GREENS[3], '#6d7a48', 0.4), 0.95); ribbon(ctx, [[F.x, F.y], top], () => 0.8 * sc);
      for (let k = 0; k < n; k++) { const side = k % 2 ? 1 : -1, la = a0 + side * (0.75 + r() * 0.5) * clamp(a * 1.4), L = r.r(6, 11) * sc * g, base = [lerp(F.x, top[0], 0.5 + k * 0.2), lerp(F.y, top[1], 0.5 + k * 0.2)], tip = [base[0] + Math.cos(la) * L, base[1] + Math.sin(la) * L], col = vary(r.pick(GREENS), r, 8, 5);
        ctx.fillStyle = rgba(col, 0.96); ribbon(ctx, [base, [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2 - 1.5 * sc], tip], u => L * 0.24 * Math.sin(Math.PI * clamp(u * 0.9 + 0.06)));
        ctx.fillStyle = rgba(mix(col, '#2f4f44', 0.5), 0.6); ribbon(ctx, [base, tip], () => 0.35 * sc); }
    } else {
      const h = (F.h || r.r(11, 22)) * sc * g, lean = r.g() * 0.2, a1 = -Math.PI / 2 + lean + sway * 0.7, a2 = a1 + sway * 0.8 + r.g() * 0.2;
      const mid = [F.x + Math.cos(a1) * h * 0.55, F.y + Math.sin(a1) * h * 0.55], top = [mid[0] + Math.cos(a2) * h * 0.5, mid[1] + Math.sin(a2) * h * 0.5];
      ctx.fillStyle = rgba(vary(GREENS[2], r, 8), 0.96); ribbon(ctx, spline([[F.x, F.y], mid, top], 4), u => (1.1 - u * 0.5) * sc * 0.55);
      for (let k = 0; k < 2; k++) { const side = k ? 1 : -1, la = a1 + side * 1.0, L = r.r(4, 7) * sc * g, b = [lerp(F.x, mid[0], 0.5 + k * 0.3), lerp(F.y, mid[1], 0.5 + k * 0.3)]; ctx.fillStyle = rgba(vary(r.pick(GREENS), r, 8), 0.95); ribbon(ctx, [b, [b[0] + Math.cos(la) * L, b[1] + Math.sin(la) * L]], u => L * 0.24 * Math.sin(Math.PI * clamp(u * 0.9 + 0.06))); }
      const bloom = ease.back(clamp((a - 0.62) / 0.5)); const pal = PETALS[F.pal == null ? (r() * PETALS.length) | 0 : F.pal];
      if (a > 0.45) {
        const s = r.r(2.6, 4.2) * sc * (0.35 + 0.65 * bloom), np = 5 + ((r() * 2) | 0), ph = r() * TAU, rb = RNG(F.seed + boil * 3);
        if (bloom < 0.05) { ctx.fillStyle = rgba(GREENS[0]); blob(ctx, top[0], top[1], 1.5 * sc, 2 * sc, 0, 0.2, r, 6); ctx.fill(); }
        else {
          for (let k = 0; k < np; k++) { const an = ph + k / np * TAU + r.g() * 0.18, d = s * 0.95, px = top[0] + Math.cos(an) * d, py = top[1] + Math.sin(an) * d * 0.78 - s * 0.15;
            ctx.fillStyle = rgba(vary(k % 2 ? pal[0] : mix(pal[0], pal[1], 0.5), r, 6)); blob(ctx, px, py, s * 0.86, s * 0.56, an, 0.16, r, 7); ctx.fill();
            if (F.hero) pencil(ctx, blobPts(px, py, s * 0.86, s * 0.56, an, 0.1, rb, 7).filter((_, i) => i % 4 === 0), 0.8, mix(pal[1], '#6a4a40', 0.4), 0.5, rb, { raw: true, gap: 0.2 }); }
          ctx.fillStyle = rgba('#c98a3a'); blob(ctx, top[0], top[1] - s * 0.15, s * 0.42, s * 0.36, 0, 0.2, r, 7); ctx.fill();
          ctx.fillStyle = rgba('#edc56e', 0.9); blob(ctx, top[0] + s * 0.1, top[1] - s * 0.26, s * 0.2, s * 0.16, 0, 0.2, r, 6); ctx.fill();
        }
      }
    }
  }
  // yMin..yMax 区间内的植被（用于与沙狐做前后遮挡）
  function drawFlora(ctx, t, yMin, yMax, view) {
    const t12 = q(t, 12), early = t12 < C.sprout - 1.2;
    const boil = Math.floor(t12 * 8);
    for (const F of FLORA) { if (early && !F.dry) continue; if (F.y < yMin || F.y >= yMax || F.x < view.x0 - 40 || F.x > view.x1 + 40 || F.y > view.y1 + 40) continue; drawFloraItem(ctx, F, t12, boil); }
  }
  function drawVines(ctx, t) {
    const t12 = q(t, 12); if (t12 < 58.5) return;
    for (const m of MOSS) {
      const a = clamp((t12 - m.tb) / 3); if (a <= 0) continue; const r = RNG(m.seed), g = ease.out(a);
      ctx.fillStyle = rgba(vary(m.col, r, 8, 5), 0.9); blob(ctx, m.x, m.y, m.rx * g, m.ry * g, r.g() * 0.3, 0.3, r, 8); ctx.fill();
      ctx.fillStyle = rgba(mix(m.col, '#c5d08a', 0.5), 0.75); blob(ctx, m.x + m.rx * 0.2, m.y - m.ry * 0.3, m.rx * 0.5 * g, m.ry * 0.45 * g, 0, 0.3, r, 7); ctx.fill();
      if (m.drip) { ctx.fillStyle = rgba(mix(m.col, '#3f6f5c', 0.5), 0.8); ribbon(ctx, [[m.x - m.rx * 0.3, m.y], [m.x - m.rx * 0.3 + r.g() * 2, m.y + m.drip * g]], u => 1.3 * (1 - u) + 0.2); }
    }
    for (const V of VINES) {
      const a = clamp((t12 - V.tb) / V.dur); if (a <= 0) continue;
      const g = ease.sine(a), n = Math.max(2, Math.floor(V.pts.length * g)), part = V.pts.slice(0, n), r = RNG(V.seed), wd = wind(V.pts[0][0], t12);
      ctx.fillStyle = rgba('#3f5f48', 0.95); ribbon(ctx, part, u => 1.7 * (1 - u * 0.6) + 0.3);
      ctx.fillStyle = rgba('#7a9a5e', 0.7); ribbon(ctx, part.map(p => [p[0] + 0.6, p[1] - 0.4]), u => 0.6 * (noise1(V.seed + u * 12) > 0.4 ? 1 : 0.1));
      for (const L of V.leaves) {
        if (L.u > g - 0.02) continue; const k = clamp((g - L.u) * 6), p = V.pts[Math.floor(L.u * (V.pts.length - 1))], la = -Math.PI / 2 + L.side * 1.15 + L.a + wd * 0.25 * L.side, s = L.s * ease.back(k);
        const tip = [p[0] + Math.cos(la) * s, p[1] + Math.sin(la) * s * 0.9];
        ctx.fillStyle = rgba(vary(L.col, r, 7, 4), 0.96); ribbon(ctx, [p, [(p[0] + tip[0]) / 2, (p[1] + tip[1]) / 2 - 1.4], tip], u => s * 0.3 * Math.sin(Math.PI * clamp(u * 0.9 + 0.07)));
        ctx.fillStyle = rgba(mix(L.col, '#dfe6a8', 0.5), 0.6); ribbon(ctx, [[(p[0] + tip[0]) / 2, (p[1] + tip[1]) / 2 - 1.6], tip], u => s * 0.09 * (1 - u));
        if (L.fl && k > 0.8 && t12 > 64) { const fs = 2.6 * ease.back(clamp((t12 - 64 - L.u * 3) / 1.5)); if (fs > 0.1) for (let j = 0; j < 5; j++) { const an = j / 5 * TAU + L.a; ctx.fillStyle = rgba(L.fl[j % 2]); blob(ctx, tip[0] + Math.cos(an) * fs, tip[1] + Math.sin(an) * fs * 0.8, fs * 0.8, fs * 0.55, an, 0.2, r, 6); ctx.fill(); } }
      }
    }
  }

  // 贴近镜头时补画的沙地细节（避免近景背景发虚）
  function drawGroundDetail(ctx, view, zoom, wetK) {
    if (zoom < 1.3) return;
    const al = clamp((zoom - 1.3) / 0.9), cell = 26, x0 = Math.floor(view.x0 / cell), x1 = Math.ceil(view.x1 / cell);
    for (let cx = x0; cx <= x1; cx++) for (let k = 0; k < 5; k++) {
      const r = RNG(cx * 7919 + k * 13), x = (cx + r()) * cell, gy = W.PF(x) + 2, y = gy + Math.pow(r(), 1.5) * (view.y1 - gy + 20); if (y < gy || y > view.y1 + 6) continue;
      const kind = r();
      if (kind < 0.55) { const l = r.r(8, 26), b = r.g() * 1.6; pencil(ctx, [[x, y], [x + l * 0.5, y + b], [x + l, y + r.g()]], r.r(0.5, 1.1), wetK > 0.5 ? '#3d2a2c' : (r() < 0.6 ? '#9a5c46' : '#f5dcae'), al * r.r(0.25, 0.5), r, { gap: 0.12 }); }
      else if (kind < 0.9) { ctx.fillStyle = rgba(wetK > 0.5 ? '#4a3432' : (r() < 0.5 ? '#f3d5a2' : '#a9684e'), al * r.r(0.35, 0.7)); blob(ctx, x, y, r.r(0.5, 1.3), r.r(0.4, 0.9), 0, 0.3, r, 5); ctx.fill(); }
      else { const s = r.r(1.2, 2.6); ctx.fillStyle = rgba(wetK > 0.5 ? '#3f2f30' : '#8a5644', al * 0.8); blob(ctx, x, y, s * 1.3, s * 0.8, r.g() * 0.3, 0.3, r, 6); ctx.fill(); ctx.fillStyle = rgba(wetK > 0.5 ? '#a7998c' : '#f0c896', al * 0.7); blob(ctx, x + s * 0.3, y - s * 0.3, s * 0.5, s * 0.26, 0, 0.3, r, 5); ctx.fill(); }
    }
  }

  // ---------- 枯木（雨后逢春）----------
  const TREES = [], FAR_TREES = [];
  function growTree(x, y, h, seed, lean, maxD) {
    maxD = maxD || 4;
    const r = RNG(seed), segs = [], tips = [];
    (function br(px, py, ang, len, w, d) {
      const n = 4, pts = [[px, py]]; let a = ang;
      for (let i = 0; i < n; i++) { a += r.g() * 0.24 + (d === 0 ? lean * 0.07 : 0); px += Math.cos(a) * len / n; py += Math.sin(a) * len / n; pts.push([px, py]); }
      segs.push({ pts, w0: w, w1: w * 0.6, d, v: r() });
      if (d >= maxD || len < h * 0.07) { tips.push([px, py, a, r(), r()]); return; }
      const k = d === 0 ? 3 : (r() < 0.4 ? 3 : 2);
      for (let i = 0; i < k; i++) { const sp = (i - (k - 1) / 2) * r.r(0.55, 0.92) + r.g() * 0.16; br(px, py, a + sp, len * r.r(0.56, 0.78), w * 0.6, d + 1); }
      if (d > 0 && d < 3 && r() < 0.55) { const m = pts[2]; br(m[0], m[1], a + r.sign() * r.r(0.7, 1.2), len * 0.42, w * 0.36, d + 2); }
    })(x, y, -Math.PI / 2 + lean * 0.22, h * 0.36, h * 0.07, 0);
    return { x, y, h, segs, tips, seed };
  }
  function initTrees() {
    TREES.push(Object.assign(growTree(700, W.PF(700) + 8, 255, 311, -0.9), { tb: 60.2 }));
    TREES.push(Object.assign(growTree(2148, W.PF(2148) + 10, 176, 77, 0.8), { tb: 61.6 }));
    for (const f of [[330, 1, 78, 5, 0.5], [2452, 1, 92, 9, -0.6], [1930, 2, 52, 13, 0.4], [118, 2, 46, 21, -0.3], [1052, 1, 64, 33, 0.7], [2660, 2, 40, 41, 0.2]])
      FAR_TREES.push(Object.assign(growTree(f[0], (f[1] === 1 ? W.PM(f[0]) : W.P2(f[0])) + 3, f[2], f[3] * 17, f[4], 3), { tb: 62.5 + f[3] * 0.08, far: f[1] }));
  }
  const BLOSSOM = ['#f3cfc8', '#f7ecd9', '#e8aeb0', '#f6dcd2'];
  function drawTree(ctx, TR, t, far) {
    const t12 = q(t, 12), sw = wind(TR.x, t12), wetK = smooth(53, 58, t12), spring = smooth(TR.tb, TR.tb + 7, t12);
    const sway = (p) => { const k = Math.pow(clamp((TR.y - p[1]) / TR.h), 1.6); return [p[0] + sw * k * TR.h * 0.045 + (noise1(t12 * 4 + p[1] * 0.05) - 0.5) * sw * k * 3, p[1] + sw * k * k * TR.h * 0.012]; };
    const haze = far ? (far === 2 ? 0.5 : 0.3) : 0;
    const bark = mix(mix(mix('#6a5143', '#3c3133', wetK * 0.85), '#5b4a40', spring * 0.5), '#c9a99a', haze), lite = mix(mix('#c0a07c', '#8d8c8a', wetK), '#d8c0a8', haze), deep = mix(mix('#3d2e2e', '#2c2629', wetK), '#b09088', haze);
    const r = RNG(TR.seed + 5);
    if (!far) { ctx.fillStyle = rgba('#3f2a3c', 0.3); blob(ctx, TR.x - 14, TR.y + 3, TR.h * 0.2, TR.h * 0.024, 0, 0.2, r, 10); ctx.fill();
      for (const sd of [-1, 1]) { ctx.fillStyle = rgba(bark); ribbon(ctx, [[TR.x + sd * 2, TR.y - TR.h * 0.05], [TR.x + sd * TR.h * 0.045, TR.y - 2], [TR.x + sd * TR.h * 0.1, TR.y + 3]], u => TR.h * 0.03 * (1 - u * 0.8)); } }
    for (const S2 of TR.segs) {
      const pts = S2.pts.map(sway);
      ctx.fillStyle = rgba(bark); ribbon(ctx, spline(pts, 3), u => 0.5 * lerp(S2.w0, S2.w1, u) + 0.35);
      if (!far && S2.d <= 2) {
        ctx.fillStyle = rgba(deep, 0.7); ribbon(ctx, spline(pts.map((p2, i) => [p2[0] - lerp(S2.w0, S2.w1, i / 4) * 0.26, p2[1] + 0.5]), 3), u => 0.2 * lerp(S2.w0, S2.w1, u) * (noise1(S2.v * 40 + u * 5) > 0.3 ? 1 : 0.3));
        ctx.fillStyle = rgba(lite, 0.85); ribbon(ctx, spline(pts.map((p2, i) => [p2[0] + lerp(S2.w0, S2.w1, i / 4) * 0.28, p2[1] - 0.5]), 3), u => 0.13 * lerp(S2.w0, S2.w1, u) * (noise1(S2.v * 90 + u * 7) > 0.42 ? 1 : 0.1));
        if (S2.d === 0) for (let k = 0; k < 5; k++) { const a = pts[1 + (k % 3)], l = r.r(6, 16); ctx.fillStyle = rgba(deep, 0.6); ribbon(ctx, [[a[0] + r.g() * S2.w0 * 0.3, a[1] + r.g() * 10], [a[0] + r.g() * S2.w0 * 0.3, a[1] + r.g() * 10 + l]], () => 0.6); }
      }
      // 新叶：沿着细枝抽出
      if (spring > 0.02 && S2.d >= (far ? 2 : 3)) {
        const g = ease.back(clamp((t12 - TR.tb - 1 - S2.v * 5) / 2)); if (g > 0.02) for (let k = 1; k <= 2; k++) {
          const m = pts[k * 2 - 1], sd = (k % 2 ? 1 : -1), la = -Math.PI / 2 + sd * (0.7 + S2.v) + sw * 0.4, L = (far ? 2.6 : 5.2) * g * (0.7 + S2.v * 0.6);
          ctx.fillStyle = rgba(mix(GREENS[(S2.v * 8) | 0], '#dfe6a8', 0.25 + haze * 0.5), 0.95);
          ribbon(ctx, [m, [m[0] + Math.cos(la) * L * 0.5, m[1] + Math.sin(la) * L * 0.5 - 0.8], [m[0] + Math.cos(la) * L, m[1] + Math.sin(la) * L]], u => L * 0.3 * Math.sin(Math.PI * clamp(u * 0.9 + 0.07)));
        }
      }
    }
    // 花：枝头一小簇一小簇地开
    if (spring > 0.01) for (const tp of TR.tips) {
      const g = ease.back(clamp((t12 - TR.tb - tp[3] * 6.5) / 2.2)); if (g <= 0.02) continue;
      const p = sway(tp), n = far ? 2 : 3 + ((tp[4] * 3) | 0), rs = RNG((tp[3] * 1e5) | 0), sz = (far ? 2.3 : 3.6) * g;
      for (let k = 0; k < n; k++) { const a = rs() * TAU, d = rs() * sz * 1.5; ctx.fillStyle = rgba(mix(rs.pick(BLOSSOM), '#f4e6dc', haze), 0.95); blob(ctx, p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d * 0.8 - sz * 0.3, sz * rs.r(0.7, 1.1), sz * rs.r(0.55, 0.9), a, 0.2, rs, 6); ctx.fill(); }
      if (!far && tp[4] > 0.5) { ctx.fillStyle = rgba('#d98f8a', 0.8 * g); blob(ctx, p[0], p[1] - sz * 0.2, sz * 0.3, sz * 0.26, 0, 0.2, rs, 5); ctx.fill(); }
    }
  }
  function drawTrees(ctx, t) { for (const TR of TREES) drawTree(ctx, TR, t, 0); }
  function drawFarTrees(ctx, t) { for (const TR of FAR_TREES) drawTree(ctx, TR, t, TR.far); }
  // 尾声里随风飘落的几片花瓣
  function drawPetals(ctx, t) {
    if (t < 68.5) return; const t12 = q(t, 12), TR = TREES[0], r = RNG(4141);
    for (let i = 0; i < 16; i++) {
      const b = 68.6 + r() * 7.5, life = r.r(3.5, 5.5), a = t12 - b, tp = TR.tips[(r() * TR.tips.length) | 0], ph = r() * 9, sz = r.r(1.8, 3); if (a <= 0 || a > life) continue;
      const x = tp[0] + a * (26 + 30 * wind(tp[0], t12)) + Math.sin(a * 2.1 + ph) * 14, y = tp[1] + a * 34 + Math.cos(a * 1.7 + ph) * 6; if (y > W.groundY(x) + 30) continue;
      ctx.fillStyle = rgba(BLOSSOM[i % 4], 0.95 * (1 - smooth(life - 0.8, life, a))); blob(ctx, x, y, sz, sz * (0.35 + 0.5 * Math.abs(Math.sin(a * 3 + ph))), a * 2 + ph, 0.2, r, 6); ctx.fill();
    }
  }

  // ---------- 风滚草：随 16 秒那阵风滚过塔影 ----------
  function drawTumbleweed(ctx, t) {
    const t12 = q(t, 12), a = t12 - (C.gust + 0.1); if (a < 0 || a > 5) return;
    const x = 860 + 330 * a - 18 * a * a * 0.5, hop = Math.abs(Math.sin(a * 4.6)) * 30 * Math.exp(-a * 0.25), y = W.groundY(x) - 4 - hop - 20, R = 22, rot = x / R, r = RNG(1616);
    ctx.fillStyle = rgba('#3f2a3c', 0.22); blob(ctx, x, W.groundY(x) - 2, R * (1.2 - hop / 60), 3.6, 0, 0.2, r, 8); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    for (let k = 0; k < 20; k++) {
      const a0 = r() * TAU, rr = R * r.r(0.4, 1.05), sp = r.r(1.2, 2.6), pts = [];
      for (let j = 0; j <= 5; j++) { const an = a0 + j / 5 * sp; pts.push([Math.cos(an) * rr + r.g() * 1.5, Math.sin(an) * rr * r.r(0.85, 1.1)]); }
      pencil(ctx, pts, r.r(1, 2.1), k % 3 ? '#7a5a40' : '#c4a274', 0.92, r, { gap: 0.06, per: 3 });
    }
    ctx.restore();
  }

  // ---------- 小溪：雨后从塔的引水管下涌出，沿洼地流向近处 ----------
  const GLINTS = []; (function () { const r = RNG(747); for (let i = 0; i < 64; i++) GLINTS.push({ s: r(), v: r.r(0.05, 0.11), off: r.g() * 0.6, len: r.r(0.012, 0.03), w: r.r(0.8, 1.7), c: r() }); })();
  function drawStreamFlow(ctx, t) {
    const t12 = q(t, 12); if (t12 < W.STREAM_T0) return;
    for (let i = 0; i < GLINTS.length; i++) {
      const G = GLINTS[i]; let s0 = (G.s + t12 * G.v) % 1;
      const head = (t12 - W.STREAM_T0) / W.STREAM_DUR; if (s0 > head) continue;
      const fade = Math.sin(Math.PI * s0) * clamp((head - s0) * 6), pts = [];
      for (let k = 0; k <= 3; k++) { const p = W.streamAt(clamp(s0 + G.len * k / 3)); pts.push([p[0] + p[4] * G.off * p[2], p[1] + p[5] * G.off * p[2]]); }
      pencil(ctx, pts, G.w, G.c < 0.7 ? '#eef1e4' : '#5a6772', (G.c < 0.7 ? 0.75 : 0.4) * fade, RNG(i * 7 + Math.floor(t12 * 12)), { gap: 0.05, per: 3, taper: 0.8 });
    }
  }

  window.FX = { setClock: v => { clockT = v; }, cloud, drawVapor, drawBeams, drawRain, rainAmt, drawSplashes, drawRipples, drawFirstDrop, drawSand, initFalls, drawFalls, initFlora, drawDryPlant, drawFlora, drawVines, drawGroundDetail, noiseA, NT, drawRainVeil, initTrees, drawTrees, drawFarTrees, drawPetals, drawTumbleweed, drawStreamFlow };
})();
