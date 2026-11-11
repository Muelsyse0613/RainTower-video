/* 造雨塔：静态塔身（锈蚀版 / 雨洗版 / 微光层）+ 动态部件（齿轮、六翼帆布风车、莲花穹顶） */
(function () {
  'use strict';
  const { TAU, clamp, lerp, seg, smooth, ease, RNG, noise1, noise2, fbm2, mix, rgba, vary, ramp, canvas, spline, tracePoly, organic, blobPts, blob, soft, ribbon, pencil, dab, scumble, applyGrain } = window.L;
  const CX = 1560, OX = 1150, OY = 380, TW = 840, TH = 1180;
  const HUB = { x: CX, y: 720 }, DOME = { x: CX, y: 572 };
  const GEARS = [
    { x: 1432, y: 1150, r: 106, n: 22, seed: 5, ratio: 1 },
    { x: 1296, y: 1100, r: 47, n: 10, seed: 9, ratio: -2.2 },
    { x: 1357, y: 1259, r: 35, n: 8, seed: 14, ratio: -2.75 }
  ];
  const INK = '#2e2730';

  const MATS = {
    dry: {
      iron: ['#6d4c48', '#3d2b33', '#80452f', '#b3663b', '#d39a62'],
      dark: ['#5a4850', '#30272f', '#5c463f', '#876049', '#aa845f'],
      brass: ['#6c5640', '#45372f', '#8b6b3b', '#b48f48', '#d9be7e'],
      copper: ['#5c6862', '#38403f', '#5b7c6f', '#88a691', '#b7c9ae']
    },
    clean: {
      iron: ['#70808a', '#394350', '#6c7f88', '#9db0ac', '#d2dccb'],
      dark: ['#5e6874', '#2e3541', '#525f6b', '#7c8b90', '#aab6b0'],
      brass: ['#8b6a3a', '#594127', '#b7893d', '#ddb55b', '#f3dea0'],
      copper: ['#8b5b49', '#5d3427', '#b46947', '#d99367', '#f0c69a']
    }
  };
  const matRamp = m => [[0, m[0]], [0.1, m[1]], [0.26, m[1]], [0.5, m[2]], [0.74, m[3]], [0.88, m[4]], [1, m[3]]];
  const RUST = ['#8c4028', '#a65432', '#6b2f22', '#b8693a', '#9a4a2c'];

  function paintTower(kind, grain) {
    const dry = kind === 'dry', M = MATS[kind];
    const [c, g] = canvas(TW, TH); g.translate(-OX, -OY);
    const info = { glowSpots: [], seams: [], ledges: [] };

    function shadeFill(poly, xl, xr, mat, seed, o) {
      o = o || {};
      const rng = RNG(seed), rd = RNG(seed + 500), R = matRamp(M[mat]);
      let y0 = 1e9, y1 = -1e9; for (const p of poly) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      g.save(); tracePoly(g, poly); g.clip();
      g.fillStyle = rgba(M[mat][2]); g.fillRect(xl - 30, y0 - 10, xr - xl + 60, y1 - y0 + 20);
      const colorAt = (x, y, r) => {
        const u = clamp((x - xl) / (xr - xl) + (noise2(x / 34 + seed, y / 90) - 0.5) * 0.16);
        let col = ramp(R, u);
        col = mix(col, M[mat][1], clamp((y - y0) / (y1 - y0) - 0.55) * 0.35 * (o.grime == null ? 1 : o.grime));
        return vary(col, r, 6, 4);
      };
      const area = (xr - xl) * (y1 - y0), ang = o.ang == null ? Math.PI / 2 : o.ang;
      scumble(g, xl, y0, xr, y1, Math.round(area / 620) + 10, { len: 90, w: 24, ang, aj: 0.1, alpha: 0.75 }, colorAt, rng);
      scumble(g, xl, y0, xr, y1, Math.round(area / 260) + 14, { len: 40, w: 9, ang, aj: 0.2, alpha: 0.5 }, colorAt, rng);
      if (dry) {                                                     // 锈斑与积尘
        const n = Math.round(area / 900 * (o.rust == null ? 1 : o.rust));
        for (let i = 0; i < n; i++) {
          const x = rd.r(xl, xr), y = rd.r(y0, y1), u = (x - xl) / (xr - xl), s = Math.pow(rd(), 2.2) * 12 + 2;
          g.fillStyle = rgba(mix(rd.pick(RUST), M[mat][1], u < 0.3 ? 0.5 : 0.05), rd.r(0.2, 0.5));
          blob(g, x, y, s * rd.r(0.5, 1.1), s * rd.r(0.8, 2.2), rd.g() * 0.3, 0.45, rd, 8); g.fill();
        }
        for (let i = 0; i < n * 0.5; i++) { const x = rd.r(xl, xr), y = rd.r(y0, y1), l = rd.r(14, 70); dab(g, x, y, x + rd.g() * 3, y + l, rd.r(2, 6), rd.pick(RUST), rd.r(0.2, 0.45), rd, 0.02); }
        for (let i = 0; i < n * 0.35; i++) { const x = rd.r(lerp(xl, xr, 0.35), xr), y = rd.r(y0, y1), s = rd.r(3, 9); g.fillStyle = rgba('#e3b98a', rd.r(0.12, 0.3)); blob(g, x, y, s * 1.6, s * 0.7, 0, 0.4, rd, 7); g.fill(); }
      } else {                                                       // 雨后的水光
        const n = Math.round(area / 2600);
        for (let i = 0; i < n; i++) { const x = rd.r(lerp(xl, xr, 0.5), xr - 4), y = rd.r(y0, y1), l = rd.r(20, 80); dab(g, x, y, x + rd.g() * 2, y + l, rd.r(1.5, 4), '#eef0dc', rd.r(0.14, 0.34), rd, 0.01); }
        for (let i = 0; i < n * 0.6; i++) { const x = rd.r(xl, xr), y = rd.r(y0, y1); dab(g, x, y, x + rd.g(), y + rd.r(10, 40), rd.r(1, 2.4), M[mat][1], rd.r(0.15, 0.3), rd, 0); }
      }
      g.restore();
      if (!o.noLine) pencil(g, poly.filter((_, i) => i % 2 === 0).concat([poly[0]]), o.lw || 2.4, INK, 0.72, rng, { gap: 0.1, per: 3, freq: 30 });
    }
    function drum(yT, yB, wT, wB, mat, seed, o) {
      o = o || {}; const r = RNG(seed + 91), b = o.bulge || 0, pts = [], n = 7;
      for (let i = 0; i <= n; i++) { const u = i / n; pts.push([CX - lerp(wT, wB, u) / 2 - Math.sin(u * Math.PI) * b + r.g() * 1.2, lerp(yT, yB, u)]); }
      for (let i = n; i >= 0; i--) { const u = i / n; pts.push([CX + lerp(wT, wB, u) / 2 + Math.sin(u * Math.PI) * b + r.g() * 1.2, lerp(yT, yB, u)]); }
      shadeFill(spline(pts, 3, true), CX - Math.max(wT, wB) / 2 - b, CX + Math.max(wT, wB) / 2 + b, mat, seed, o);
    }
    function band(y, w, h, mat, seed) {                              // 箍环：上缘受光，下缘投影
      drum(y, y + h, w, w + 2, mat, seed, { rust: 0.6, grime: 0 });
      const r = RNG(seed + 3);
      pencil(g, [[CX - w / 2 + 6, y + 2], [CX, y + 1.2], [CX + w / 2 - 6, y + 2]], 2, M[mat][4], 0.7, r, { gap: 0.25 });
      g.fillStyle = rgba(M.dark[1], 0.4); tracePoly(g, [[CX - w / 2 + 2, y + h], [CX + w / 2 - 2, y + h], [CX + w / 2 - 10, y + h + 9 + r() * 4], [CX - w / 2 + 12, y + h + 7 + r() * 4]]); g.fill();
      rivets(CX - w / 2 + 10, y + h / 2, CX + w / 2 - 10, y + h / 2, Math.round(w / 21), seed + 4);
    }
    function rivets(x0, y0, x1, y1, n, seed, o) {
      const r = RNG(seed), sz = (o && o.s) || 1;
      for (let i = 0; i < n; i++) {
        if (r() < 0.08) continue;                                    // 偶有脱落的铆钉
        const u = (i + 0.5 + r.g() * 0.18) / n, x = lerp(x0, x1, u) + r.g() * 1.2, y = lerp(y0, y1, u) + r.g() * 1.2, s = r.r(2, 3.3) * sz;
        const lit = clamp((x - (CX - 160)) / 320);
        g.fillStyle = rgba(mix(INK, M.dark[1], 0.4), 0.8); blob(g, x - 0.6, y + 0.8, s, s * 0.95, 0, 0.2, r, 6); g.fill();
        g.fillStyle = rgba(mix(M.brass[2], M.brass[4], lit), 0.85); blob(g, x + 0.5, y - 0.6, s * 0.62, s * 0.55, 0, 0.25, r, 6); g.fill();
        if (dry && r() < 0.4) dab(g, x, y + s, x + r.g() * 2, y + s + r.r(8, 44), r.r(1.4, 3.4), r.pick(RUST), r.r(0.3, 0.55), r, 0.02);
      }
    }
    function seam(pts, seed, glow) {
      const r = RNG(seed);
      pencil(g, pts, 1.9, INK, 0.6, r, { gap: 0.16 });
      pencil(g, pts.map(p => [p[0] + 1.6, p[1] + 1.4]), 1.2, M.iron[4], 0.3, r, { gap: 0.4 });
      if (glow) info.seams.push(pts);
    }
    function plate(x, y, w, h, mat, seed) {
      const r = RNG(seed), poly = organic([[x, y], [x + w, y + r.g() * 3], [x + w + r.g() * 3, y + h], [x + r.g() * 3, y + h + r.g() * 3]], 1.5, r, 3);
      shadeFill(poly, x - w * (x - (CX - 150)) / 300, x + w * 1.6, mat, seed, { lw: 1.8, rust: 1.6 });
      for (const q of [[x + 6, y + 6], [x + w - 6, y + 6], [x + w - 6, y + h - 6], [x + 6, y + h - 6]]) rivets(q[0], q[1], q[0] + 0.1, q[1], 1, seed + q[0], { s: 0.9 });
    }
    function porthole(x, y, r0, seed, amber) {
      const r = RNG(seed);
      g.fillStyle = rgba(M.dark[1], 0.9); blob(g, x - 1, y + 2, r0 * 1.42, r0 * 1.42, 0, 0.05, r, 12); g.fill();
      g.fillStyle = rgba(M.brass[2]); blob(g, x, y, r0 * 1.3, r0 * 1.3, 0, 0.05, r, 12); g.fill();
      g.fillStyle = rgba(M.brass[4], 0.8); blob(g, x + r0 * 0.3, y - r0 * 0.34, r0 * 0.9, r0 * 0.86, 0, 0.08, r, 10); g.fill();
      g.fillStyle = rgba(M.brass[2]); blob(g, x, y, r0 * 1.02, r0 * 1.02, 0, 0.05, r, 12); g.fill();
      g.fillStyle = rgba(dry ? '#2b2931' : '#27303c'); blob(g, x, y, r0 * 0.82, r0 * 0.82, 0, 0.06, r, 12); g.fill();
      g.fillStyle = rgba(dry ? '#6a5a50' : '#8fa6b0', 0.5); blob(g, x + r0 * 0.25, y - r0 * 0.3, r0 * 0.3, r0 * 0.16, -0.6, 0.2, r, 7); g.fill();
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + r() * 0.4; rivets(x + Math.cos(a) * r0 * 1.16, y + Math.sin(a) * r0 * 1.16, x + Math.cos(a) * r0 * 1.16 + 0.1, y + Math.sin(a) * r0 * 1.16, 1, seed + k, { s: 0.6 }); }
      info.glowSpots.push([x, y, r0, amber === false ? 'teal' : 'amber']);
    }
    function pipe(pts, w, mat, seed, flanges) {
      const r = RNG(seed), p = spline(pts, 8), m = M[mat];
      g.fillStyle = rgba(mix(INK, m[1], 0.35)); ribbon(g, p, () => w / 2 + 1.4);
      g.fillStyle = rgba(m[2]); ribbon(g, p.map(q => [q[0] + w * 0.08, q[1] - w * 0.05]), () => w * 0.4);
      g.fillStyle = rgba(m[3], 0.9); ribbon(g, p.map(q => [q[0] + w * 0.2, q[1] - w * 0.12]), (t) => w * 0.2 * (0.7 + 0.5 * noise1(seed + t * 9)));
      g.fillStyle = rgba(m[4], 0.6); ribbon(g, p.map(q => [q[0] + w * 0.27, q[1] - w * 0.17]), (t) => w * 0.06 * (noise1(seed + 3 + t * 14) > 0.4 ? 1 : 0.1));
      const nf = flanges == null ? Math.max(1, Math.round(p.length / 14)) : flanges;
      for (let i = 0; i < nf; i++) {
        const k = Math.round((i + 0.5 + r.g() * 0.15) / nf * (p.length - 3)) + 1, a = p[k], b = p[k + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / d, ty = (b[1] - a[1]) / d;
        const q = [[a[0] - ty * w * 0.75, a[1] + tx * w * 0.75], [a[0] + ty * w * 0.75, a[1] - tx * w * 0.75]];
        g.fillStyle = rgba(mix(INK, m[1], 0.3)); ribbon(g, q, () => w * 0.22 + 1);
        g.fillStyle = rgba(M.brass[3]); ribbon(g, q.map(z => [z[0] + 0.8, z[1] - 0.8]), () => w * 0.15);
        if (dry) dab(g, a[0], a[1] + w * 0.5, a[0] + r.g() * 3, a[1] + w * 0.5 + r.r(10, 40), 3, r.pick(RUST), 0.45, r, 0);
        else info.seams.push([[q[0][0], q[0][1]], [q[1][0], q[1][1]]]);
      }
    }
    function crack(x, y, len, a, seed, depth) {
      const r = RNG(seed), pts = [[x, y]]; let px = x, py = y, aa = a;
      const n = 4 + ((r() * 4) | 0);
      for (let i = 0; i < n; i++) { aa += r.g() * 0.6; px += Math.cos(aa) * len / n; py += Math.sin(aa) * len / n; pts.push([px, py]); if (depth > 0 && r() < 0.35) crack(px, py, len * 0.45, aa + r.sign() * r.r(0.5, 1.1), seed + i * 7 + 1, depth - 1); }
      pencil(g, pts, 1.8 + depth * 0.5, INK, 0.7, r, { gap: 0.05, raw: true, wob: 0.8 });
      if (dry) pencil(g, pts.map(p => [p[0] + 1.5, p[1] + 1]), 1.2, '#b9744a', 0.35, r, { gap: 0.3, raw: true });
    }
    function salt(x, y, w, seed) {                                   // 结晶盐霜
      if (!dry) return; const r = RNG(seed);
      for (let i = 0; i < w / 5; i++) {
        const px = x + r.g() * w * 0.5, py = y + Math.abs(r.g()) * w * 0.22, s = r.r(2, 7);
        g.fillStyle = rgba(vary(r() < 0.6 ? '#e6ebe2' : '#c9dcd8', r, 6), r.r(0.45, 0.9)); blob(g, px, py, s, s * 0.7, r() * 3, 0.45, r, 6); g.fill();
        if (r() < 0.5) dab(g, px, py, px + r.g() * 3, py + r.r(6, 26), r.r(1, 2.6), '#dfe8e0', r.r(0.25, 0.5), r, 0);
        if (r() < 0.35) { const a = r() * TAU; pencil(g, [[px, py], [px + Math.cos(a) * s * 1.6, py + Math.sin(a) * s * 1.6]], 1.2, '#f3f3e6', 0.8, r, { gap: 0, raw: true }); }
      }
    }
    function sandDrift(x, y, w, h, seed, tilt) {                     // 壁架上的积沙
      info.ledges.push([x, y, w]);
      if (!dry) return; const r = RNG(seed), pts = [[x - w / 2, y + 1]];
      for (let i = 1; i < 6; i++) { const u = i / 6; pts.push([x - w / 2 + u * w, y - h * Math.pow(Math.sin(Math.PI * clamp(u + (tilt || 0) * (0.5 - Math.abs(u - 0.5)))), 0.8) * r.r(0.8, 1.15)]); }
      pts.push([x + w / 2, y + 1]);
      const poly = spline(pts, 4).concat([[x + w / 2, y + 3], [x - w / 2, y + 3]]);
      g.fillStyle = rgba('#d98c4a'); tracePoly(g, poly); g.fill();
      g.save(); tracePoly(g, poly); g.clip();
      for (let i = 0; i < 8; i++) dab(g, x + r.g() * w * 0.3 + w * 0.1, y - r() * h, x + r.g() * w * 0.3 + w * 0.3, y - r() * h * 0.5, 4, '#edb072', 0.5, r);
      for (let i = 0; i < 5; i++) dab(g, x - w * 0.45, y - r() * h * 0.5, x - w * 0.1, y - r() * h * 0.2, 4, '#9a5a48', 0.4, r);
      g.restore();
      for (let i = 0; i < 3; i++) dab(g, x + r.g() * w * 0.35, y + 2, x + r.g() * w * 0.35, y + r.r(10, 34), r.r(2, 4), '#d98c4a', 0.45, r, 0);
    }

    // —— 1. 后方的扶壁与引水管 ——
    const finL = organic([[CX - 150, 1190], [CX - 196, 1300], [CX - 268, 1420], [CX - 300, 1540], [CX - 190, 1540], [CX - 150, 1380]], 2, RNG(41), 4);
    const finR = organic([[CX + 150, 1210], [CX + 205, 1310], [CX + 262, 1410], [CX + 290, 1540], [CX + 180, 1540], [CX + 150, 1380]], 2, RNG(42), 4);
    shadeFill(finL, CX - 320, CX - 60, 'dark', 43, { rust: 1.4 }); shadeFill(finR, CX + 100, CX + 300, 'iron', 44, { rust: 1.4 });
    rivets(CX - 176, 1262, CX - 284, 1500, 9, 45); rivets(CX + 186, 1280, CX + 270, 1500, 8, 46);
    pipe([[CX + 150, 1262], [CX + 215, 1262], [CX + 262, 1288], [CX + 286, 1350], [CX + 298, 1440], [CX + 304, 1545]], 34, 'copper', 47, 3);

    // —— 2. 基座 ——
    drum(1330, 1548, 432, 486, 'dark', 51, { rust: 1.5 });
    band(1326, 458, 22, 'iron', 52);
    for (let i = 0; i < 6; i++) { const x = CX - 190 + i * 76 + RNG(53 + i).g() * 8; seam([[x, 1352], [x + RNG(60 + i).g() * 5, 1440], [x + RNG(70 + i).g() * 6, 1545]], 80 + i); }
    rivets(CX - 208, 1372, CX + 208, 1372, 17, 54); rivets(CX - 220, 1430, CX + 220, 1430, 15, 55);
    salt(CX - 150, 1352, 90, 56); salt(CX + 60, 1350, 70, 57);

    // —— 3. 下塔身 ——
    drum(1088, 1332, 272, 348, 'iron', 61, { bulge: 4 });
    for (const y of [1150, 1215, 1280]) seam([[CX - 150 - (y - 1088) * 0.15, y + 3], [CX, y], [CX + 150 + (y - 1088) * 0.15, y + 2]], y, y === 1215);
    rivets(CX - 140, 1160, CX + 148, 1158, 14, 62); rivets(CX - 152, 1224, CX + 158, 1223, 15, 63); rivets(CX - 160, 1290, CX + 166, 1289, 15, 64);
    for (let i = 0; i < 5; i++) seam([[CX - 96 + i * 52, 1092 + (i % 2) * 60], [CX - 98 + i * 53 + RNG(i).g() * 3, 1150 + (i % 2) * 64]], 65 + i);
    plate(CX - 36, 1168, 62, 40, 'dark', 66); plate(CX + 60, 1238, 52, 34, 'brass', 67); plate(CX - 110, 1250, 44, 50, 'iron', 68);
    crack(CX + 96, 1100, 90, 1.9, 69, 2); crack(CX - 60, 1296, 60, -1.2, 70, 1);
    // 拱门
    const door = organic([[CX + 6, 1332], [CX + 4, 1262], [CX + 16, 1228], [CX + 44, 1214], [CX + 72, 1228], [CX + 84, 1262], [CX + 82, 1332]], 1.2, RNG(71), 4);
    g.fillStyle = rgba(M.brass[2]); tracePoly(g, door.map(p => [CX + 44 + (p[0] - CX - 44) * 1.2, 1332 + (p[1] - 1332) * 1.1])); g.fill();
    g.fillStyle = rgba(M.brass[4], 0.7); tracePoly(g, door.map(p => [CX + 47 + (p[0] - CX - 44) * 1.16, 1332 + (p[1] - 1332) * 1.08])); g.fill();
    g.fillStyle = rgba(dry ? '#2a2630' : '#262c38'); tracePoly(g, door); g.fill();
    pencil(g, door.filter((_, i) => i % 2 === 0), 2, INK, 0.7, RNG(72), { per: 3 });
    for (let i = 0; i < 4; i++) pencil(g, [[CX + 20 + i * 16, 1236 + Math.abs(i - 1.5) * 8], [CX + 21 + i * 16, 1330]], 2.2, M.dark[3], 0.6, RNG(73 + i), { gap: 0.15 });
    info.glowSpots.push([CX + 44, 1288, 30, 'amber']);
    // 狭窗
    for (const s of [[CX - 84, 1120, 0], [CX + 118, 1180, 1]]) {
      const pl = organic([[s[0], s[1]], [s[0] + 13, s[1] - 2], [s[0] + 14, s[1] + 44], [s[0] + 1, s[1] + 46]], 1, RNG(s[0]), 3);
      g.fillStyle = rgba(M.brass[3]); tracePoly(g, pl.map(p => [s[0] + 7 + (p[0] - s[0] - 7) * 1.5, s[1] + 22 + (p[1] - s[1] - 22) * 1.16])); g.fill();
      g.fillStyle = rgba('#2a2831'); tracePoly(g, pl); g.fill();
      info.glowSpots.push([s[0] + 7, s[1] + 22, 14, s[2] ? 'teal' : 'amber']);
    }
    // 右侧储水罐
    const tank = organic([[CX + 118, 1108], [CX + 160, 1090], [CX + 204, 1100], [CX + 222, 1150], [CX + 222, 1232], [CX + 204, 1276], [CX + 160, 1288], [CX + 120, 1272]], 2, RNG(74), 5);
    shadeFill(tank, CX + 100, CX + 226, 'copper', 75, { rust: 0.8 });
    for (const y of [1128, 1190, 1250]) { pencil(g, [[CX + 120, y + 4], [CX + 170, y + 9], [CX + 220, y + 2]], 4.4, M.brass[2], 0.9, RNG(y), { gap: 0 }); pencil(g, [[CX + 124, y + 2], [CX + 170, y + 7], [CX + 218, y]], 1.4, M.brass[4], 0.7, RNG(y + 1), { gap: 0.2 }); }
    rivets(CX + 126, 1136, CX + 216, 1134, 6, 76); rivets(CX + 126, 1198, CX + 216, 1196, 6, 77);
    // 压力表
    { const r = RNG(78), x = CX + 172, y = 1160;
      g.fillStyle = rgba(M.brass[1]); blob(g, x - 1, y + 2, 19, 19, 0, 0.05, r, 12); g.fill();
      g.fillStyle = rgba(M.brass[3]); blob(g, x, y, 17, 17, 0, 0.05, r, 12); g.fill();
      g.fillStyle = rgba(dry ? '#cdbf9c' : '#e6dfc4'); blob(g, x, y, 12.5, 12.5, 0, 0.05, r, 12); g.fill();
      for (let k = 0; k < 7; k++) { const a = Math.PI * (0.85 + k * 0.22); pencil(g, [[x + Math.cos(a) * 8, y + Math.sin(a) * 8], [x + Math.cos(a) * 11, y + Math.sin(a) * 11]], 1.2, INK, 0.7, r, { raw: true, gap: 0 }); }
      info.gauge = [x, y];
      salt(x - 30, 1100, 60, 79);
    }

    // —— 4. 机械层与齿轮支架 ——
    band(1040, 344, 50, 'brass', 81);
    seam([[CX - 168, 1066], [CX, 1064], [CX + 168, 1066]], 82, true);
    sandDrift(CX + 110, 1040, 100, 16, 83, 0.3); sandDrift(CX - 120, 1040, 70, 11, 84, -0.2);
    const strut = (a, b, w, seed) => { const r = RNG(seed), p = [a, [(a[0] + b[0]) / 2 + r.g() * 2, (a[1] + b[1]) / 2 + r.g() * 2], b];
      g.fillStyle = rgba(INK, 0.9); ribbon(g, spline(p, 5), () => w / 2 + 1.3);
      g.fillStyle = rgba(M.dark[2]); ribbon(g, spline(p, 5), () => w / 2 - 0.4);
      g.fillStyle = rgba(M.dark[4], 0.7); ribbon(g, spline(p.map(q => [q[0] + 1.2, q[1] - 1.4]), 5), t => w * 0.12 * (noise1(seed + t * 7) > 0.35 ? 1 : 0));
      rivets(a[0], a[1], b[0], b[1], Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 30)), seed + 1, { s: 0.7 }); };
    strut([CX - 150, 1052], [1296, 1100], 12, 85); strut([CX - 146, 1196], [1296, 1100], 10, 86); strut([1296, 1100], [1357, 1259], 9, 87);
    strut([CX - 152, 1300], [1357, 1259], 10, 88); strut([CX - 150, 1052], [1300, 1034], 8, 89); strut([1300, 1034], [1296, 1100], 8, 90);
    // 破损的齿轮护罩
    { const r = RNG(91), arc = []; for (let i = 0; i <= 12; i++) { const a = Math.PI * (1.02 + i / 12 * 0.62); arc.push([1432 + Math.cos(a) * 126, 1150 + Math.sin(a) * 126]); }
      g.fillStyle = rgba(INK, 0.9); ribbon(g, spline(arc, 3), t => 9 * (t < 0.08 ? t / 0.08 : 1) * (0.8 + 0.3 * noise1(t * 9)));
      g.fillStyle = rgba(M.iron[2]); ribbon(g, spline(arc, 3), t => 7 * (t < 0.1 ? t / 0.1 : 1) * (0.75 + 0.3 * noise1(t * 9)));
      g.fillStyle = rgba(M.iron[4], 0.55); ribbon(g, spline(arc.map(p => [p[0] + 1.5, p[1] - 2]), 3), t => 1.6 * (noise1(t * 14) > 0.4 ? 1 : 0.2));
      rivets(arc[1][0], arc[1][1], arc[11][0], arc[11][1] + 40, 0, 92);
      sandDrift(1350, 1052, 60, 12, 93, 0);
    }

    // —— 5. 上塔身 ——
    drum(832, 1044, 208, 252, 'iron', 101, { bulge: 3 });
    band(884, 222, 16, 'brass', 102); band(972, 240, 14, 'dark', 103);
    for (let i = 0; i < 4; i++) seam([[CX - 70 + i * 46, 836 + (i % 2) * 20], [CX - 74 + i * 48, 884]], 104 + i);
    for (let i = 0; i < 5; i++) seam([[CX - 92 + i * 46, 902], [CX - 96 + i * 48 + RNG(i + 3).g() * 3, 972]], 110 + i);
    for (let i = 0; i < 5; i++) seam([[CX - 100 + i * 50, 988], [CX - 104 + i * 52, 1040]], 116 + i);
    porthole(CX + 14, 934, 15, 121); porthole(CX + 22, 1012, 12, 122); porthole(CX + 6, 858, 10, 123, false);
    plate(CX - 86, 912, 46, 36, 'brass', 124); plate(CX + 52, 992, 40, 30, 'dark', 125);
    crack(CX - 30, 840, 70, 1.3, 126, 2); crack(CX + 70, 900, 50, 2.2, 127, 1);
    salt(CX - 60, 902, 80, 128); salt(CX + 40, 988, 60, 129); salt(CX - 20, 1092, 110, 130);
    // 梯子（缺了几档）
    { const r = RNG(131), xl = CX + 78, xr = CX + 100;
      pencil(g, [[xl - 6, 836], [xl, 940], [xl + 10, 1040]], 3, INK, 0.8, r, { gap: 0.04 }); pencil(g, [[xr - 6, 836], [xr, 940], [xr + 10, 1040]], 3, INK, 0.8, r, { gap: 0.06 });
      for (let y = 846; y < 1036; y += 15 + r.r(-2, 2)) { if (r() < 0.16) continue; const dx = (y - 836) * 0.078 - 6; pencil(g, [[xl + dx, y], [xr + dx, y + r.g() * 3]], 2.2, M.dark[3], 0.9, r, { raw: true, gap: 0 }); }
    }
    // 左侧主蒸汽管
    pipe([[CX - 128, 772], [CX - 172, 782], [CX - 186, 830], [CX - 180, 900], [CX - 176, 980], [CX - 190, 1040]], 30, 'copper', 132, 4);
    pipe([[CX + 110, 1040], [CX + 136, 1010], [CX + 138, 930], [CX + 126, 850], [CX + 118, 806]], 15, 'brass', 133, 3);

    // —— 6. 回廊平台 ——
    { const r = RNG(141);
      for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) strut([CX + sx * (104 + i * 6), 890 - i * 20], [CX + sx * (186 - i * 30), 836], 9, 142 + i + sx);
      drum(802, 834, 392, 380, 'dark', 143, { rust: 1.3 });
      pencil(g, [[CX - 190, 805], [CX, 803], [CX + 190, 805]], 2.4, M.dark[4], 0.8, r, { gap: 0.2 });
      rivets(CX - 186, 820, CX + 186, 820, 20, 144, { s: 0.8 });
      // 栏杆：歪斜、缺损
      const top = []; for (let x = -192; x <= 192; x += 32) top.push([CX + x, 766 + r.g() * 2.5 + (Math.abs(x) > 150 ? 3 : 0)]);
      pencil(g, top.slice(0, 5), 3, INK, 0.85, r, { gap: 0.03 }); pencil(g, top.slice(7), 3, INK, 0.85, r, { gap: 0.03 });
      pencil(g, top.slice(0, 5).map(p => [p[0], p[1] - 1.6]), 1.2, M.dark[4], 0.6, r, { gap: 0.3 });
      for (let i = 0; i < 16; i++) { if (i === 8 || i === 9) continue; const x = CX - 190 + i * 25.3 + r.g() * 2, lean = (i === 7 ? 9 : r.g() * 2); pencil(g, [[x + lean, 766 + r.g() * 2], [x, 803]], 2.2, INK, 0.8, r, { raw: true, gap: 0 }); }
      pencil(g, [[CX + 12, 772], [CX + 30, 790], [CX + 24, 802]], 2.4, INK, 0.8, r, {});       // 折断垂下的一截
      sandDrift(CX - 130, 802, 90, 13, 145, 0.2); sandDrift(CX + 150, 802, 60, 9, 146, -0.3);
      salt(CX - 100, 836, 70, 147);
    }

    // —— 7. 机舱（风车轴承所在）——
    const head = organic([[CX - 150, 802], [CX - 162, 746], [CX - 148, 688], [CX - 104, 650], [CX - 40, 636], [CX + 40, 636], [CX + 104, 650], [CX + 148, 688], [CX + 162, 746], [CX + 150, 802]], 2, RNG(151), 5);
    shadeFill(head, CX - 166, CX + 166, 'copper', 152, { rust: 0.9 });
    for (const a of [-0.95, -0.5, 0, 0.5, 0.95]) seam([[CX + Math.sin(a) * 40, 640], [CX + Math.sin(a) * 120, 700], [CX + Math.sin(a) * 162, 800]], 153 + a * 10);
    seam([[CX - 150, 700], [CX, 692], [CX + 150, 700]], 158, true);
    rivets(CX - 150, 708, CX + 150, 708, 16, 159); rivets(CX - 158, 790, CX + 158, 790, 17, 160);
    porthole(CX - 108, 748, 17, 161); porthole(CX + 110, 746, 16, 162);
    // 轴承座
    { const r = RNG(163);
      g.fillStyle = rgba(INK, 0.85); blob(g, HUB.x - 3, HUB.y + 4, 82, 82, 0, 0.025, r, 18); g.fill();
      g.fillStyle = rgba(M.brass[2]); blob(g, HUB.x, HUB.y, 78, 78, 0, 0.025, r, 18); g.fill();
      g.fillStyle = rgba(M.brass[3], 0.9); blob(g, HUB.x + 10, HUB.y - 12, 62, 60, 0, 0.04, r, 16); g.fill();
      g.fillStyle = rgba(M.brass[1]); blob(g, HUB.x, HUB.y, 58, 58, 0, 0.03, r, 16); g.fill();
      g.fillStyle = rgba(M.dark[1]); blob(g, HUB.x, HUB.y, 50, 50, 0, 0.03, r, 16); g.fill();
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + 0.2; rivets(HUB.x + Math.cos(a) * 68, HUB.y + Math.sin(a) * 68, HUB.x + Math.cos(a) * 68 + 0.1, HUB.y + Math.sin(a) * 68, 1, 164 + k, { s: 1.2 }); }
      info.glowSpots.push([HUB.x, HUB.y, 30, 'teal']);
      crack(CX + 60, 660, 60, 0.9, 175, 1); salt(CX - 60, 650, 90, 176); salt(CX + 110, 690, 50, 177);
    }

    // —— 8. 颈部与穹顶底座 ——
    drum(596, 642, 104, 128, 'brass', 181);
    for (let i = 0; i < 4; i++) { const y = 604 + i * 10; pencil(g, [[CX - 52 - i * 2.5, y], [CX, y - 1.5], [CX + 52 + i * 2.5, y]], 2, INK, 0.5, RNG(182 + i), { gap: 0.1 }); pencil(g, [[CX - 50 - i * 2.5, y + 2.4], [CX, y + 1], [CX + 50 + i * 2.5, y + 2.4]], 1.3, M.brass[4], 0.5, RNG(186 + i), { gap: 0.3 }); }
    info.seams.push([[CX - 54, 614], [CX, 612], [CX + 54, 614]]);
    pipe([[CX - 46, 640], [CX - 80, 630], [CX - 92, 600], [CX - 76, 580]], 11, 'copper', 190, 1); pipe([[CX + 46, 640], [CX + 84, 628], [CX + 94, 598], [CX + 78, 580]], 11, 'copper', 191, 1);
    // 喷口（闭合时被花瓣遮住）
    { const noz = organic([[CX - 34, 574], [CX - 22, 520], [CX - 30, 498], [CX + 30, 498], [CX + 22, 520], [CX + 34, 574]], 1.2, RNG(192), 4);
      shadeFill(noz, CX - 36, CX + 36, 'brass', 193, { rust: 0.4 });
      g.fillStyle = rgba('#2a2730'); blob(g, CX, 500, 27, 6, 0, 0.08, RNG(194), 10); g.fill();
      info.glowSpots.push([CX, 500, 24, 'amber']);
    }
    drum(566, 598, 176, 168, 'brass', 195, { rust: 0.6 });
    pencil(g, [[CX - 86, 569], [CX, 567], [CX + 86, 569]], 2.2, M.brass[4], 0.8, RNG(196), { gap: 0.2 });
    rivets(CX - 80, 584, CX + 80, 584, 12, 197);
    sandDrift(CX - 60, 566, 50, 8, 198, 0); salt(CX + 30, 598, 60, 199);

    // 接地处的暗部（塔埋在沙里）
    soft(g, 26, rgba(M.dark[1], 0.4), cc => { cc.beginPath(); cc.rect(CX - 300, 1470, 620, 90); });
    applyGrain(g, c.width, c.height, grain, 0.5);
    return { canvas: c, info };
  }

  // 微光层：舷窗与核心的琥珀色、接缝与管道的青蓝色
  function paintGlow(info) {
    const [c, g] = canvas(TW, TH); g.translate(-OX, -OY);
    const r = RNG(555), AM = '#ffc56e', AM2 = '#f3a04a', TE = '#7fd6cc', TE2 = '#5fb5c2';
    for (const s of info.glowSpots) {
      const col = s[3] === 'amber' ? AM : TE, col2 = s[3] === 'amber' ? AM2 : TE2;
      soft(g, s[2] * 1.6, rgba(col2, 0.5), cc => blob(cc, s[0], s[1], s[2] * 1.5, s[2] * 1.5, 0, 0.15, r));
      soft(g, s[2] * 0.5, rgba(col, 0.85), cc => blob(cc, s[0], s[1], s[2] * 0.7, s[2] * 0.7, 0, 0.1, r));
      soft(g, Math.max(3, s[2] * 0.22), rgba(mix(col, '#fdf2d2', 0.55), 0.85), cc => blob(cc, s[0], s[1], s[2] * 0.4, s[2] * 0.4, 0, 0.12, r, 10));
    }
    for (const pts of info.seams) {
      const p = spline(pts, 6);
      const s0 = r() * 50, env = t => Math.sin(Math.PI * clamp(t * 0.9 + 0.05));
      g.save(); g.shadowColor = rgba(TE2, 0.7); g.shadowBlur = 8;
      g.fillStyle = rgba(TE, 0.6); ribbon(g, p, t => 1.2 * env(t) * (noise1(s0 + t * 7) > 0.4 ? 1 : 0.15));
      g.restore();
      g.fillStyle = rgba('#dff3e6', 0.6); ribbon(g, p, t => 0.5 * env(t) * (noise1(s0 + t * 7) > 0.5 ? 1 : 0));
    }
    return c;
  }

  // ---------- 齿轮 ----------
  function makeGear(G, M, dry) {
    const r = G.r, S = Math.ceil(r * 2 + 20), [c, g] = canvas(S, S), rng = RNG(G.seed);
    g.translate(S / 2, S / 2);
    const outline = [];
    for (let k = 0; k < G.n; k++) {
      const a0 = k / G.n * TAU, da = TAU / G.n, chip = rng() < 0.14 ? rng.r(0.3, 0.7) : 1;
      const ro = r * (1 + rng.g() * 0.012), ri = r * 0.84, top = ri + (ro - ri) * chip;
      const P = (a, rr) => [Math.cos(a) * rr, Math.sin(a) * rr];
      outline.push(P(a0 + da * 0.02, ri), P(a0 + da * (0.16 + rng.g() * 0.02), top), P(a0 + da * 0.3, top * (chip < 1 ? 0.99 : 1.004)), P(a0 + da * (0.44 + rng.g() * 0.02), top), P(a0 + da * 0.58, ri), P(a0 + da * 0.8, ri * 0.997));
    }
    const m = M.brass;
    g.fillStyle = rgba(m[2]); tracePoly(g, outline); g.fill();
    g.save(); tracePoly(g, outline); g.clip();
    scumble(g, -r, -r, r, r, Math.round(r * r / 26), { len: r * 0.3, w: r * 0.09, ang: (x, y) => Math.atan2(y, x) + Math.PI / 2, aj: 0.25, alpha: 0.5 },
      (x, y, q) => vary(mix(m[2], Math.hypot(x, y) > r * 0.84 ? m[3] : m[1], q() * 0.55), q, 8, 4), rng);
    if (dry) for (let i = 0; i < r * 0.9; i++) { const a = rng() * TAU, d = Math.sqrt(rng()) * r, s = rng.r(2, 8); g.fillStyle = rgba(rng() < 0.6 ? rng.pick(RUST) : '#6b9a8c', rng.r(0.25, 0.55)); blob(g, Math.cos(a) * d, Math.sin(a) * d, s, s * 0.7, a, 0.4, rng, 7); g.fill(); }
    g.restore();
    const ring = (rr, w, col, al, gap) => { const p = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU; p.push([Math.cos(a) * rr * (1 + rng.g() * 0.006), Math.sin(a) * rr * (1 + rng.g() * 0.006)]); } pencil(g, p, w, col, al, rng, { gap, per: 3, freq: 22 }); };
    ring(r * 0.8, 2.4, INK, 0.6, 0.08); ring(r * 0.77, 1.4, m[4], 0.5, 0.3);
    // 轮辐间的镂空
    const ns = r > 60 ? 6 : 4;
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < ns; k++) {
      const a0 = k / ns * TAU + 0.3, da = TAU / ns * 0.34, r0 = r * 0.36, r1 = r * 0.68;
      const hole = organic([[Math.cos(a0 - da * 0.6) * r0, Math.sin(a0 - da * 0.6) * r0], [Math.cos(a0 - da) * r1, Math.sin(a0 - da) * r1], [Math.cos(a0) * r1 * 1.03, Math.sin(a0) * r1 * 1.03], [Math.cos(a0 + da) * r1, Math.sin(a0 + da) * r1], [Math.cos(a0 + da * 0.6) * r0, Math.sin(a0 + da * 0.6) * r0]], r * 0.012, rng, 5);
      g.fillStyle = '#444441'; tracePoly(g, hole); g.fill();
      g.globalCompositeOperation = 'source-over';
      pencil(g, hole.filter((_, i) => i % 2 === 0).concat([hole[0]]), 2.2, INK, 0.7, rng, { gap: 0.06, per: 3 });
      g.globalCompositeOperation = 'destination-out';
    }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = rgba(m[1]); blob(g, 0, 0, r * 0.3, r * 0.3, 0, 0.03, rng, 14); g.fill();
    g.fillStyle = rgba(m[3]); blob(g, 0, 0, r * 0.25, r * 0.25, 0, 0.04, rng, 14); g.fill();
    g.fillStyle = rgba(INK); blob(g, 0, 0, r * 0.1, r * 0.1, 0, 0.06, rng, 10); g.fill();
    for (let k = 0; k < ns; k++) { const a = k / ns * TAU; g.fillStyle = rgba(INK, 0.8); blob(g, Math.cos(a) * r * 0.19, Math.sin(a) * r * 0.19, r * 0.03 + 1, r * 0.03 + 1, 0, 0.2, rng, 6); g.fill(); }
    pencil(g, outline.concat([outline[0]]), 2, INK, 0.75, rng, { gap: 0.04, raw: true, wob: 0.6 });
    return c;
  }

  // ---------- 风车帆翼的固定“设定稿” ----------
  const ARMS = [];
  (function () {
    for (let a = 0; a < 6; a++) {
      const r = RNG(900 + a * 13), panels = []; let x = 120 + r.r(-4, 6);
      const wear = [0.25, 0.85, 0.45, 0.6, 0.2, 0.95][a];
      while (x < 380) {
        const w = Math.min(r.r(52, 88), 396 - x), torn = clamp(wear * r.r(0.4, 1.3) - 0.15), prof = [];
        for (let k = 0; k < 7; k++) prof.push(r() < torn ? r.r(0.2, 1) : r.r(0, 0.15));
        panels.push({ xa: x, xb: x + w, torn, prof, tied: r() > wear * 0.9, seed: r() * 1000, tone: r.g() * 0.08, stain: r() < 0.6 ? [r.r(0.2, 0.8), r.r(0.2, 0.9), r.r(6, 14)] : null, patch: r() < 0.4 ? [r.r(0.25, 0.7), r.r(0.25, 0.65), r.r(9, 15), r.g() * 0.3] : null });
        x += w + r.r(1, 4); if (r() < wear * 0.28) x += r.r(20, 44);        // 整幅缺失
      }
      const battens = []; for (let bx = 114; bx < 398; bx += r.r(30, 44)) battens.push([bx, r() < wear * 0.25 ? r.r(0.4, 0.7) : 1, r.g() * 2.5]);
      ARMS.push({ panels, battens, railBreak: wear > 0.8 ? r.r(0.55, 0.75) : 1, seed: a * 31 + 7, bend: r.g() * 3 });
    }
  })();
  const CLOTH = { lit: '#eee4cc', mid: '#dccfb2', sh: '#a99c94', deep: '#857a7c', line: '#6a5a55' };
  const CLOTH_WET = { lit: '#f2ecd8', mid: '#dfd6be', sh: '#a3a09e', deep: '#7f7c86', line: '#5f5a5e' };

  // theta：转角；fill：帆布受风鼓起的程度 0..1；tq：抽帧后的时间；clean：0..1 被雨洗净
  function drawRotor(ctx, theta, fill, tq, clean, windAt) {
    const C = {}; for (const k in CLOTH) C[k] = mix(CLOTH[k], CLOTH_WET[k], clean);
    const wood = mix('#6e4f40', '#5d4a44', clean), woodHi = mix('#a9805c', '#9a8672', clean), iron = mix('#5a3a32', '#46505a', clean);
    const boil = Math.floor(tq * 8);
    for (let a = 0; a < 6; a++) {
      const A = ARMS[a], ang = theta + a * TAU / 6, rng = RNG(A.seed * 97 + boil), sg = -1;
      const gx = Math.sin(ang), gy = Math.cos(ang);                         // 重力在帆翼局部坐标中的方向
      const lit = 0.5 + 0.5 * Math.cos(ang - 0.5);                          // 右上受光
      ctx.save(); ctx.translate(HUB.x, HUB.y); ctx.rotate(ang);
      // 桁架：外侧纵梁 + 横档
      const railEnd = 118 + (396 - 118) * A.railBreak;
      ctx.fillStyle = rgba(INK, 0.85); ribbon(ctx, [[112, sg * 86], [250, sg * (88 + A.bend)], [railEnd, sg * 87]], () => 2.6);
      ctx.fillStyle = rgba(woodHi, 0.9); ribbon(ctx, [[112, sg * 86 + 0.8], [250, sg * (88 + A.bend) + 0.8], [railEnd, sg * 87 + 0.8]], t => 1.2 * (noise1(A.seed + t * 8) > 0.3 ? 1 : 0.3));
      for (const b of A.battens) { if (b[0] > railEnd + 6) continue; ctx.fillStyle = rgba(INK, 0.8); ribbon(ctx, [[b[0], sg * 4], [b[0] + b[2], sg * 88 * b[1]]], () => 2.1); ctx.fillStyle = rgba(wood, 0.95); ribbon(ctx, [[b[0] + 0.6, sg * 4], [b[0] + b[2] + 0.6, sg * 88 * b[1]]], () => 1.2); }
      ctx.fillStyle = rgba(INK, 0.7); ribbon(ctx, [[60, sg * 5], [118, sg * 86]], () => 2); ribbon(ctx, [[150, sg * 6], [118, sg * 86]], () => 1.5);
      // 帆布
      for (const P of A.panels) {
        const wl = windAt + 0.35 * (noise1(tq * 2.3 + P.seed) - 0.5);
        const f = clamp(fill + (P.tied ? 0.35 : 0) + wl * 0.5 * (P.tied ? 0.4 : 1));
        let hx = gx * (1 - f) * 1.1, hy = sg * f * 1.5 + gy * (1 - f) * 1.1; const hl = Math.hypot(hx, hy) || 1; hx /= hl; hy /= hl;
        const flA = (noise1(tq * 5.1 + P.seed) - 0.5) * (0.12 + wl * 0.9) * (P.tied ? 0.3 : 1), flB = (noise1(tq * 4.3 + P.seed + 40) - 0.5) * (0.12 + wl * 0.9) * (P.tied ? 0.3 : 1);
        const rot = (x, y, r) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
        const len = 82 * (1 - P.torn * 0.35), dA = rot(hx, hy, flA), dB = rot(hx, hy, flB);
        const Ax = P.xa, Ay = sg * 6, Bx = P.xb, By = sg * 6;
        const A2 = [Ax + dA[0] * len, Ay + dA[1] * len], B2 = [Bx + dB[0] * len, By + dB[1] * len];
        const sag = (1 - f) * 12 + 4, bow = 5 + (1 - f) * 5;
        const poly = [[Ax, Ay]];
        for (let k = 1; k < 4; k++) { const u = k / 4; poly.push([lerp(Ax, A2[0], u) + bow * Math.sin(u * Math.PI) * 0.8, lerp(Ay, A2[1], u) + hx * 0]); }
        const edge = [];
        for (let k = 0; k <= 8; k++) {
          const u = k / 8, pr = P.prof[Math.min(6, Math.floor(u * 7))] * (k % 2 ? 1 : 0.55);
          const ex = lerp(A2[0], B2[0], u), ey = lerp(A2[1], B2[1], u), s2 = Math.sin(u * Math.PI) * sag - pr * len * 0.55;
          edge.push([ex + hx * s2 + (rng() - 0.5) * 1.2, ey + hy * s2 + (rng() - 0.5) * 1.2]);
        }
        for (const e of edge) poly.push(e);
        for (let k = 3; k >= 1; k--) { const u = k / 4; poly.push([lerp(Bx, B2[0], u) - bow * Math.sin(u * Math.PI) * 0.8, lerp(By, B2[1], u)]); }
        poly.push([Bx, By]);
        const base = mix(mix(C.sh, C.mid, lit), C.lit, clamp(lit * 0.7 + f * 0.25 + P.tone));
        ctx.fillStyle = rgba(base, 0.97); tracePoly(ctx, poly); ctx.fill();
        const mid = (u, v) => { const tx = lerp(Ax, Bx, u), ty = lerp(Ay, By, u), ex = lerp(A2[0], B2[0], u), ey = lerp(A2[1], B2[1], u); return [lerp(tx, ex, v), lerp(ty, ey, v)]; };
        // 褶皱暗部与鼓起的亮面
        const r2 = RNG(P.seed | 0);
        for (let k = 0; k < 3; k++) { const u = r2.r(0.12, 0.88), p0 = mid(u, 0.04), p1 = mid(u + r2.g() * 0.08 + (flA - flB) * 0.5, 0.9 - P.torn * 0.3); ctx.fillStyle = rgba(mix(C.deep, C.sh, lit), 0.2 + (1 - f) * 0.28); ribbon(ctx, [p0, [(p0[0] + p1[0]) / 2 + r2.g() * 3, (p0[1] + p1[1]) / 2], p1], t => (2.2 + (1 - f) * 4) * Math.sin(Math.PI * clamp(t * 0.9 + 0.08))); }
        if (f > 0.35) { const p0 = mid(0.2, 0.45), p1 = mid(0.8, 0.5); ctx.fillStyle = rgba(C.lit, (f - 0.3) * 0.55 * (0.4 + lit)); ribbon(ctx, [p0, mid(0.5, 0.36), p1], t => 9 * Math.sin(Math.PI * t)); }
        // 经纬纤维
        ctx.fillStyle = rgba(C.deep, 0.16);
        for (let k = 0; k < 5; k++) { const u = (k + 0.5 + r2.g() * 0.2) / 5; ribbon(ctx, [mid(u, 0.02), mid(u, 0.5), mid(u, 0.86 - P.torn * 0.4)], () => 0.45); }
        for (let k = 0; k < 3; k++) { const v = (k + 0.6) / 3.6; ribbon(ctx, [mid(0.04, v), mid(0.5, v + 0.03), mid(0.96, v)], () => 0.4); }
        if (P.stain) { const s = mid(P.stain[0], P.stain[1] * 0.7); ctx.fillStyle = rgba(mix('#a67850', '#8f8a80', clean), 0.3 * (1 - clean * 0.6)); blob(ctx, s[0], s[1], P.stain[2], P.stain[2] * 0.7, r2() * 3, 0.35, r2, 8); ctx.fill(); }
        if (P.patch && P.torn < 0.6) {
          const s = mid(P.patch[0], P.patch[1] * 0.7), w = P.patch[2], cs = Math.cos(P.patch[3]), sn = Math.sin(P.patch[3]);
          const q = [[-w, -w * 0.7], [w, -w * 0.8], [w * 1.05, w * 0.7], [-w * 0.95, w * 0.75]].map(p => [s[0] + p[0] * cs - p[1] * sn, s[1] + p[0] * sn + p[1] * cs]);
          ctx.fillStyle = rgba(mix(C.mid, '#b99a78', 0.5), 0.9); tracePoly(ctx, q); ctx.fill();
          ctx.fillStyle = rgba(C.line, 0.7); for (let e = 0; e < 4; e++) { const p = q[e], n = q[(e + 1) % 4]; for (let i = 1; i < 4; i++) { const sx = lerp(p[0], n[0], i / 4), sy = lerp(p[1], n[1], i / 4); ribbon(ctx, [[sx - 1.6, sy - 1.2], [sx + 1.6, sy + 1.2]], () => 0.6); } }
        }
        // 撕裂的口子
        if (P.torn > 0.3) for (let k = 0; k < 2; k++) { const u = r2.r(0.2, 0.8), p0 = mid(u, 0.92 - P.torn * 0.3), p1 = mid(u + r2.g() * 0.05, r2.r(0.3, 0.6)); ctx.fillStyle = rgba(C.deep, 0.55); ribbon(ctx, [p0, p1], t => 1.4 * (1 - t)); }
        // 轮廓：笔压不匀的铅笔线，逐格轻微抖动
        pencil(ctx, edge, 1.9, C.line, 0.78, rng, { gap: 0.07, raw: true, wob: 0.7 });
        pencil(ctx, poly.slice(0, 5), 1.5, C.line, 0.6, rng, { gap: 0.1, raw: true });
        pencil(ctx, poly.slice(-5), 1.5, C.line, 0.6, rng, { gap: 0.1, raw: true });
      }
      // 主桁（木梁，铁箍）
      const spar = [[30, 0], [140, A.bend * 0.3], [270, A.bend * 0.6], [402, 0]];
      ctx.fillStyle = rgba(INK, 0.92); ribbon(ctx, spline(spar, 5), t => lerp(8.4, 4.4, t));
      ctx.fillStyle = rgba(mix(wood, woodHi, lit * 0.5)); ribbon(ctx, spline(spar, 5), t => lerp(6.8, 3.2, t));
      ctx.fillStyle = rgba(woodHi, 0.5 + lit * 0.4); ribbon(ctx, spline(spar.map(p => [p[0], p[1] - 2 * Math.cos(ang) - 1]), 5), t => lerp(1.8, 0.9, t) * (noise1(A.seed + t * 13) > 0.3 ? 1 : 0.25));
      for (const cx of [64, 150 + A.bend * 4, 262, 352]) { ctx.fillStyle = rgba(iron); ribbon(ctx, [[cx, -8.5 + cx * 0.008], [cx + 1, 8.5 - cx * 0.008]], () => 3.2); ctx.fillStyle = rgba(mix(iron, '#d8b98a', 0.45), 0.8); ribbon(ctx, [[cx + 1, -6], [cx + 1.4, -1]], () => 1); }
      ctx.restore();
    }
    // 轮毂
    const rng = RNG(77), m = clean > 0.5 ? MATS.clean.brass : MATS.dry.brass;
    ctx.save(); ctx.translate(HUB.x, HUB.y);
    ctx.fillStyle = rgba(INK, 0.9); blob(ctx, -2, 3, 49, 49, 0, 0.03, rng, 16); ctx.fill();
    ctx.fillStyle = rgba(mix(MATS.dry.brass[2], MATS.clean.brass[2], clean)); blob(ctx, 0, 0, 46, 46, 0, 0.03, rng, 16); ctx.fill();
    ctx.save(); ctx.rotate(theta);
    for (let k = 0; k < 6; k++) { const a = (k + 0.5) / 6 * TAU, x = Math.cos(a) * 32, y = Math.sin(a) * 32; ctx.fillStyle = rgba(INK, 0.85); blob(ctx, x, y, 6.2, 6.2, 0, 0.1, rng, 8); ctx.fill(); ctx.fillStyle = rgba(mix(MATS.dry.brass[3], MATS.clean.brass[3], clean)); blob(ctx, x + 0.8, y - 0.8, 4.2, 4.2, 0, 0.12, rng, 8); ctx.fill(); }
    ctx.fillStyle = rgba(INK, 0.6); for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; ribbon(ctx, [[Math.cos(a) * 8, Math.sin(a) * 8], [Math.cos(a) * 21, Math.sin(a) * 21]], () => 1.2); }
    ctx.restore();
    ctx.fillStyle = rgba(mix(MATS.dry.brass[3], MATS.clean.brass[3], clean), 0.9); blob(ctx, 9, -11, 30, 27, 0.5, 0.08, rng, 12); ctx.fill();
    ctx.fillStyle = rgba(mix(MATS.dry.brass[1], MATS.clean.brass[1], clean)); blob(ctx, 0, 0, 19, 19, 0, 0.04, rng, 12); ctx.fill();
    ctx.fillStyle = rgba(mix(MATS.dry.brass[4], MATS.clean.brass[4], clean)); blob(ctx, 3, -4, 13, 12, 0, 0.06, rng, 12); ctx.fill();
    ctx.fillStyle = rgba('#fbf0d0', 0.55 + clean * 0.2); blob(ctx, 7, -8, 4.6, 3, -0.6, 0.2, rng, 7); ctx.fill();
    ctx.restore();
  }

  function drawGears(ctx, sprites, theta, clean) {
    const rng = RNG(321);
    for (let i = GEARS.length - 1; i >= 0; i--) {
      const G = GEARS[i], a = theta * G.ratio * 1.4 + G.seed;
      ctx.save(); ctx.translate(G.x, G.y);
      ctx.save(); ctx.translate(-3.5, 4.5); ctx.rotate(a); ctx.globalAlpha = 0.9;                // 齿轮的厚度
      ctx.drawImage(sprites.dark[i], -sprites.dark[i].width / 2, -sprites.dark[i].height / 2); ctx.restore();
      ctx.save(); ctx.rotate(a);
      ctx.drawImage(sprites.dry[i], -sprites.dry[i].width / 2, -sprites.dry[i].height / 2);
      if (clean > 0.01) { ctx.globalAlpha = clean; ctx.drawImage(sprites.clean[i], -sprites.clean[i].width / 2, -sprites.clean[i].height / 2); }
      ctx.restore();
      // 固定方向的受光：右上缘高光
      const hi = []; for (let k = 0; k <= 6; k++) { const an = -1.25 + k / 6 * 1.1; hi.push([Math.cos(an) * G.r * 0.92, Math.sin(an) * G.r * 0.92]); }
      pencil(ctx, hi, 3 + G.r * 0.02, mix('#e2c88e', '#f6e6b4', clean), 0.5 + clean * 0.2, rng, { gap: 0.2, per: 3 });
      // 轴帽
      ctx.fillStyle = rgba(INK, 0.9); blob(ctx, -1, 1.5, G.r * 0.13 + 3, G.r * 0.13 + 3, 0, 0.05, rng, 10); ctx.fill();
      ctx.fillStyle = rgba(mix('#a8884c', '#d6b060', clean)); blob(ctx, 0.6, -0.6, G.r * 0.1 + 2, G.r * 0.1 + 2, 0, 0.08, rng, 10); ctx.fill();
      ctx.restore();
    }
  }

  // ---------- 莲花穹顶 ----------
  const RINGS = [
    { n: 7, L: 132, W: 98, rb: 74, a0: -0.2, a1: 1.22, c0: -0.95, c1: 0.42, ph: 0.1, t0: 0, y: 0 },
    { n: 6, L: 112, W: 84, rb: 54, a0: -0.14, a1: 0.82, c0: -0.8, c1: 0.3, ph: 0.62, t0: 0.26, y: -5 },
    { n: 5, L: 94, W: 68, rb: 34, a0: -0.08, a1: 0.44, c0: -0.6, c1: 0.16, ph: 0.3, t0: 0.5, y: -10 }
  ];
  // open: 0..1 总进度；glow: 内部琥珀光；clean: 0..1
  function drawLotus(ctx, open, glow, clean, tq) {
    const petals = [], pr = RNG(4711);
    RINGS.forEach((R, ri) => {
      let p = clamp((open - R.t0) / 0.5);
      p = (Math.floor(p * 9) + ease.back(clamp((p * 9) % 1 * 1.6))) / 9; p = clamp(p, 0, 1.02);         // 棘轮般一格一格地张开
      for (let k = 0; k < R.n; k++) {
        const phi = (k + R.ph) / R.n * TAU, v = pr.g();
        petals.push({ R, ri, phi, p: clamp(p + (p > 0 && p < 1 ? v * 0.03 : 0), 0, 1.02), z: Math.cos(phi) * R.rb + (ri * 0.01), seed: ri * 50 + k, v });
      }
    });
    petals.sort((a, b) => a.z - b.z);
    const mD = MATS.dry, mC = MATS.clean, col = (k, i) => mix(mD[k][i], mC[k][i], clean);
    let glowDrawn = false;
    for (const P of petals) {
      const R = P.R, cphi = Math.cos(P.phi), sphi = Math.sin(P.phi);
      if (!glowDrawn && cphi > 0 && glow > 0.01 && open > 0.05) {                    // 花心的光夹在前后花瓣之间
        glowDrawn = true;
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        const gr = RNG(88 + Math.floor(tq * 8)), k = glow * clamp(open * 1.6) * (0.85 + 0.15 * gr());
        soft(ctx, 46, rgba('#f6a850', 0.55 * k), c => blob(c, DOME.x, DOME.y - 50, 90, 70, 0, 0.12, gr));
        soft(ctx, 20, rgba('#fbd58c', 0.75 * k), c => blob(c, DOME.x, DOME.y - 62, 42, 46, 0, 0.12, gr));
        ctx.restore();
      }
      const alpha = lerp(R.a0, R.a1, P.p) + P.v * 0.03, curve = lerp(R.c0, R.c1, P.p);
      const N = 9, cl = [], L = R.L * (1 + P.v * 0.04); let rad = 0, up = 0;
      for (let i = 0; i <= N; i++) {
        const s = i / N, a = alpha + curve * s * s;
        if (i > 0) { rad += Math.sin(a) * L / N; up += Math.cos(a) * L / N; }
        const rr = R.rb + rad, x = rr * sphi, z = rr * cphi;
        cl.push([DOME.x + x, DOME.y + R.y - up + z * 0.2, a]);
      }
      const face = Math.abs(cphi) * 0.62 + 0.38, tx = cphi, ty = -sphi * 0.2;
      const left = [], right = [];
      for (let i = 0; i <= N; i++) {
        const s = i / N, w = R.W * 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(0.1 + 0.9 * s, 0.8)), 0.75) * (s > 0.96 ? 0.4 : 1);
        const a = cl[Math.max(0, i - 1)], b = cl[Math.min(N, i + 1)]; let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const th = R.W * 0.035 * (1 - s * 0.6);
        const sgn = (nx * tx + ny * ty) < 0 ? -1 : 1, ex = lerp(nx * sgn, tx, Math.abs(cphi)), ey = lerp(ny * sgn, ty, Math.abs(cphi)), el = Math.hypot(ex, ey) || 1, wx = ex / el * w * face, wy = ey / el * w * face;
        left.push([cl[i][0] - wx, cl[i][1] - wy]); right.push([cl[i][0] + wx, cl[i][1] + wy]);
      }
      const poly = left.concat(right.reverse());
      const back = cphi < 0, lit = clamp(0.5 + sphi * 0.45 + (back ? 0.1 : 0));
      const rs = RNG(P.seed + 300);
      let base = back ? mix(col('brass', 2), col('brass', 4), 0.25 + lit * 0.4) : mix(col('brass', 1), col('brass', 3), lit);
      if (P.ri === 1 && !back) base = mix(base, col('copper', 2), 0.25);
      if (back) base = mix(base, '#f7c070', glow * 0.45 * clamp(open * 1.5));
      ctx.fillStyle = rgba(base); tracePoly(ctx, poly); ctx.fill();
      // 明暗块面：受光侧提亮、根部压暗
      ctx.save(); tracePoly(ctx, poly); ctx.clip();
      const sideL = left, sideR = right.slice().reverse();
      ctx.fillStyle = rgba(col('brass', 4), 0.42 * lit + 0.08); ribbon(ctx, sideR.map((p, i) => [lerp(p[0], cl[i][0], 0.34), lerp(p[1], cl[i][1], 0.34)]), t => R.W * 0.11 * face * Math.sin(Math.PI * clamp(t * 0.9 + 0.05)));
      ctx.fillStyle = rgba(col('dark', 1), 0.4); ribbon(ctx, sideL.map((p, i) => [lerp(p[0], cl[i][0], 0.25), lerp(p[1], cl[i][1], 0.25)]), t => R.W * 0.13 * face * Math.sin(Math.PI * clamp(t * 0.9 + 0.05)));
      ctx.fillStyle = rgba(col('dark', 1), 0.42); blob(ctx, cl[0][0], cl[0][1] + 4, R.W * 0.5 * face + 6, 20, 0, 0.2, rs, 9); ctx.fill();
      for (let k = 0; k < 5; k++) { const i = 1 + ((rs() * (N - 2)) | 0), u = rs.g() * 0.5, x = cl[i][0] + tx * R.W * 0.4 * face * u, y = cl[i][1] + rs.g() * 4, s = rs.r(2.5, 7);
        ctx.fillStyle = rgba(mix(rs() < 0.5 ? '#6b9a8c' : '#8c4a2c', col('brass', 3), clean * 0.85), 0.5 * (1 - clean * 0.7)); blob(ctx, x, y, s, s * 0.7, rs() * 3, 0.4, rs, 7); ctx.fill(); }
      ctx.restore();
      // 中脉与铆钉
      pencil(ctx, cl.slice(1, N).map(p => [p[0], p[1]]), 1.5, col('dark', 1), 0.5 * face, rs, { gap: 0.15, raw: true });
      for (let i = 1; i <= 2; i++) { const p = cl[i]; ctx.fillStyle = rgba(INK, 0.7 * face); blob(ctx, p[0] - tx * 9 * face, p[1] + 1, 2.2, 2.2, 0, 0.2, rs, 6); ctx.fill(); blob(ctx, p[0] + tx * 9 * face, p[1] + 1, 2.2, 2.2, 0, 0.2, rs, 6); ctx.fill(); }
      const rb = RNG(P.seed + Math.floor(tq * 8) * 7);
      pencil(ctx, left.concat([cl[N].slice(0, 2)]), 2, INK, 0.72, rb, { gap: 0.06, raw: true });
      pencil(ctx, sideR.concat([cl[N].slice(0, 2)]), 2, INK, 0.72, rb, { gap: 0.06, raw: true });
      pencil(ctx, sideR.slice(2, N - 1).map(p => [p[0] - tx * 2.4, p[1] - 0.5]), 1.5, col('brass', 4), 0.6 * lit, rb, { gap: 0.25, raw: true });
    }
  }

  window.TOWER = { CX, OX, OY, TW, TH, HUB, DOME, GEARS, MATS, paintTower, paintGlow, makeGear, drawRotor, drawGears, drawLotus, INK };
})();
