/* 静态背景美术：天空（三种天气）、远近沙丘（干/湿）、前景绿意、塔影、彩虹 */
(function () {
  'use strict';
  const { TAU, clamp, lerp, seg, smooth, RNG, noise1, noise2, fbm1, fbm2, mix, rgba, vary, ramp, canvas, spline, tracePoly, blobPts, blob, soft, ribbon, pencil, dab, scumble, applyGrain } = window.L;

  const WORLD = {
    W: 2560, X0: -160, X1: 2720, SKY_Y0: -420, HORIZON: 1180, BOTTOM: 1800,
    SUN: { x: 2210, y: 440 },
    TOWER: { x: 1560, hubY: 720, domeY: 575, baseY: 1460 },
    FOX_HOME: 1168, PLANT_X: 1262, CREST_X: 868
  };
  const ridged = (x, f, s) => Math.pow(1 - Math.abs(2 * noise1(x * f + s) - 1), 1.35);

  // ---------- 地形剖面 ----------
  const P0 = x => 1182 - 34 * ridged(x, 1 / 540, 3.1) - 12 * fbm1(x / 170 + 4, 3);
  const P1 = x => 1218 - 58 * ridged(x, 1 / 660, 11.4) - 12 * fbm1(x / 210 + 9, 3);
  const P2 = x => 1268 - 74 * ridged(x, 1 / 780, 23.7) - 10 * fbm1(x / 240 + 2, 3);
  const PM = x => 1330 - 46 * ridged(x, 1 / 980, 37.2) - 8 * fbm1(x / 200 + 31, 3) + 22 * Math.exp(-Math.pow((x - 1560) / 420, 2));
  const fPts = spline([[-260, 1496], [-60, 1486], [200, 1468], [470, 1424], [690, 1366], [800, 1340], [868, 1331], [940, 1341], [1040, 1378], [1140, 1420], [1250, 1447], [1400, 1461], [1560, 1454], [1700, 1424], [1850, 1394], [2050, 1379], [2300, 1399], [2560, 1432], [2800, 1452]], 14);
  function PF(x) {
    let lo = 0, hi = fPts.length - 1;
    if (x <= fPts[0][0]) return fPts[0][1]; if (x >= fPts[hi][0]) return fPts[hi][1];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fPts[m][0] <= x) lo = m; else hi = m; }
    const a = fPts[lo], b = fPts[hi];
    return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0] || 1)) + (fbm1(x / 60 + 5, 2) - 0.5) * 5;
  }
  WORLD.PF = PF; WORLD.PM = PM; WORLD.P2 = P2;
  WORLD.groundY = x => PF(x) + 7 + 32 * smooth(950, 1110, x) * (1 - smooth(1500, 1600, x));   // 塔影里的洼地更靠近镜头

  // ---------- 天空 ----------
  const SKY = {
    dry: { stops: [[0, '#4a9ac6'], [0.28, '#82bfd2'], [0.55, '#c2dcc8'], [0.8, '#f4e4b2'], [1, '#fbe3a8']], warm: '#fdf1c8', wk: 0.8 },
    over: { stops: [[0, '#646a88'], [0.3, '#7b809c'], [0.52, '#9c9eb0'], [0.75, '#c0bdc0'], [1, '#e0d6c0']], warm: '#e6dcc4', wk: 0.45 },
    clear: { stops: [[0, '#3a8ed2'], [0.3, '#5fabe2'], [0.6, '#98cfee'], [0.84, '#d4ecde'], [1, '#f7f1cc']], warm: '#fdf4d2', wk: 0.55 }
  };
  function paintCumulus(g, x, y, w, rng, lit, sh, deep) {          // 天边手绘小积云
    const n = 7 + ((rng() * 6) | 0), lobes = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), env = Math.pow(Math.sin(Math.PI * (u * 0.92 + 0.04)), 0.7);
      lobes.push([x + (u - 0.5) * w + rng.g() * w * 0.05, y - env * w * rng.r(0.1, 0.24), w * rng.r(0.09, 0.19) * (0.5 + env)]);
    }
    soft(g, 10, rgba(deep, 0.75), c => { c.beginPath(); for (const l of lobes) { const p = blobPts(l[0] - l[2] * 0.1, l[1] + l[2] * 0.45, l[2] * 1.15, l[2] * 0.62, 0, 0.12, rng); c.moveTo(p[0][0], p[0][1]); for (const q of p) c.lineTo(q[0], q[1]); c.closePath(); } });
    for (const l of lobes) { g.fillStyle = rgba(vary(sh, rng, 7), 0.92); blob(g, l[0], l[1], l[2], l[2] * 0.86, rng() * 3, 0.14, rng); g.fill(); }
    for (const l of lobes) { g.fillStyle = rgba(vary(lit, rng, 5, 3), 0.95); blob(g, l[0] + l[2] * 0.2, l[1] - l[2] * 0.22, l[2] * 0.72, l[2] * 0.6, rng() * 3, 0.16, rng); g.fill(); }
    for (const l of lobes) if (rng() < 0.6) { g.fillStyle = rgba(mix(lit, '#fdf6e0', 0.6), 0.8); blob(g, l[0] + l[2] * 0.36, l[1] - l[2] * 0.4, l[2] * 0.34, l[2] * 0.26, rng() * 3, 0.2, rng); g.fill(); }
  }
  function paintSky(kind, grain) {
    const K = SKY[kind], S = 0.5, WW = 2880, HH = 1720;
    const [c, g] = canvas(WW * S, HH * S); g.scale(S, S); g.translate(160, 420);
    const rng = RNG(kind === 'dry' ? 101 : kind === 'over' ? 202 : 303), SUN = WORLD.SUN;
    const colorAt = (x, y, r) => {
      const t = (y + 420) / 1620 + (fbm2(x / 760 + 3, y / 300, 3) - 0.5) * 0.2;
      let col = ramp(K.stops, t);
      const d = Math.hypot(x - SUN.x, (y - SUN.y) * 1.25);
      col = mix(col, K.warm, Math.exp(-d / 520) * K.wk);
      return vary(col, r, 5, 3);
    };
    g.fillStyle = rgba(ramp(K.stops, 0.5)); g.fillRect(-160, -420, WW, HH);
    scumble(g, -260, -460, 2820, 1330, 620, { len: 620, w: 170, ang: -0.03, aj: 0.07, alpha: 0.6 }, colorAt, rng);
    scumble(g, -260, -460, 2820, 1330, 1300, { len: 300, w: 64, ang: -0.03, aj: 0.12, alpha: 0.4 }, colorAt, rng);
    scumble(g, -260, -460, 2820, 1330, 1700, { len: 120, w: 24, ang: -0.02, aj: 0.3, alpha: 0.22 }, colorAt, rng);
    if (kind === 'dry') {
      for (let i = 0; i < 16; i++) {                                 // 高空的薄卷云
        const x = rng.r(-100, 2600), y = rng.r(-300, 620), l = rng.r(260, 700);
        dab(g, x, y, x + l, y - l * rng.r(0.02, 0.12), rng.r(8, 26), '#f1e6c8', rng.r(0.1, 0.22), rng, rng.g() * 0.06);
      }
      for (let i = 0; i < 9; i++) soft(g, 30, rgba('#f6e3b4', 0.22), cc => blob(cc, rng.r(-100, 2700), rng.r(1020, 1200), rng.r(240, 520), rng.r(26, 60), 0, 0.2, rng));   // 地平线的热尘
    }
    if (kind === 'over') {
      for (let i = 0; i < 26; i++) soft(g, 40, rgba(rng() < 0.5 ? '#565b76' : '#a3a1a8', 0.22), cc => blob(cc, rng.r(-100, 2700), rng.r(-380, 1100), rng.r(200, 520), rng.r(60, 150), rng.g() * 0.2, 0.25, rng));
    }
    if (kind === 'clear') {
      const cl = [[-40, 1118, 420], [330, 1085, 250], [640, 1128, 190], [2380, 1096, 380], [2020, 1132, 210], [1140, 1140, 150], [2660, 1010, 260], [90, 900, 230]];
      for (const k of cl) paintCumulus(g, k[0], k[1], k[2], rng, '#fbf6e8', '#c3d2e6', '#9db4d6');
      for (let i = 0; i < 10; i++) { const x = rng.r(-100, 2600), y = rng.r(-340, 500), l = rng.r(200, 520); dab(g, x, y, x + l, y - l * 0.05, rng.r(8, 20), '#eef1e4', rng.r(0.12, 0.25), rng, rng.g() * 0.05); }
    }
    if (kind !== 'over') {                                         // 太阳：几层不规则的暖色晕染
      soft(g, 90, rgba(K.warm, 0.5), cc => blob(cc, SUN.x, SUN.y, 250, 230, 0, 0.1, rng));
      soft(g, 40, rgba('#fbf0cd', 0.7), cc => blob(cc, SUN.x, SUN.y, 110, 104, 0, 0.1, rng));
      g.fillStyle = rgba('#fcf4d8', 0.96); blob(g, SUN.x, SUN.y, 50, 48, rng() * 3, 0.035, rng, 16); g.fill();
      g.fillStyle = rgba('#fdf7e2', 0.8); blob(g, SUN.x + 3, SUN.y - 2, 40, 37, rng() * 3, 0.05, rng, 14); g.fill();
    }
    applyGrain(g, c.width, c.height, grain, 0.5);
    return c;
  }

  // ---------- 沙丘层 ----------
  const PAL = {
    dry: [
      { lit: '#edcda8', mid: '#e3bb98', shade: '#c7a39f', deep: '#e6c097', rip: '#b98f86' },
      { lit: '#ebbd8a', mid: '#dfa878', shade: '#b78a86', deep: '#e0ab76', rip: '#a6766c' },
      { lit: '#e7aa6a', mid: '#d99558', shade: '#a36c68', deep: '#dd9a58', rip: '#94584e' },
      { lit: '#e39c57', mid: '#d5844a', shade: '#8f5650', deep: '#d88846', rip: '#84483c' },
      { lit: '#e49650', mid: '#d47c42', shade: '#77454a', deep: '#c66a36', rip: '#723a34' }
    ],
    wet: [
      { lit: '#d6ccaa', mid: '#c2ba9a', shade: '#9ea2ae', deep: '#b6c294', rip: '#8e8a8c' },
      { lit: '#c8ae84', mid: '#b49a74', shade: '#8c8288', deep: '#a6ac72', rip: '#7a6e6e' },
      { lit: '#ba8e5c', mid: '#a47a50', shade: '#786462', deep: '#929050', rip: '#665250' },
      { lit: '#ba8650', mid: '#a06e44', shade: '#70504e', deep: '#8e7c44', rip: '#5a3c38' },
      { lit: '#bf804c', mid: '#a2673c', shade: '#664442', deep: '#8c5832', rip: '#523230' }
    ]
  };
  function crestsOf(prof, x0, x1, minProm) {
    const out = []; let prev = prof(x0), up = false;
    for (let x = x0 + 16; x < x1; x += 16) {
      const y = prof(x);
      if (y < prev) up = true;
      else if (up && y > prev) {
        const xc = x - 16, yc = prev;
        const prom = Math.min(prof(xc - 150), prof(xc + 150)) - yc;
        if (prom > minProm) out.push([xc, yc, prom]);
        up = false;
      }
      prev = y;
    }
    return out;
  }
  function duneLayer(g, prof, yBot, pal, o, seed, wet) {
    const rng = RNG(seed), rc = RNG(seed + 7);
    const sil = []; for (let x = -200; x <= 2760; x += 10) sil.push([x, prof(x)]);
    sil.push([2760, yBot], [-200, yBot]);
    g.save(); tracePoly(g, sil); g.clip();
    g.fillStyle = rgba(pal.mid); g.fillRect(-200, 1000, 3000, 900);
    const span = yBot - (o.top || 1200);
    const colorAt = (x, y, r) => {
      const sl = prof(x + 24) - prof(x - 24);
      const depth = clamp((y - prof(x)) / span);
      let k = clamp(0.56 + sl / (o.slopeK || 46) - depth * 0.25 + (fbm2(x / 150, y / 60 + seed, 3) - 0.5) * 0.6);
      let col = k < 0.5 ? mix(pal.shade, pal.mid, k * 2) : mix(pal.mid, pal.lit, (k - 0.5) * 2);
      col = mix(col, pal.deep, depth * (o.deepK == null ? 0.6 : o.deepK));
      return vary(col, r, wet ? 5 : 7, 4);
    };
    const ang = (x) => Math.atan2(prof(x + 30) - prof(x - 30), 60) * 0.8;
    const dens = o.dens || 1;
    scumble(g, -200, o.top || 1150, 2760, yBot, 420 * dens, { len: 260, w: 46, ang, aj: 0.1, alpha: 0.7 }, colorAt, rng);
    scumble(g, -200, o.top || 1150, 2760, yBot, 900 * dens, { len: 120, w: 20, ang, aj: 0.16, alpha: 0.5 }, colorAt, rng);
    scumble(g, -200, o.top || 1150, 2760, yBot, 1300 * dens, { len: 54, w: 8, ang, aj: 0.25, alpha: 0.35 }, colorAt, rng);

    // 背光的滑落面：沙脊线呈 S 形，一侧是冷紫色的影子
    const crests = (o.crests || crestsOf(prof, -100, 2700, o.prom || 14));
    for (const cr of crests) {
      const xc = cr[0], yc = cr[1], r2 = RNG(seed * 31 + (xc | 0));
      const wl = cr[3] || (o.wl || 170) * r2.r(0.7, 1.3), drop = cr[4] || Math.min(yBot - yc - 6, (o.drop || 70) * r2.r(0.7, 1.4));
      const footX = cr[5] == null ? xc - wl * r2.r(0.25, 0.55) : cr[5];
      const top = []; for (let x = xc; x >= xc - wl; x -= 12) top.push([x, prof(x) - 3]);
      const lower = spline([[xc - wl, prof(xc - wl) - 2], [xc - wl * 0.78, yc + drop * 0.62], [(xc - wl * 0.5 + footX) / 2, yc + drop * 0.96], [footX, yc + drop]], 8);
      const ridge = spline([[footX, yc + drop], [lerp(footX, xc, 0.3) - wl * 0.06, yc + drop * 0.62], [lerp(footX, xc, 0.72) + wl * 0.05, yc + drop * 0.26], [xc, yc - 2]], 10);
      const poly = top.concat(lower, ridge);
      g.save(); tracePoly(g, poly); g.clip();
      g.fillStyle = rgba(pal.shade, o.shadeA || 0.9); g.fillRect(xc - wl - 30, yc - 40, wl + 90, drop + 80);
      const shadeAt = (x, y, r) => vary(mix(pal.shade, pal.rip, clamp((y - yc) / drop * 0.5 + (fbm2(x / 90, y / 40, 2) - 0.5))), r, 6, 5);
      scumble(g, xc - wl, yc - 20, xc + 30, yc + drop, Math.round(wl * drop / 520) + 6, { len: 80, w: 14, ang: 0.5, aj: 0.3, alpha: 0.5 * (o.shadeA || 0.9) }, shadeAt, r2);
      // 影子底部向亮部晕开
      soft(g, 26, rgba(pal.mid, 0.75), c => blob(c, (xc - wl * 0.7 + footX) / 2, yc + drop * 1.04, wl * 0.5, drop * 0.22, 0.1, 0.2, r2));
      g.restore();
      pencil(g, ridge.filter((_, i) => i % 3 === 0), o.ridgeW || 2.6, mix(pal.lit, '#fbeccb', wet ? 0.15 : 0.5), 0.75, r2, { gap: 0.12, per: 4 });
    }
    // 风纹：成对的明暗细线，随坡度弯曲
    const nr = Math.round((o.ripples || 240) * (wet ? 0.45 : 1));
    for (let i = 0; i < nr; i++) {
      const x = rc.r(-150, 2700), y0 = prof(x), y = y0 + 6 + Math.pow(rc(), 1.4) * (yBot - y0 - 8);
      const near = clamp((y - (o.top || 1200)) / span);
      const len = rc.r(30, 90) * (0.6 + near * 1.6), a = ang(x) * 0.7 + rc.g() * 0.08, bow = rc.g() * 5 * (0.5 + near);
      const pts = [];
      for (let k = 0; k <= 4; k++) { const u = k / 4 - 0.5; pts.push([x + Math.cos(a) * len * u, y + Math.sin(a) * len * u + Math.sin(u * Math.PI * 1.6 + i) * bow]); }
      const dark = rc() < 0.62;
      pencil(g, pts, (o.rippleW || 1.6) * (0.5 + near * 1.3), dark ? pal.rip : mix(pal.lit, '#f7e3bd', 0.35), dark ? rc.r(0.14, 0.34) : rc.r(0.15, 0.4), rc, { gap: 0.14, per: 4 });
    }
    // 轮廓：断续的受光亮线
    const rim = []; for (let x = -180; x <= 2740; x += 34) rim.push([x, prof(x) + 1.5]);
    pencil(g, rim, o.ridgeW || 2.2, mix(pal.lit, '#fbeccb', wet ? 0.1 : 0.4), 0.55, rc, { gap: 0.3, per: 4, freq: 60 });
    g.restore();
    return crests;
  }

  // 小溪：从塔右侧引水管入沙处涌出，沿洼地流向画面左下
  const STREAM_PTS = spline([[1852, 1438], [1822, 1462], [1760, 1474], [1716, 1506], [1640, 1512], [1578, 1542], [1492, 1538], [1420, 1556], [1338, 1548], [1270, 1572], [1196, 1576], [1128, 1612], [1040, 1622], [972, 1668], [880, 1690], [812, 1744], [720, 1770], [660, 1816]], 10);
  const STREAM_LEN = (function () { const a = [0]; for (let i = 1; i < STREAM_PTS.length; i++) a.push(a[i - 1] + Math.hypot(STREAM_PTS[i][0] - STREAM_PTS[i - 1][0], STREAM_PTS[i][1] - STREAM_PTS[i - 1][1])); return a; })();
  // s: 0..1（按弧长）。返回 [x, y, 半宽, s, 法线x, 法线y(已按地面透视压扁)]
  function streamAt(sv) {
    const L = STREAM_LEN, tot = L[L.length - 1], d = clamp(sv) * tot; let i = 1; while (i < L.length - 1 && L[i] < d) i++;
    const u = (d - L[i - 1]) / (L[i] - L[i - 1] || 1), a = STREAM_PTS[i - 1], b = STREAM_PTS[i], x = lerp(a[0], b[0], u), y = lerp(a[1], b[1], u);
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const hw = (4 + 22 * Math.pow(sv, 0.9)) * (1 + 1.2 * Math.exp(-Math.pow((sv - 0.42) / 0.05, 2)) + 0.7 * Math.exp(-Math.pow((sv - 0.74) / 0.04, 2))) * (0.55 + 0.9 * noise1(sv * 19 + 3));
    return [x, y, hw, sv, -ty, tx * 0.42];
  }
  WORLD.streamAt = streamAt; WORLD.STREAM_T0 = 57.6; WORLD.STREAM_DUR = 5.4;
  const PUDDLES = [[1168, 1500, 62, 6.5], [985, 1560, 56, 6], [2060, 1560, 104, 10], [1905, 1668, 132, 13], [455, 1590, 76, 7.5], [2330, 1640, 90, 9], [1500, 1700, 120, 12]];
  WORLD.PUDDLES = PUDDLES;

  function paintBack(kind, grain) {                                  // 世界 y: 1060..1560
    const wet = kind === 'wet', pal = PAL[kind];
    const [c, g] = canvas(2880, 500); g.translate(160, -1060);
    duneLayer(g, P0, 1300, pal[0], { top: 1150, prom: 8, wl: 260, drop: 22, shadeA: 0.45, ripples: 40, rippleW: 0.9, ridgeW: 1.4, dens: 0.35, deepK: 0.2, slopeK: 30 }, 11, wet);
    if (!wet) soft(g, 22, rgba('#f1dcb4', 0.3), cc => { cc.beginPath(); cc.rect(-200, 1190, 3000, 30); });   // 远处的热尘
    duneLayer(g, P1, 1360, pal[1], { top: 1170, prom: 10, wl: 320, drop: 34, shadeA: 0.55, ripples: 70, rippleW: 1.1, ridgeW: 1.8, dens: 0.5, deepK: 0.3, slopeK: 36 }, 22, wet);
    duneLayer(g, P2, 1440, pal[2], { top: 1200, prom: 12, wl: 380, drop: 50, shadeA: 0.68, ripples: 120, rippleW: 1.3, ridgeW: 2.2, dens: 0.7, deepK: 0.4 }, 33, wet);
    duneLayer(g, PM, 1560, pal[3], { top: 1280, prom: 10, wl: 440, drop: 74, shadeA: 0.8, ripples: 200, rippleW: 1.6, ridgeW: 2.6, dens: 1, deepK: 0.5 }, 44, wet);
    if (wet) {                                                       // 远处返青：低洼处泛起灰绿
      const rg = RNG(909);
      const layers = [[P0, 1210, '#bcd89c', 0.42, 44], [P1, 1262, '#a8d080', 0.52, 66], [P2, 1330, '#94c666', 0.6, 96], [PM, 1420, '#82ba54', 0.66, 150]];
      layers.forEach(([prof, yb, col, al, n], li) => {
        for (let i = 0; i < n; i++) {
          const x = rg.r(-150, 2700), y0 = prof(x), sl = Math.abs(prof(x + 40) - prof(x - 40));
          if (sl > 18 && rg() < 0.7) continue;
          const y = y0 + rg.r(6, (yb - y0) * 0.9), w = rg.r(40, 150) * (0.5 + li * 0.3);
          soft(g, 8 + li * 3, rgba(vary(col, rg, 10, 6), al * rg.r(0.5, 1)), cc => blob(cc, x, y, w, w * rg.r(0.07, 0.16), rg.g() * 0.06, 0.3, rg));
          if (li >= 2) for (let k = 0; k < 9; k++) { const gx = x + rg.g() * w * 0.8, gy = y + rg.g() * w * 0.08; dab(g, gx, gy, gx + rg.g() * 2, gy - rg.r(3, 7 + li * 2), rg.r(1, 2.2), vary(mix(col, '#4f7350', 0.4), rg, 12), 0.7, rg); }
        }
      });
    }
    applyGrain(g, c.width, c.height, grain, 0.5);
    return c;
  }
  function frontSil() {
    const s = []; for (let x = -200; x <= 2760; x += 10) s.push([x, PF(x)]);
    s.push([2760, 1810], [-200, 1810]); return s;
  }
  function paintFront(kind, grain) {                                 // 世界 y: 1290..1800
    const wet = kind === 'wet', pal = PAL[kind][4];
    const [c, g] = canvas(2880, 512); g.translate(160, -1290);
    const crests = [[868, PF(868), 0, 1100, 470, 560], [2050, PF(2050), 0, 250, 120, 1975]];
    duneLayer(g, PF, 1810, pal, { top: 1330, crests, ripples: 520, rippleW: 2.1, ridgeW: 3.2, dens: 1.5, deepK: 0.75, slopeK: 54 }, 55, wet);
    const rng = RNG(777);
    g.save(); tracePoly(g, frontSil()); g.clip();
    // 散落的小石子与硬壳
    for (let i = 0; i < 90; i++) {
      const x = rng.r(-100, 2700), y = PF(x) + 14 + Math.pow(rng(), 1.2) * 330, s = rng.r(1.6, 5.5) * (0.6 + (y - 1340) / 400);
      g.fillStyle = rgba(vary(wet ? '#4a3432' : '#8a5644', rng, 12), 0.75); blob(g, x, y, s * 1.4, s * 0.8, rng.g() * 0.4, 0.3, rng, 7); g.fill();
      g.fillStyle = rgba(wet ? '#a7998c' : '#f0c896', 0.6); blob(g, x + s * 0.3, y - s * 0.3, s * 0.6, s * 0.3, 0, 0.3, rng, 6); g.fill();
    }
    { const rs = RNG(31415), cols = wet ? ['#5e5a3a', '#6d6a42', '#4f4a36'] : ['#c9a868', '#b08a58', '#d6bb82', '#9c7650'];
      for (let cI = 0; cI < 46; cI++) {
        const cx = rs.r(-120, 2680), cy = PF(cx) + 10 + Math.pow(rs(), 1.3) * 400, n = 6 + ((rs() * 12) | 0), near = clamp((cy - 1340) / 420);
        for (let k = 0; k < n; k++) { const x = cx + rs.g() * 46 * (0.5 + near), y = cy + rs.g() * 7 * (0.5 + near), h = rs.r(3, 9) * (0.6 + near * 1.3), ln = rs.g() * 0.8; dab(g, x, y, x + ln * h, y - h, rs.r(0.8, 1.7) * (0.7 + near), vary(rs.pick(cols), rs, 8, 5), rs.r(0.5, 0.9), rs, rs.g() * 0.4); }
      } }
    if (wet) {
      for (const p of PUDDLES) {                                     // 积水：浅洼的形状顺着地面透视，边缘向湿沙渗开
        const [px, py, rx, ry] = p, r2 = RNG(px);
        const lobes = []; const nl = 3 + ((r2() * 3) | 0);
        for (let k = 0; k < nl; k++) lobes.push([px + (k - (nl - 1) / 2) * rx * 0.55 + r2.g() * rx * 0.12, py + r2.g() * ry * 0.5, rx * r2.r(0.4, 0.62), ry * r2.r(0.6, 1.05), r2.g() * 0.05]);
        const path = cc => { cc.beginPath(); for (const l of lobes) { const pp = blobPts(l[0], l[1], l[2], l[3], l[4], 0.22, RNG(l[0] | 0), 9); cc.moveTo(pp[0][0], pp[0][1]); for (const q2 of pp) cc.lineTo(q2[0], q2[1]); cc.closePath(); } };
        soft(g, 9, rgba('#3b2b2e', 0.5), cc => { cc.beginPath(); for (const l of lobes) { const pp = blobPts(l[0], l[1] + 1, l[2] * 1.2, l[3] * 1.6, l[4], 0.2, RNG(l[0] | 0), 9); cc.moveTo(pp[0][0], pp[0][1]); for (const q2 of pp) cc.lineTo(q2[0], q2[1]); cc.closePath(); } });
        soft(g, 3, rgba('#7f8288', 0.8), path);
        g.save(); path(g); g.clip();
        for (let k = 0; k < 16; k++) { const yy = py + r2.g() * ry * 0.7, xx = px + r2.g() * rx * 0.7, l = rx * r2.r(0.2, 0.7); dab(g, xx - l / 2, yy, xx + l / 2, yy + r2.g() * 0.6, r2.r(1.4, 3.6), r2() < 0.55 ? '#b3bcc0' : (r2() < 0.5 ? '#68707a' : '#9a8f86'), r2.r(0.25, 0.5), r2, 0); }
        dab(g, px - rx * 0.4, py - ry * 0.25, px + rx * 0.25, py - ry * 0.3, ry * 0.3, '#d9ded4', 0.4, r2, 0);
        g.restore();
        for (let k = 0; k < 8; k++) { const a2 = r2() * TAU, sx = px + Math.cos(a2) * rx * 0.95, sy = py + Math.sin(a2) * ry * 1.3, sz = r2.r(1.4, 3.2); g.fillStyle = rgba('#4a3432', 0.7); blob(g, sx, sy, sz * 1.4, sz * 0.7, 0, 0.3, r2, 6); g.fill(); }
      }
      // 雨水冲出的细小水痕
      for (let i = 0; i < 70; i++) {
        const x = rng.r(-100, 2700), y = PF(x) + rng.r(20, 300), l = rng.r(30, 110), sl = (PF(x + 30) - PF(x - 30)) / 60;
        pencil(g, [[x, y], [x + l * 0.3 * Math.sign(sl || 1), y + l * 0.4], [x + l * 0.5 * Math.sign(sl || 1) + rng.g() * 8, y + l]], rng.r(1.2, 3), '#3a2628', rng.r(0.15, 0.3), rng, { gap: 0.1 });
      }
    }
    g.restore();
    applyGrain(g, c.width, c.height, grain, 0.5);
    return c;
  }

  // 前景草毯（透明层）：苔藓与细草的底色，随后由生长遮罩逐渐显现
  function paintGreen(grain) {
    const [c, g] = canvas(2880, 512); g.translate(160, -1290);
    const rng = RNG(4242);
    g.save(); tracePoly(g, frontSil()); g.clip();
    const greens = ['#84b450', '#96c058', '#66a252', '#a6bc4e', '#4f9460', '#b4d068', '#78aa46'];
    const dens = (x, y) => {
      let d = 0.25 + 0.75 * Math.exp(-Math.pow((x - 1500) / 620, 2));
      for (const p of PUDDLES) d += 0.7 * Math.exp(-(Math.pow((x - p[0]) / (p[2] * 2), 2) + Math.pow((y - p[1]) / (p[3] * 5), 2)));
      d *= 0.45 + 0.9 * fbm2(x / 170 + 8, y / 60, 3);
      for (const p of PUDDLES) if (Math.pow((x - p[0]) / (p[2] * 0.98), 2) + Math.pow((y - p[1]) / (p[3] * 0.95), 2) < 1) return 0;
      return d;
    };
    for (let i = 0; i < 520; i++) {                                  // 苔藓斑块
      const x = rng.r(-150, 2700), y = PF(x) + 4 + Math.pow(rng(), 1.3) * 420;
      if (rng() > dens(x, y)) continue;
      const near = clamp((y - 1340) / 420), w = rng.r(26, 90) * (0.6 + near);
      soft(g, 5, rgba(vary(rng.pick(greens), rng, 10, 5), rng.r(0.4, 0.75)), cc => blob(cc, x, y, w, w * rng.r(0.1, 0.2), rng.g() * 0.08, 0.3, rng));
    }
    for (let i = 0; i < 5200; i++) {                                 // 细草：每一笔的斜度、长短、冷暖都不同
      const x = rng.r(-150, 2700), y = PF(x) + 3 + Math.pow(rng(), 1.25) * 440;
      if (rng() > dens(x, y) * 0.95) continue;
      const near = clamp((y - 1340) / 420), h = rng.r(5, 15) * (0.6 + near * 1.5), lean = rng.g() * 0.5 + 0.12;
      const col = vary(mix(rng.pick(greens), rng() < 0.3 ? '#b7c57e' : '#3f6b54', rng() * 0.5), rng, 10, 6);
      dab(g, x, y, x + lean * h, y - h, rng.r(1.2, 2.6) * (0.7 + near), col, rng.r(0.6, 0.95), rng, rng.g() * 0.3);
    }
    const fl = ['#f3ead2', '#ecd384', '#e5a7a2', '#9aa7d6', '#f1d9b0'];
    for (let i = 0; i < 420; i++) {                                  // 星点小花
      const x = rng.r(-150, 2700), y = PF(x) + 8 + Math.pow(rng(), 1.2) * 430;
      if (rng() > dens(x, y) * 0.8) continue;
      const near = clamp((y - 1340) / 420), s = rng.r(1.6, 3.4) * (0.7 + near), col = rng.pick(fl), np = 4 + ((rng() * 3) | 0), ph = rng() * 6;
      for (let k = 0; k < np; k++) { const a = ph + k / np * TAU + rng.g() * 0.2; g.fillStyle = rgba(vary(col, rng, 8), 0.92); blob(g, x + Math.cos(a) * s, y + Math.sin(a) * s * 0.7, s * 0.75, s * 0.5, a, 0.2, rng, 6); g.fill(); }
      g.fillStyle = rgba('#c98f3c', 0.9); blob(g, x, y, s * 0.42, s * 0.36, 0, 0.2, rng, 6); g.fill();
    }
    g.restore();
    applyGrain(g, c.width, c.height, grain, 0.35);
    return c;
  }

  function paintStream(grain) {
    const [c, g] = canvas(2880, 512); g.translate(160, -1290);
    const rng = RNG(5858), N = 150, L = [], R = [], Lb = [], Rb = [], mid = [];
    for (let i = 0; i <= N; i++) { const p = streamAt(i / N), jw = 1 + rng.g() * 0.1; mid.push(p); L.push([p[0] - p[4] * p[2] * jw, p[1] - p[5] * p[2] * jw]); R.push([p[0] + p[4] * p[2] * jw, p[1] + p[5] * p[2] * jw]); Lb.push([p[0] - p[4] * (p[2] * 1.5 + 6), p[1] - p[5] * (p[2] * 1.5 + 6) - 1]); Rb.push([p[0] + p[4] * (p[2] * 1.5 + 6), p[1] + p[5] * (p[2] * 1.5 + 6) + 2]); }
    g.save(); tracePoly(g, frontSil()); g.clip();
    const body = L.concat(R.slice().reverse()), bank = Lb.concat(Rb.slice().reverse());
    soft(g, 8, rgba('#33262a', 0.6), cc => tracePoly(cc, bank));                       // 被水浸深的岸
    soft(g, 3.5, rgba('#8fa5b0', 0.9), cc => tracePoly(cc, body));
    g.save(); tracePoly(g, body); g.clip();
    for (let i = 0; i < 520; i++) {                                                     // 顺流的笔触：近岸暗、中间映天
      const k = (rng() * (N - 3)) | 0, p = mid[k], q2 = mid[k + 3], off = rng.g() * 0.75, edge = Math.abs(off);
      const col = edge > 0.62 ? (rng() < 0.5 ? '#5a6570' : '#6a6058') : rng() < 0.5 ? '#bccdd2' : rng() < 0.6 ? '#9db3c0' : '#e6ece2';
      dab(g, p[0] + p[4] * off * p[2], p[1] + p[5] * off * p[2], q2[0] + q2[4] * off * q2[2], q2[1] + q2[5] * off * q2[2], rng.r(1.2, 3.4) * (0.6 + p[3]), col, rng.r(0.3, 0.6), rng, rng.g() * 0.08);
    }
    g.restore();
    for (let i = 0; i < 44; i++) {                                                      // 岸边与水里的卵石（三三两两）
      const p = streamAt(Math.floor(rng() * 9) / 9 + rng.g() * 0.02), sd = rng.sign(), o = rng.r(0.5, 2.2), x = p[0] + p[4] * sd * p[2] * o, y = p[1] + p[5] * sd * p[2] * o, sz = rng.r(1.6, 4.6) * (0.6 + p[3]);
      g.fillStyle = rgba(vary(rng() < 0.5 ? '#514044' : '#6a5a54', rng, 10), 0.9); blob(g, x, y, sz * 1.4, sz * 0.8, rng.g() * 0.3, 0.3, rng, 7); g.fill();
      g.fillStyle = rgba('#b9b4aa', 0.65); blob(g, x + sz * 0.3, y - sz * 0.3, sz * 0.6, sz * 0.26, 0, 0.3, rng, 6); g.fill();
    }
    pencil(g, R.filter((_, i) => i % 5 === 0), 1.4, '#eef1e4', 0.4, rng, { gap: 0.55, per: 3 });
    g.restore();
    applyGrain(g, c.width, c.height, grain, 0.4);
    return c;
  }
  // 溪水显现的时刻图：顺着水流方向推进
  function streamReveal() {
    const samples = []; for (let i = 0; i <= 80; i++) samples.push(streamAt(i / 80));
    return Reveal(360, 64, (u, v) => { const x = -160 + u * 2880, y = 1290 + v * 512; let best = 1e9, bs = 0; for (const p of samples) { const d = Math.pow(x - p[0], 2) + Math.pow((y - p[1]) * 2.2, 2); if (d < best) { best = d; bs = p[3]; } } return WORLD.STREAM_T0 + bs * WORLD.STREAM_DUR + Math.sqrt(best) * 0.006; });
  }

  // 塔影（落在前景沙丘上，向左前方拉长）
  function paintShadow() {
    const [c, g] = canvas(2880, 512); g.translate(160, -1290);
    const rng = RNG(31);
    g.save(); tracePoly(g, frontSil()); g.clip();
    const poly = spline([[1340, 1436], [1760, 1425], [1700, 1500], [1520, 1590], [1260, 1700], [1020, 1810], [400, 1810], [700, 1640], [900, 1520], [1005, 1440], [1100, 1400], [1230, 1416]], 8, true);
    soft(g, 14, rgba('#4b2f4a', 0.52), cc => tracePoly(cc, poly));
    soft(g, 46, rgba('#4b2f4a', 0.2), cc => tracePoly(cc, poly));
    // 风翼的影子：几道斜长的暗带
    const arms = [[[1250, 1480], [900, 1560], [560, 1600]], [[1300, 1600], [1150, 1720], [1060, 1800]], [[1120, 1500], [820, 1500], [640, 1470]]];
    for (const a of arms) soft(g, 12, rgba('#4b2f4a', 0.3), cc => { cc.beginPath(); const p = spline(a, 8); cc.moveTo(p[0][0], p[0][1] - 12); for (const q of p) cc.lineTo(q[0], q[1] - 14 - rng() * 4); for (let i = p.length - 1; i >= 0; i--) cc.lineTo(p[i][0], p[i][1] + 14 + rng() * 4); cc.closePath(); });
    g.restore();
    return c;
  }

  // 双彩虹：柔和、被水汽打散的色带（主虹外红内紫，副虹相反且更淡，中间是略暗的亚历山大带）
  function paintRainbow() {
    const S = 0.4, x0 = -160, y0 = -420, ww = 2880, hh = 1700;
    const [c, g] = canvas(ww * S, hh * S), id = g.createImageData(c.width, c.height), d = id.data;
    const cx = 640, cy = 1560, R1 = 1050, R2 = 1215;
    const band = [[0, [214, 120, 108]], [0.2, [226, 160, 104]], [0.4, [232, 212, 132]], [0.58, [150, 196, 150]], [0.76, [124, 170, 208]], [1, [150, 140, 200]]];
    for (let j = 0; j < c.height; j++) for (let i = 0; i < c.width; i++) {
      const x = x0 + i / S, y = y0 + j / S, r = Math.hypot(x - cx, y - cy);
      const wob = (fbm2(x / 260, y / 260, 2) - 0.5) * 10;
      let a = 0, col = null;
      const u1 = (R1 + 30 - r + wob) / 60;
      if (u1 > -0.2 && u1 < 1.2) { col = ramp(band, clamp(u1)); a = smooth(-0.2, 0.18, u1) * (1 - smooth(0.8, 1.2, u1)) * 0.62; }
      const u2 = (r - (R2 - 40) + wob) / 80;
      if (u2 > -0.2 && u2 < 1.2) { col = ramp(band, clamp(u2)); a = smooth(-0.2, 0.25, u2) * (1 - smooth(0.75, 1.2, u2)) * 0.27; }
      const idx = (j * c.width + i) * 4;
      if (!col) {
        if (r > R1 + 30 && r < R2 - 40) { d[idx] = 70; d[idx + 1] = 84; d[idx + 2] = 120; d[idx + 3] = 14; }
        else if (r < R1 - 30 && r > R1 - 260) { const k = 1 - (R1 - 30 - r) / 230; d[idx] = 250; d[idx + 1] = 244; d[idx + 2] = 226; d[idx + 3] = 30 * k * k; }
        continue;
      }
      const ang = Math.atan2(cy - y, x - cx);                         // 向两脚渐隐，被云打散
      a *= smooth(0.12, 0.5, ang) * (1 - smooth(2.2, 2.9, ang)) * (0.55 + 0.6 * fbm2(x / 330 + 4, y / 330, 3));
      a *= 0.86 + 0.28 * noise2(i * 0.7, j * 0.7);
      d[idx] = col[0]; d[idx + 1] = col[1]; d[idx + 2] = col[2]; d[idx + 3] = clamp(a * 255, 0, 255);
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  // 逐步“渗开”的显现遮罩：t0(x,y) 是每个位置被浸润的时刻
  function Reveal(w, h, t0fn) {
    const [c, g] = canvas(w, h), id = g.createImageData(w, h), t0 = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) t0[j * w + i] = t0fn(i / (w - 1), j / (h - 1));
    let last = -1;
    return {
      canvas: c,
      update(t, fade) {
        if (t === last) return; last = t;
        const d = id.data;
        for (let k = 0, n = w * h; k < n; k++) {
          let a = (t - t0[k]) / fade; a = a < 0 ? 0 : a > 1 ? 1 : a;
          d[k * 4 + 3] = a * a * (3 - 2 * a) * 255;
        }
        g.putImageData(id, 0, 0);
      }
    };
  }

  WORLD.paintStream = paintStream; WORLD.streamReveal = streamReveal; WORLD.paintSky = paintSky; WORLD.paintBack = paintBack; WORLD.paintFront = paintFront; WORLD.paintGreen = paintGreen;
  WORLD.paintShadow = paintShadow; WORLD.paintRainbow = paintRainbow; WORLD.Reveal = Reveal; WORLD.PAL = PAL;
  window.WORLD = WORLD;
})();
