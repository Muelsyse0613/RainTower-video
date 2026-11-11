/* 总装：资源绘制、镜头、分层合成、时间驱动、入口 */
(function () {
  'use strict';
  const { TAU, clamp, lerp, seg, smooth, ease, q, RNG, ih, noise1, noise2, fbm2, mix, rgba, canvas, spline, tracePoly, blob, soft, ribbon, pencil, makeGrain, wind, gustEnv } = window.L;
  const C = window.CUES_STORY, W = window.WORLD, T = window.TOWER, FOX = window.FOX, FX = window.FX;
  const SW = 1600, SH = 900;
  const stage = document.getElementById('stage'); stage.width = SW; stage.height = SH;
  const ctx = stage.getContext('2d'); ctx.imageSmoothingQuality = window.__ISQ || 'high';
  const [farC, far] = canvas(SW, SH), [tmpC, tmp] = canvas(SW, SH), [snapC, snap] = canvas(SW, SH);
  const params = new URLSearchParams(location.search);
  const A = {};
  const pulse = (t, t0, a, d) => { const u = t - t0; return u <= 0 ? 0 : u < a ? u / a : Math.exp(-(u - a) / d); };
  const bump = (t, a, b, e) => smooth(a, a + e, t) * (1 - smooth(b - e, b, t));

  // ---------- 风车转角：静摩擦 → 卡顿 → 回退半格 → 缓慢加速 ----------
  const ROTOR_REST_ANGLE = 0.38, ROTOR_DIRECTION = -1;
  const THETA = (function () {
    const n = 80 * 120 + 2, a = new Float32Array(n); let th = ROTOR_REST_ANGLE;
    for (let i = 0; i < n; i++) {
      const t = i / 120;
      let om = 0.5 * smooth(C.rotorStart, 32, t) + 1.15 * smooth(31, 43, t) - 1.2 * smooth(63, 72, t);
      const stut = 0.12 + 1.9 * Math.pow(noise1(t * 2.3 + 5), 2.2);                         // 起步时一顿一顿
      om *= lerp(stut, 1, smooth(C.rotorStart + 1, C.rotorStart + 6.5, t));
      th += om / 120; a[i] = th;
    }
    return a;
  })();
  const shudder = (u, f, d) => (u > 0 ? Math.sin(u * f) * Math.exp(-u * d) : 0);
  function rotorAngle(t) {
    const f = clamp(t, 0, 79.9) * 120, i = f | 0; let th = lerp(THETA[i], THETA[i + 1], f - i);
    th += 0.005 * (noise1(t * 0.7) - 0.5) * 2 * (1 - smooth(20, 23, t)) + 0.016 * gustEnv(t - C.sailFlap - 0.1) * (1 - smooth(20.4, 20.5, t));
    const u1 = t - C.gearJerk1, u2 = t - C.gearSlip, u3 = t - C.gearJerk2;
    if (u1 > 0) th += 0.092 * ease.out(clamp(u1 / 0.09)) + 0.016 * shudder(u1, 46, 7);
    if (u2 > 0) th += -0.046 * ease.out(clamp(u2 / 0.14)) + 0.01 * shudder(u2, 38, 8);
    if (u3 > 0) th += 0.12 * ease.out(clamp(u3 / 0.1)) + 0.02 * shudder(u3, 44, 6);
    // 按帆翼受风的朝向统一旋转，齿轮咬合和回退也沿用此方向。
    return ROTOR_REST_ANGLE + ROTOR_DIRECTION * (th - ROTOR_REST_ANGLE);
  }
  const rotorSpeed = t => (rotorAngle(t + 0.05) - rotorAngle(t - 0.05)) / 0.1;

  // ---------- 镜头 ----------
  // 以三脚架定机位为主；只有“跟随主体 / 揭示 / 强调”时才动。镜头之间用半秒叠化衔接，不做硬切。
  // 云台式速度曲线：起得快、匀速、收得慢（a、d 为加减速所占比例）
  const trap = (u, a, d) => { u = clamp(u); const v = 1 / (1 - a / 2 - d / 2); if (u < a) return v * u * u / (2 * a); if (u < 1 - d) return v * (u - a / 2); const r = 1 - u; return 1 - v * r * r / (2 * d); };
  const mixCam = (p, q2, u) => [lerp(p[0], q2[0], u), lerp(p[1], q2[1], u), Math.exp(lerp(Math.log(p[2]), Math.log(q2[2]), u))];
  let noseRef = null;
  const SHOTS = [
    { t0: 0, cam: () => [1340, 1010, 2300] },                                              // 远景：热浪中的遗迹（定）
    { t0: 7.9, cam: () => [1290, 1388, 840] },                                             // 塔影里的沙狐与枯根（定）
    { t0: 18.1, cam: () => [1505, 765, 1150] },                                            // 沙狐抬头所见：垂着的帆翼（定）
    { t0: 20.15, cam: () => [1405, 1150, 620] },                                           // 齿轮咬合（定，随撞击震动）
    { t0: 24.05, cam: () => [1160, 1190, 1500] },                                          // 沙狐惊走，逃上沙脊（定，主体在画内运动）
    { t0: 28.6, cam: t => mixCam([1340, 905, 2300], [1345, 892, 2130], seg(t, 28.6, 33.6)) },   // 全景：风车开始转动（匀速缓推）
    { t0: 33.3, cam: t => mixCam([1560, 590, 900], [1560, 425, 1120], trap(seg(t, 36.5, 39.5), 0.3, 0.4)) },   // 莲花穹顶绽放 → 随水汽上摇
    { t0: 38.9, cam: t => mixCam([1500, 560, 1700], [1420, 340, 2480], trap(seg(t, 39.3, 45.8), 0.2, 0.45)) },  // 仰望：随云的生长上摇后拉
    { t0: 46.9, cam: () => [1300, 1000, 2400] },                                           // 云遮烈日，大地转暗，光束落下（定）
    { t0: 49.3, cam: () => { if (!noseRef) noseRef = FOX.nosePos(FOX.state(50.3)); return [noseRef[0] - 24, noseRef[1] + 10, 340]; } },   // 鼻尖的第一滴雨（定）
    { t0: 52.7, cam: t => mixCam([1010, 1235, 1150], [1300, 1000, 2400], 1 - Math.pow(1 - seg(t, 52.9, 57.6), 2.4)) },   // 春雨落下：后拉展开全景
    { t0: 58.4, cam: t => mixCam([1480, 1070, 1000], [1470, 1262, 1000], trap(seg(t, 58.9, 62.3), 0.25, 0.4)) },   // 跟着冲下的雨水下摇：锈迹被洗去
    { t0: 62.6, cam: () => [1345, 1456, 800] },                                            // 地面：溪水、新芽与野花（定）
    { t0: 66.3, cam: () => [1150, 990, 2350] },                                            // 雨过天晴，双彩虹，沙狐小跑回来（定）
    { t0: 70.5, cam: t => mixCam([1250, 1425, 620], [1290, 1150, 1750], Math.pow(seg(t, 74.2, 78.6), 1.7)) }   // 轻嗅花朵 → 缓缓拉远落幕
  ];
  const DISSOLVE = 0.5;
  function camOf(shot, t) {
    const c = shot.cam(t); let x = c[0], y = c[1]; const w = c[2];
    // 齿轮咬合时的震动
    const sh = pulse(t, C.gearJerk1, 0.02, 0.22) + 0.5 * pulse(t, C.gearSlip, 0.02, 0.16) + 1.2 * pulse(t, C.gearJerk2, 0.02, 0.26) + 0.25 * smooth(C.rotorStart, C.rotorStart + 0.6, t) * (1 - smooth(25, 29, t)) * noise1(t * 3);
    if (sh > 0.01) { const t24 = q(t, 24); x += (ih(t24 * 240, 1) - 0.5) * sh * 0.0075 * w; y += (ih(t24 * 240, 2) - 0.5) * sh * 0.0095 * w; }
    const h = w * SH / SW;
    x = clamp(x, W.X0 + w / 2 + 4, W.X1 - w / 2 - 4); y = clamp(y, W.SKY_Y0 + h / 2 + 4, W.BOTTOM - h / 2 - 2);
    return { x, y, w, h, z: SW / w };
  }
  // 返回当前镜头；处在叠化区间时同时返回下一镜头与混合比例
  // 成片的镜头表：原有镜头在插入点之后整体后移；中间插入四个“雨润万物”的镜头。
  // 插入镜头各自回到雨中的某一刻（故事时间 ts0 起，照常速播放），是同一场雨里并行发生的细节。
  const F = window.CUES, INSERTS = [
    { T0: 58.4, ts0: 53.3, cam: () => [1290, 1452, 540] },                                // 枯根与干沙：雨点打出深色湿痕，连成一片
    { T0: 61.2, ts0: 55.9, cam: () => [1560, 690, 660] },                                 // 机舱与帆翼：红锈顺着雨水淌下
    { T0: 63.6, ts0: 62.2, cam: () => [735, 1232, 540] },                                 // 沙脊上的枯树冒出花苞，沙狐在树下淋雨
    { T0: 66.0, ts0: 58.2, cam: () => [1800, 1468, 560] }                                 // 引水管下涌出的水汇成小溪
  ];
  const FILM_SHOTS = [];
  for (const s of SHOTS) { if (s.t0 === F.INS_AT) for (const n of INSERTS) FILM_SHOTS.push({ T0: n.T0, cam: n.cam, st: T => n.ts0 + (T - n.T0) }); FILM_SHOTS.push(s.t0 < F.INS_AT ? { T0: s.t0, cam: s.cam, st: T => T } : { T0: s.t0 + F.INS_LEN, cam: s.cam, st: T => T - F.INS_LEN }); }
  const shotView = (s, T) => { const t = clamp(s.st(T), 0, C.end); return { t, cam: camOf(s, t) }; };
  function shotsAt(T) {
    let i = 0; while (i < FILM_SHOTS.length - 1 && T >= FILM_SHOTS[i + 1].T0 - DISSOLVE / 2) i++;
    const cur = FILM_SHOTS[i];
    if (i > 0 && T < cur.T0 + DISSOLVE / 2) return { a: shotView(FILM_SHOTS[i - 1], T), b: shotView(cur, T), ia: i - 1, ib: i, k: smooth(cur.T0 - DISSOLVE / 2, cur.T0 + DISSOLVE / 2, T) };
    return { a: shotView(cur, T), b: null, ia: i, k: 0 };
  }

  // ---------- 资源 ----------
  const tick = () => new Promise(r => setTimeout(r, 0));
  async function build() {
    A.grain = makeGrain(256, 5); A.grain2 = makeGrain(256, 77, { base: 245, amp: 16, fib: 12, scale: 0.6 }); await tick();
    A.skyDry = W.paintSky('dry', A.grain); await tick();
    A.skyOver = W.paintSky('over', A.grain); await tick();
    A.skyClear = W.paintSky('clear', A.grain); await tick();
    A.backDry = W.paintBack('dry', A.grain); await tick();
    A.backWet = W.paintBack('wet', A.grain); await tick();
    A.frontDry = W.paintFront('dry', A.grain); await tick();
    A.frontWet = W.paintFront('wet', A.grain); await tick();
    A.green = W.paintGreen(A.grain); await tick();
    A.stream = W.paintStream(A.grain); A.mStream = W.streamReveal(); await tick();
    A.shadow = W.paintShadow(); A.rainbow = W.paintRainbow(); await tick();
    const td = T.paintTower('dry', A.grain); await tick();
    const tc = T.paintTower('clean', A.grain); await tick();
    A.towerDry = td.canvas; A.towerClean = tc.canvas; T.info = td.info;
    A.glow = T.paintGlow(tc.info);
    const mk = (m, d) => T.GEARS.map(G => T.makeGear(G, m, d));
    A.gears = { dry: mk(T.MATS.dry, true), clean: mk(T.MATS.clean, false) };
    A.gears.dark = A.gears.dry.map(c => { const [d, g] = canvas(c.width, c.height); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(46,39,48,0.82)'; g.fillRect(0, 0, d.width, d.height); return d; });
    await tick();
    FX.initFalls(); FX.initFlora(); FX.initTrees();
    // 浸润遮罩：雨点先打出斑驳的湿痕，再连成一片；远处更晚
    A.mWet = W.Reveal(360, 93, (u, v) => { const x = -160 + u * 2880, y = 1060 + v * 740; return 52.6 + (1 - smooth(1150, 1380, y)) * 3 + fbm2(x / 300, y / 110, 3) * 2.2 + Math.pow(ih(u * 360 | 0, v * 93 | 0), 0.8) * 1.3; });
    A.mClean = W.Reveal(210, 295, (u, v) => 54.2 + v * 7.6 + (noise2(u * 62, v * 4.5) - 0.5) * 4.2 + (noise2(u * 9, v * 12) - 0.5) * 1.6);
    A.mGreen = W.Reveal(360, 64, (u, v) => { const x = -160 + u * 2880, y = 1290 + v * 512; return 58.4 + Math.hypot(x - 1450, (y - 1470) * 1.6) / 420 * 3 + fbm2(x / 160, y / 60, 3) * 4.2; });
    // 暗角（带噪声的不规则压边，而非光滑径向渐变）
    { const w = 320, h = 180, [c, g] = canvas(w, h), id = g.createImageData(w, h), d = id.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = (x / w - 0.5) * 1.9, dy = (y / h - 0.5) * 1.75, r = Math.hypot(dx, dy) + (fbm2(x / 40, y / 40, 3) - 0.5) * 0.22, a = smooth(0.62, 1.32, r) * 0.5, i = (y * w + x) * 4; d[i] = 58; d[i + 1] = 42; d[i + 2] = 50; d[i + 3] = a * 255 * (0.9 + 0.2 * ih(x, y)); }
      g.putImageData(id, 0, 0); A.vig = c; }
    A.pGrain = ctx.createPattern(A.grain, 'repeat'); A.pGrain2 = ctx.createPattern(A.grain2, 'repeat');
  }

  function setCam(g, cam, px, py) { const z = cam.z; g.setTransform(z, 0, 0, z, SW / 2 - cam.x * z + (px || 0), SH / 2 - cam.y * z + (py || 0)); }
  function revealed(g, cam, img, ix, iy, mask, mx, my, mw, mh) {
    tmp.setTransform(1, 0, 0, 1, 0, 0); tmp.globalCompositeOperation = 'source-over'; tmp.clearRect(0, 0, SW, SH);
    setCam(tmp, cam); tmp.drawImage(img, ix, iy);
    tmp.globalCompositeOperation = 'destination-in'; tmp.drawImage(mask, mx, my, mw, mh);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(tmpC, 0, 0); g.restore();
  }

  // 赛璐珞层：地面上所有“一拍二”的手绘元素（草木、沙狐、水花……）每 1/12 秒只栅格化一次，
  // 其余帧把缓存按镜头的微小位移重新投影。画布比屏幕大一圈，镜头推拉时边缘不露空。
  const CM = 0.08, CELW = Math.round(SW * (1 + 2 * CM)), CELH = Math.round(SH * (1 + 2 * CM));
  const cels = [0, 1].map(() => { const [c, g] = canvas(CELW, CELH); return { c, g, key: null, cam: null }; });
  function groundCel(slot, t, cam, sun, ov, wetK) {
    const t12 = q(t, 12), S = cels[slot], o = S.cam;
    const moved = o && (Math.abs(Math.log(o.w / cam.w)) > 0.05 || Math.abs(o.x - cam.x) > cam.w * CM * 0.8 || Math.abs(o.y - cam.y) > cam.h * CM * 0.8);
    if (S.key !== t12 || !o || moved) {
      S.key = t12; S.cam = { x: cam.x, y: cam.y, w: cam.w, h: cam.h, z: cam.z };
      const g = S.g, z = cam.z; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, CELW, CELH);
      g.setTransform(z, 0, 0, z, CELW / 2 - cam.x * z, CELH / 2 - cam.y * z);
      const mw = cam.w * (0.5 + CM), mh = cam.h * (0.5 + CM), view = { x0: cam.x - mw, x1: cam.x + mw, y0: cam.y - mh, y1: cam.y + mh };
      FX.drawRipples(g, t, wetK);
      FX.drawGroundDetail(g, view, z, wetK);
      const P = FOX.state(t), fy = W.groundY(P.x);
      FX.drawTrees(g, t);
      FX.drawFlora(g, t, -1e9, fy + 1, view);
      FX.drawDryPlant(g, t);
      FX.drawTumbleweed(g, t);
      const inShadow = smooth(1010, 1090, P.x) * (1 - smooth(1500, 1560, P.x));
      FOX.draw(g, P, clamp(sun * inShadow * 0.9 + ov * 0.42), smooth(C.rainStart, C.rainFull + 2, t) * (1 - smooth(70, 76, t) * 0.6));
      FX.drawFlora(g, t, fy + 1, 1e9, view);
      FX.drawPetals(g, t);
      FX.drawSplashes(g, t, view);
    }
    const c = S.cam, k = cam.z / c.z;
    ctx.setTransform(k, 0, 0, k, SW / 2 + (c.x - cam.x) * cam.z - CELW / 2 * k, SH / 2 + (c.y - cam.y) * cam.z - CELH / 2 * k);
    ctx.drawImage(S.c, 0, 0);
    setCam(ctx, cam);
  }

  // ---------- 一帧 ----------
  function render(t) {
    FX.setClock(t);                                                   // 雨丝、水花按成片时间连续流动，跨镜头不跳
    const sh = shotsAt(clamp(t, 0, window.CUES.end));
    scene(sh.a.t, sh.a.cam, sh.ia & 1);
    if (sh.b) {                                                       // 叠化：两个机位各画一遍再混合
      snap.setTransform(1, 0, 0, 1, 0, 0); snap.globalCompositeOperation = 'copy'; snap.drawImage(stage, 0, 0);
      scene(sh.b.t, sh.b.cam, sh.ib & 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - sh.k; ctx.drawImage(snapC, 0, 0); ctx.globalAlpha = 1;
    }
    post(sh.b ? sh.b.t : sh.a.t);
  }
  function scene(t, cam, slot) {
    const z = cam.z, t12 = q(t, 12), t8 = q(t, 8), t24 = q(t, 24);
    const view = { x0: cam.x - cam.w / 2, x1: cam.x + cam.w / 2, y0: cam.y - cam.h / 2, y1: cam.y + cam.h / 2 };
    const ovIn = smooth(43.2, 48, t), clr = smooth(62.5, 68.8, t), ov = ovIn * (1 - clr);
    const sun = 1 - smooth(43.5, 47, t) + smooth(64, 68.5, t);
    const heat = 1 - smooth(38, 45, t);
    const wetK = smooth(53, 58.5, t), cleanK = smooth(55, 63, t);

    // —— 远景：天空、云、远丘 ——
    far.setTransform(1, 0, 0, 1, 0, 0); far.globalAlpha = 1;
    const px = (cam.x - 1280) * 0.06 * z, py = (cam.y - 900) * 0.05 * z;
    setCam(far, cam, px, py);
    if (ovIn < 1) far.drawImage(A.skyDry, -160, -420, 2880, 1720);
    if (ovIn > 0 && clr < 1) { far.globalAlpha = ovIn; far.drawImage(A.skyOver, -160, -420, 2880, 1720); }
    if (clr > 0) { far.globalAlpha = clr; far.drawImage(A.skyClear, -160, -420, 2880, 1720); }
    far.globalAlpha = 1;
    if (view.y0 < 800) { FX.cloud.update(t); FX.cloud.draw(far); }          // 云不在画内的近景镜头不必重算
    const rb = smooth(C.rainbow, C.rainbow + 4.5, t);
    if (rb > 0) { far.globalAlpha = rb * 0.95; far.drawImage(A.rainbow, -160, -420, 2880, 1700); far.globalAlpha = 1; }
    setCam(far, cam);
    if (t < 62) far.drawImage(A.backDry, -160, 1060);
    if (t > 52) { A.mWet.update(t12, 1.5); if (t < 62) revealed(far, cam, A.backWet, -160, 1060, A.mWet.canvas, -160, 1060, 2880, 740); else far.drawImage(A.backWet, -160, 1060); }
    FX.drawFarTrees(far, t);
    FX.drawRainVeil(far, t);
    far.setTransform(1, 0, 0, 1, 0, 0); FX.drawRain(far, t, SW, SH, z, cam.x, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(farC, 0, 0);
    // 热浪：地平线附近的空气一条一条地错动
    if (heat > 0.02) {
      const yh = (1186 - cam.y) * z + SH / 2, band = 96 * Math.max(0.7, z / 0.7), y0 = Math.max(0, Math.floor(yh - band)), y1 = Math.min(SH, Math.ceil(yh + band * 0.5));
      for (let y = y0; y < y1; y += 3) {
        const k = 1 - Math.abs(y - yh) / band; if (k <= 0) continue;
        const amp = heat * k * k * 3.4 * Math.max(0.8, Math.min(2.4, z / 0.65));
        const dx = (Math.sin(y * 0.23 + t * 5.1) + Math.sin(y * 0.071 - t * 3.3) * 0.8 + Math.sin(y * 0.6 + t * 9) * 0.3) * amp;
        const dy = Math.sin(y * 0.11 + t * 4.2) * amp * 0.5;
        ctx.drawImage(farC, 0, clamp(y + dy, 0, SH - 3), SW, 3, dx, y, SW, 3);
      }
    }

    // —— 造雨塔 ——
    setCam(ctx, cam);
    const th = rotorAngle(t12), thG = rotorAngle(t24), om = rotorSpeed(t12);
    const glowBase = smooth(C.glowOn, C.glowOn + 3.5, t), flick = t < C.glowOn + 1.6 ? (noise1(t12 * 9) > 0.45 ? 1 : 0.25) : 0.86 + 0.14 * noise1(t8 * 2.1);
    const glow = glowBase * flick * (1 - 0.35 * smooth(66, 74, t));
    if (t < 66.5) ctx.drawImage(A.towerDry, T.OX, T.OY);
    if (t > 53.5) { A.mClean.update(t12, 2.2); if (t < 66.5) revealed(ctx, cam, A.towerClean, T.OX, T.OY, A.mClean.canvas, T.OX, T.OY, T.TW, T.TH); else ctx.drawImage(A.towerClean, T.OX, T.OY); }
    const drawGlow = k => { if (k < 0.01) return; ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = clamp(k); ctx.drawImage(A.glow, T.OX, T.OY); ctx.restore(); };
    drawGlow(glow);
    // 压力表指针
    { const gp = T.info.gauge, a = Math.PI * (0.9 + 1.2 * smooth(C.glowOn, 42, t)) + (noise1(t12 * 7) - 0.5) * 0.12 * glowBase; pencil(ctx, [[gp[0], gp[1]], [gp[0] + Math.cos(a) * 10, gp[1] + Math.sin(a) * 10]], 1.5, '#7a2f25', 0.9, RNG(1), { raw: true, gap: 0, taper: 0.3 }); }
    T.drawGears(ctx, A.gears, thG, cleanK);
    FX.drawVines(ctx, t);
    T.drawLotus(ctx, seg(t12, C.lotusOpen, C.lotusDone), glow, cleanK, t12);
    FX.drawVapor(ctx, t);
    const wAt = wind(T.CX, t12), fill = clamp(Math.abs(om) * 0.85 + 0.9 * gustEnv(t12 - C.sailFlap - 0.55) * (t < 20.4 ? 1 : 0));
    T.drawRotor(ctx, th, fill, t12, cleanK, wAt);
    FX.drawFalls(ctx, t, view);
    ctx.setTransform(1, 0, 0, 1, 0, 0); FX.drawRain(ctx, t, SW, SH, z, cam.x, 1); setCam(ctx, cam);

    // —— 前景沙丘 ——
    if (t < 60) ctx.drawImage(A.frontDry, -160, 1290);
    if (t > 52) { if (t < 60) revealed(ctx, cam, A.frontWet, -160, 1290, A.mWet.canvas, -160, 1060, 2880, 740); else ctx.drawImage(A.frontWet, -160, 1290); }
    if (t > 58) { A.mGreen.update(t12, 3); if (t < 76) revealed(ctx, cam, A.green, -160, 1290, A.mGreen.canvas, -160, 1290, 2880, 512); else ctx.drawImage(A.green, -160, 1290); }
    if (t > W.STREAM_T0 - 0.2) { A.mStream.update(t12, 1.4); if (t < W.STREAM_T0 + W.STREAM_DUR + 4) revealed(ctx, cam, A.stream, -160, 1290, A.mStream.canvas, -160, 1290, 2880, 512); else ctx.drawImage(A.stream, -160, 1290); FX.drawStreamFlow(ctx, t); }
    if (sun > 0.01) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = sun * (1 - 0.35 * clr); ctx.drawImage(A.shadow, -160, 1290); ctx.restore(); }
    groundCel(slot, t, cam, sun, ov, wetK);
    FX.drawSand(ctx, t, 1 - smooth(51, 54, t), view);

    // —— 整体光色 ——
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (ov > 0.01) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = rgba('#a6abc6', ov * 0.36); ctx.fillRect(0, 0, SW, SH); ctx.globalCompositeOperation = 'source-over'; }
    if (heat > 0.02) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = rgba('#f8d49a', heat * 0.08); ctx.fillRect(0, 0, SW, SH); ctx.globalCompositeOperation = 'source-over'; }
    if (clr > 0.02) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = rgba('#f3f8fb', clr * 0.3); ctx.fillRect(0, 0, SW, SH); ctx.globalCompositeOperation = 'source-over'; }   // 雨后：通透、提亮
    { const sat = (0.04 + 0.085 * clr) * (1 - ov * 0.7); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = rgba('#e0452f', sat); ctx.fillRect(0, 0, SW, SH); ctx.globalCompositeOperation = 'source-over'; }   // 提高色彩纯度（灰色不受影响）
    setCam(ctx, cam);
    drawGlow(glow * ov * 0.4);                                         // 阴云下微光更显
    FX.drawBeams(ctx, t, smooth(C.beams, C.beams + 3, t) * (1 - smooth(60.5, 66, t)) * 0.62 + bump(t, 64, 73, 2.5) * 0.28);
    FX.drawFirstDrop(ctx, t, FOX.nosePos(FOX.state(t)));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    FX.drawRain(ctx, t, SW, SH, z, cam.x, 2);

  }
  // —— 纸张肌理、暗角、淡入淡出 ——
  function post(t) {
    const t8 = q(t, 8);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.1; ctx.fillStyle = A.pGrain2;
    const jx = (ih(Math.floor(t8 * 8), 3) * 40) | 0, jy = (ih(Math.floor(t8 * 8), 4) * 40) | 0;
    ctx.save(); ctx.scale(1.6, 1.6); ctx.fillRect(0, 0, SW, SH); ctx.restore();
    ctx.globalAlpha = 0.04; ctx.fillStyle = A.pGrain; ctx.save(); ctx.translate(jx, jy); ctx.fillRect(-jx, -jy, SW, SH); ctx.restore();
    ctx.globalAlpha = 0.22; ctx.drawImage(A.vig, 0, 0, SW, SH); ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const fin = 1 - smooth(0, 2.4, t), fout = smooth(C.fadeOut, C.end - 0.5, t);
    if (fin > 0.003) { ctx.fillStyle = rgba('#efe5cf', fin); ctx.fillRect(0, 0, SW, SH); }
    if (fout > 0.003) { ctx.fillStyle = rgba('#272126', fout); ctx.fillRect(0, 0, SW, SH); }
  }

  // ---------- 播放控制 ----------
  const veil = document.getElementById('veil'), enter = document.getElementById('enter');
  let playing = false, actx = null, audio = null, tStart = 0, clock = null;
  function loop() {
    if (!playing) return;
    const t = clock();
    render(t);
    if (t >= window.CUES.end + 0.6) { playing = false; if (audio) audio.stop(); setTimeout(() => { veil.classList.remove('gone'); veil.classList.add('again'); }, 900); return; }
    requestAnimationFrame(loop);
  }
  function start() {
    if (playing) return;
    veil.classList.add('gone');
    const muted = params.has('mute');
    try {
      if (!muted && window.RainAudio) {
        if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
        actx.resume(); tStart = actx.currentTime + 0.08;
        audio = window.RainAudio.build(actx, actx.destination, 0);
        clock = () => Math.max(0, actx.currentTime - tStart);
      }
    } catch (e) { console.warn(e); audio = null; }
    if (!audio) { const p0 = performance.now(); clock = () => (performance.now() - p0) / 1000; }
    playing = true; requestAnimationFrame(loop);
  }

  build().then(() => {
    window.__seek = t => { render(t); return true; };
    window.__ready = true;
    if (params.has('t')) { veil.classList.add('gone'); render(+params.get('t')); return; }
    render(0.01);
    ctx.fillStyle = rgba('#efe5cf', 0.25); ctx.fillRect(0, 0, SW, SH);
    render(6.5); ctx.fillStyle = rgba('#efe5cf', 0.5); ctx.fillRect(0, 0, SW, SH);
    veil.classList.add('ready');
    enter.addEventListener('click', start);
    if (params.has('play')) start();
  }).catch(e => { console.error(e); });
})();
