/* 小沙狐（耳廓狐）：参数化骨架 + 手绘块面与铅笔线；全片表演时间线（一拍二 / 一拍三） */
(function () {
  'use strict';
  const { TAU, clamp, lerp, seg, smooth, ease, q, RNG, noise1, mix, rgba, spline, tracePoly, blob, blobPts, ribbon, pencil, wind } = window.L;
  const C = window.CUES_STORY;
  const S = 1.18;
  const COL = { fur: '#e7c797', back: '#dcae78', light: '#f6ead0', shade: '#c0946e', earIn: '#e8b39a', earDeep: '#c98a78', ink: '#5a3f35', tip: '#4b3631', eye: '#2d2429', nose: '#33282b', hi: '#fbf3dc' };

  const pulse = (t, t0, a, d) => { const u = t - t0; return u <= 0 ? 0 : u < a ? u / a : Math.exp(-(u - a) / d); };
  const bump = (t, a, b, e) => smooth(a, a + e, t) * (1 - smooth(b - e, b, t));

  const X_START = 1078, X_HOME = 1176, X_BACK = 1158, X_LEAP = 1084, X_CREST = 868, X_END = 1202;
  const WALK0 = 4.4, WALK1 = 8.3;
  const LEAP0 = C.foxJump, LEAP_D = 0.42, TURN1 = LEAP0 + 0.54, FLEE0 = TURN1 + 0.17, FLEE1 = FLEE0 + 1.0, SETTLE = FLEE1 + 0.34;
  const RET0 = C.foxReturn + 0.1, RET1 = 70.3;
  const prof = (u, a, d) => { u = clamp(u); const v = 1 / (1 - a / 2 - d / 2); if (u < a) return v * u * u / (2 * a); if (u < 1 - d) return v * (u - a / 2); const r = 1 - u; return 1 - v * r * r / (2 * d); };
  const REST = [24, -17, -27, 30];                                 // 前远、后远、后近、前近
  const GAIT = {
    walk: { off: [0.75, 0.5, 0, 0.25], duty: 0.62, lift: 4.6, len: 34, k: 1 },      // 四拍：后近→前近→后远→前远
    trot: { off: [0.5, 0, 0.5, 0], duty: 0.5, lift: 6.6, len: 46, k: 1 },           // 对角线两两同步
    gallop: { off: [0.5, 0.08, 0, 0.42], duty: 0.34, lift: 9, len: 66, k: 1.5 }     // 后腿蹬、前腿接，有腾空
  };
  // 步态：按走过的距离推进相位，支撑脚相对地面不滑动。返回四只脚 [相对身体的 x, 抬起高度(负)]
  function gaitFeet(kind, dist, mv) {
    const G = GAIT[kind], ph = dist / G.len, sd = G.len * G.duty * G.k, out = [];
    for (let i = 0; i < 4; i++) {
      let p = ph + G.off[i]; p -= Math.floor(p);
      let x, y = 0;
      if (p < G.duty) x = sd * (0.5 - p / G.duty);
      else { const u = (p - G.duty) / (1 - G.duty); x = sd * (-0.5 + ease.sine(u)); y = -G.lift * Math.sin(Math.PI * u); }
      out.push([REST[i] + x * mv, y * mv]);
    }
    return out;
  }

  function state(t) {
    const W = window.WORLD, t12 = q(t, 12), t8 = q(t, 8);
    const P = { x: X_HOME, face: 1, turn: 0, air: 0, crouch: 0, pitch: 0, sit: 0, neck: 0, head: 0, earA: 0.3, earB: 0.3, tail: 0.1, wag: 0, wagF: 2, blink: 0, squint: 0, shake: 0, legs: null, feet: null, stretch: 0, tq: t12, tremble: 0, bob: 0 };
    const bl = noise1(t8 * 0.9 + 3); if (bl > 0.86) P.blink = 1;       // 眨眼：不规则间隔

    if (t < C.earsUp) {                                            // —— 踱过来，嗅枯根 ——
      const wu = seg(t12, WALK0, WALK1), d = (X_HOME - X_START) * prof(wu, 0.2, 0.3), mv = smooth(0, 0.1, wu) * (1 - smooth(0.86, 1, wu));
      P.x = X_START + d;
      if (mv > 0.001) { P.feet = gaitFeet('walk', d, mv); P.bob = Math.sin(d / 34 * TAU * 2) * 0.9 * mv; }
      const arrive = smooth(WALK1 - 0.4, WALK1 + 0.6, t12), look0 = bump(t12, 1.8, 3.4, 0.3), look = bump(t12, 12.3, 13.9, 0.35);
      const sn = noise1(t12 * 6.5) > 0.5 ? 1 : 0;
      P.neck = lerp(lerp(0.84 - look0 * 0.7, 0.5, mv), 0.94 - look * 0.6, arrive) + sn * 0.035 * (1 - mv);
      P.head = lerp(lerp(0.64 - look0 * 0.75, 0.28, mv), 0.72 - look * 0.75, arrive) + sn * 0.05 * (1 - mv) + P.bob * 0.03;
      P.earA = 0.3 + (look + look0) * 0.5 + mv * 0.25 + (noise1(t8 * 1.1 + 9) > 0.72 ? 0.35 : 0);
      P.earB = 0.25 + (look + look0) * 0.5 + mv * 0.2 + (noise1(t8 * 0.9 + 4) > 0.7 ? 0.4 : 0);
      P.wag = 0.22 + mv * 0.1; P.wagF = 1.3; P.tail = 0.12 + mv * 0.2;
      P.crouch = 0.12 - look * 0.1 - mv * 0.08;
    } else if (t < LEAP0 - 0.12) {                                 // —— 警觉 ——
      const a = ease.out(seg(t12, C.earsUp, C.earsUp + 0.3));
      const up = bump(t12, 17.55, 20.3, 0.35);
      P.neck = lerp(0.94, -0.05, a) - up * 0.12; P.head = lerp(0.72, -0.1, a) - up * 0.42;
      P.earA = lerp(0.3, 1, a); P.earB = lerp(0.25, 1.05, a);
      P.crouch = lerp(0.12, -0.12, a);
      const f1 = pulse(t12, C.gearJerk1, 0.08, 0.5), f2 = pulse(t12, C.gearSlip, 0.08, 0.35), f3 = pulse(t12, C.gearJerk2, 0.08, 0.6);
      const fl = Math.max(f1, f2 * 0.6, f3);
      P.crouch += fl * 0.75; P.earA -= fl * 0.75; P.earB -= fl * 0.65; P.head += fl * 0.2 - smooth(20.5, 21, t12) * 0.1; P.pitch = -fl * 0.08;
      P.tail = 0.1 + smooth(20.5, 20.7, t12) * 0.5; P.tremble = smooth(20.5, 20.7, t12) * 0.8;
      // 第二次咬合：不安地倒退两小步
      const su = seg(t12, C.gearJerk2 + 0.08, C.gearJerk2 + 0.62), sd = -(X_HOME - X_BACK) * ease.sine(su), smv = smooth(0, 0.15, su) * (1 - smooth(0.8, 1, su));
      P.x = X_HOME + sd; if (smv > 0.001) P.feet = gaitFeet('walk', sd * 1.6, smv);
      P.crouch += smooth(LEAP0 - 0.4, LEAP0 - 0.13, t12) * 0.6;
    } else if (t < TURN1) {                                        // —— 受惊：向后一跃 ——
      const u = (t12 - LEAP0) / LEAP_D;
      P.earA = 0.15; P.earB = 0.1; P.tail = 0.85; P.head = -0.1; P.neck = 0.05;
      if (u < 0) { P.x = X_BACK; P.crouch = 0.75; P.pitch = 0.12; }
      else if (u < 1) {
        P.x = lerp(X_BACK, X_LEAP, ease.sine(u) * 0.4 + u * 0.6); P.air = 4 * 31 * u * (1 - u);
        P.pitch = lerp(-0.3, 0.26, u); P.stretch = Math.sin(Math.PI * u);
        P.legs = { f: [lerp(8, -10, u), 22 - 9 * Math.sin(Math.PI * u)], h: [lerp(14, -6, u), 22 - 7 * Math.sin(Math.PI * u)] };
      } else { P.x = X_LEAP; P.crouch = 0.8 * Math.exp(-(u - 1) * 3); P.pitch = 0.1 * Math.exp(-(u - 1) * 5); }
    } else if (t < FLEE0) {                                        // 落地后拧身
      const u = seg(t12, TURN1, FLEE0);
      P.x = X_LEAP; P.turn = Math.sin(Math.PI * u); P.face = u < 0.5 ? 1 : -1;
      P.crouch = 0.55; P.earA = 0.12; P.earB = 0.1; P.tail = 0.6; P.neck = 0.2;
    } else if (t < FLEE1) {                                        // 窜上沙脊（疾奔，越跑越慢）
      const u = seg(t12, FLEE0, FLEE1), d = (X_LEAP - X_CREST - 12) * (1 - Math.pow(1 - u, 1.8)), mv = 1 - smooth(0.8, 1, u), cyc = d / 66;
      P.face = -1; P.x = X_LEAP - d;
      P.feet = gaitFeet('gallop', d, mv);
      P.air = 5 * (0.5 - 0.5 * Math.cos(TAU * (cyc + 0.2))) * mv; P.pitch = 0.13 * Math.sin(TAU * cyc) * mv; P.stretch = (0.5 + 0.5 * Math.sin(TAU * cyc + 1)) * mv * 0.8;
      P.earA = 0.08 + (1 - mv) * 0.1; P.earB = 0.05; P.tail = 0.78; P.neck = 0.3; P.head = 0.05; P.crouch = 0.12 + 0.45 * (1 - mv);
    } else if (t < SETTLE) {                                       // 刹住，回身
      const u = seg(t12, FLEE1, SETTLE);
      P.x = lerp(X_CREST + 12, X_CREST, ease.out(u)); P.turn = Math.sin(Math.PI * clamp((u - 0.35) / 0.65)); P.face = u < 0.675 ? -1 : 1;
      P.crouch = 0.6; P.earA = 0.12; P.earB = 0.1; P.tail = 0.5; P.neck = 0.2;
    } else if (t < RET0) {                                         // —— 沙丘高处：仰望 ——
      P.x = X_CREST;
      const low = Math.exp(-Math.max(0, t12 - SETTLE - 0.35) * 1.5);                    // 先伏低，再慢慢探起身
      const sit = ease.io(seg(t12, 29.6, 30.8)) * (1 - ease.io(seg(t12, 53.2, 54.4)));
      P.sit = sit;
      const gaze = 0.36 + smooth(33.5, 35, t12) * 0.2 + smooth(40, 43, t12) * 0.3 - smooth(57, 60, t12) * 0.5;
      P.head = -gaze * (1 - low * 0.8); P.neck = (-0.1 - gaze * 0.25) * (1 - low) + 0.25 * low;
      P.earA = lerp(1, 0.12, low) + (noise1(t8 * 0.8 + 2) > 0.8 ? -0.35 : 0); P.earB = lerp(1.05, 0.1, low) + (noise1(t8 * 0.7 + 7) > 0.78 ? -0.4 : 0);
      P.tail = 0.15 + sit * 0.1 + low * 0.3; P.wag = 0.08; P.wagF = 0.8;
      P.crouch = low * 0.6; P.tremble = Math.exp(-(t12 - SETTLE) * 1.2);
      const dim = bump(t12, C.sunCovered - 0.3, C.sunCovered + 1.4, 0.4); P.earA -= dim * 0.3; P.crouch += dim * 0.15;
      // 第一滴雨落在鼻尖
      const d = t12 - C.firstDrop;
      if (d >= 0 && d < 1.5) {
        const rec = pulse(t12, C.firstDrop, 0.05, 0.22);
        P.head += rec * 0.5; P.neck += rec * 0.3; P.crouch += rec * 0.2; P.earA -= rec * 0.9; P.earB -= rec * 0.8;
        if (d < 0.34) P.blink = 1;
        if (d > 0.42 && d < 1.2) { const k = Math.floor((d - 0.42) * 12); P.shake = (k % 2 ? 1 : -1) * Math.exp(-(d - 0.42) * 2.2); P.blink = 1; P.squint = 1; }
      }
      if (t12 > C.firstDrop + 1.3) {                                 // 雨中：欢喜
        const joy = smooth(C.firstDrop + 1.3, C.firstDrop + 2, t12);
        P.wag = lerp(0.08, 0.55, joy) * (1 - smooth(62, 66, t12) * 0.5); P.wagF = 3.2; P.tail = 0.5 * joy;
        for (const ts of [58.2, 61.6, 64.4]) { const dd = t12 - ts; if (dd > 0 && dd < 0.75) { const k = Math.floor(dd * 12); P.shake = (k % 2 ? 1 : -1) * Math.exp(-dd * 2.4); P.squint = 1; P.blink = 1; } }
        const hopj = bump(t12, 55.2, 55.75, 0.1); if (hopj > 0) { const u = seg(t12, 55.2, 55.75); P.air = 4 * 14 * u * (1 - u); P.stretch = 0.5 * Math.sin(Math.PI * u); }
        if (noise1(t8 * 1.7 + 30) > 0.8) P.blink = 1;                // 雨点打到眼睛
      }
    } else if (t < RET1) {                                         // —— 小跑回草丛（起步快，临近花丛放慢成走）——
      const u = seg(t12, RET0, RET1), d = (X_END - X_CREST) * prof(u, 0.16, 0.34), mv = smooth(0, 0.06, u) * (1 - smooth(0.9, 1, u)), cyc = d / 46;
      P.x = X_CREST + d; P.feet = gaitFeet('trot', d, mv);
      P.air = 2.2 * Math.abs(Math.sin(TAU * cyc)) * mv; P.pitch = 0.035 * Math.sin(TAU * cyc * 2 + 0.6) * mv;
      const near = smooth(0.78, 1, u);
      P.neck = 0.1 + near * 0.12 + 0.03 * Math.sin(TAU * cyc * 2); P.head = 0.02 + 0.05 * Math.sin(TAU * cyc * 2 + 1) + near * 0.1;
      P.earA = 0.72 + 0.1 * Math.sin(TAU * cyc * 2 + 2); P.earB = 0.66 + 0.1 * Math.sin(TAU * cyc * 2 + 2.6);
      P.tail = 0.58 - near * 0.1; P.wag = 0.3; P.wagF = 2.4; P.crouch = 0.05;
    } else {                                                       // —— 轻嗅花朵 ——
      P.x = X_END;
      const tA = RET1, a = ease.io(seg(t12, tA + 0.1, tA + 0.9));
      const sn = noise1(t12 * 6.2) > 0.5 ? 1 : 0, happy = smooth(73.4, 73.9, t12);
      P.neck = lerp(0.22, 0.7, a) + sn * 0.03 - happy * 0.25; P.head = lerp(0.12, 0.5, a) + sn * 0.045 - happy * 0.5;
      P.earA = lerp(0.72, 0.9, a) - happy * 0.25 + (noise1(t8 + 12) > 0.75 ? -0.3 : 0); P.earB = lerp(0.66, 0.95, a) - happy * 0.2;
      P.wag = 0.45; P.wagF = 2.6; P.tail = 0.45; P.crouch = 0.05 + a * 0.08;
      P.squint = happy; if (happy > 0.5) P.blink = 1;
    }
    const gy = W.groundY(P.x);
    P.y = gy - P.air;
    P.slope = (W.groundY(P.x + 26) - W.groundY(P.x - 26)) / 52;
    P.pitch += Math.atan(P.slope * P.face) * 0.45 * (1 - P.sit);          // 身体顺着坡面
    return P;
  }

  // 两段骨骼的简易反解
  function ik(ax, ay, bx, by, l1, l2, dir) {
    let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy); const mx = l1 + l2 - 0.01;
    if (d > mx) { dx *= mx / d; dy *= mx / d; d = mx; bx = ax + dx; by = ay + dy; }
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), base = Math.atan2(dy, dx);
    return [[ax + Math.cos(base + a * dir) * l1, ay + Math.sin(base + a * dir) * l1], [bx, by]];
  }

  // 计算骨架。返回关键点（局部坐标，y 向下，原点在脚下）
  function rig(P) {
    const sit = P.sit, cr = P.crouch;
    const hipY = lerp(-33, -17, sit) + cr * 9 + (P.bob || 0), shY = lerp(-35, -43, sit) + cr * 8 - (P.bob || 0) * 0.6;
    const hipX = lerp(-26, -20, sit), shX = lerp(22, 9, sit);
    const cx = (hipX + shX) / 2, cy = (hipY + shY) / 2;
    const rot = (x, y) => { const c = Math.cos(P.pitch), s = Math.sin(P.pitch); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };
    const hip = rot(hipX - P.stretch * 3, hipY), sh = rot(shX + P.stretch * 3, shY);
    const na = lerp(-1.02, 0.62, clamp(P.neck, -0.3, 1.1)) - sit * 0.1, nl = 19 + clamp(P.neck) * 7;
    const headC = [sh[0] + Math.cos(na) * nl + 3, sh[1] + Math.sin(na) * nl - 2];
    const hang = 0.12 + P.head;                                    // 口鼻朝向（正 = 朝下）
    return { hip, sh, headC, hang, na };
  }
  function nosePos(P) {
    const R = rig(P), c = Math.cos(R.hang), s = Math.sin(R.hang);
    const nx = 19.5, ny = 0.6;
    return [P.x + P.face * (R.headC[0] + nx * c - ny * s) * S, P.y + (R.headC[1] + nx * s + ny * c) * S];
  }

  // shade: 0..1 处在塔影或阴云下；wet: 0..1 被雨淋湿
  function draw(ctx, P, shade, wet) {
    const W = window.WORLD, tq = P.tq, boil = Math.floor(tq * 8);
    const rb = RNG(1000 + boil), R = rig(P);
    const tint = c => mix(mix(c, '#b9977a', wet * 0.22), '#5a4762', shade * 0.5);
    const K = {}; for (const k in COL) K[k] = tint(COL[k]);
    const wnd = wind(P.x, tq);
    const tr = P.tremble ? (noise1(tq * 11) - 0.5) * 1.2 * P.tremble : 0;

    // 接触阴影
    ctx.save(); ctx.translate(P.x, W.groundY(P.x));
    const shA = 0.34 * (1 - clamp(P.air / 60) * 0.6);
    ctx.fillStyle = rgba('#3f2a3c', shA); blob(ctx, -2 * S, 2, (32 - clamp(P.air / 4, 0, 10)) * S, 4.6 * S, P.slope * 0.8, 0.14, RNG(5), 12); ctx.fill();
    ctx.restore();

    ctx.save(); ctx.translate(P.x + tr, P.y); ctx.scale(S * P.face * (1 - 0.8 * P.turn), S);
    const hip = R.hip, sh = R.sh, sit = P.sit;
    const ink = (pts, w, a, o) => pencil(ctx, pts, w, K.ink, a == null ? 0.85 : a, rb, Object.assign({ gap: 0.05, wob: 0.6, jit: 0.5 }, o || {}));
    const gyAt = dx => (W.groundY(P.x + dx * S * P.face) - W.groundY(P.x)) / S + P.air / S;

    // —— 腿的目标位置 ——
    const legDef = [
      { j: [sh[0] - 2, sh[1] + 8], rest: lerp(24, 15, sit), front: true, far: true, off: -7 },
      { j: [hip[0] + 3, hip[1] + 6], rest: lerp(-17, -3, sit), front: false, far: true, off: 7 },
      { j: [hip[0] + 1, hip[1] + 7], rest: lerp(-27, -10, sit), front: false, far: false, off: 0 },
      { j: [sh[0], sh[1] + 9], rest: lerp(30, 20, sit), front: true, far: false, off: 0 }
    ];
    const legs = legDef.map((L, li) => {
      let fx, fy;
      if (P.legs) { const o = L.front ? P.legs.f : P.legs.h; fx = L.j[0] + o[0] + (L.far ? (L.front ? -4 : 4) : 0); fy = L.j[1] + o[1] - (L.far ? 1.5 : 0); }
      else if (P.feet) { fx = P.feet[li][0]; fy = gyAt(fx) + P.feet[li][1] - 0.6; }
      else { fx = L.rest; fy = gyAt(fx) - 0.6; }
      const l1 = L.front ? 14.5 : 15.5, l2 = L.front ? 15.5 : 17;
      const k = ik(L.j[0], L.j[1], fx, fy, l1, l2, L.front ? -1 : 1);
      return { L, knee: k[0], foot: k[1] };
    });
    function drawLeg(G) {
      const L = G.L, far = L.far, col = far ? K.shade : K.fur;
      const pts = spline([L.j, [G.knee[0], G.knee[1]], [G.foot[0], G.foot[1] - 1.2]], 6);
      const w0 = L.front ? 4.6 : 7.2, w1 = L.front ? 2.5 : 2.6;
      ctx.fillStyle = rgba(col); ribbon(ctx, pts, t => lerp(w0, w1, Math.pow(t, L.front ? 0.6 : 0.45)));
      if (!far && !L.front) { ctx.fillStyle = rgba(K.back, 0.5); blob(ctx, lerp(L.j[0], G.knee[0], 0.35), lerp(L.j[1], G.knee[1], 0.35), 7.5, 8.5, 0.3, 0.15, RNG(3), 9); ctx.fill(); }
      // 小爪
      const pw = [[G.foot[0] - 2.2, G.foot[1] - 2.3], [G.foot[0] + 1, G.foot[1] - 3], [G.foot[0] + 4.6, G.foot[1] - 1.4], [G.foot[0] + 4.4, G.foot[1] + 0.4], [G.foot[0] - 2, G.foot[1] + 0.5]];
      ctx.fillStyle = rgba(far ? K.shade : K.light); tracePoly(ctx, spline(pts.length ? pw : pw, 4, true)); ctx.fill();
      const e1 = [], e2 = [];
      for (let i = 0; i < pts.length; i += 2) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const d = Math.hypot(nx, ny) || 1; const w = lerp(w0, w1, Math.pow(i / (pts.length - 1), L.front ? 0.6 : 0.45)); e1.push([pts[i][0] + nx / d * w, pts[i][1] + ny / d * w]); e2.push([pts[i][0] - nx / d * w, pts[i][1] - ny / d * w]); }
      ink(e1, 1.15, far ? 0.6 : 0.85, { raw: true }); ink(e2, 1.15, far ? 0.6 : 0.85, { raw: true });
      ink([[G.foot[0] - 2, G.foot[1] + 0.6], [G.foot[0] + 1.5, G.foot[1] + 0.9], [G.foot[0] + 4.6, G.foot[1] + 0.2], [G.foot[0] + 4.8, G.foot[1] - 1.6]], 1.1, 0.8);
    }
    legs.filter(l => l.L.far).forEach(drawLeg);

    // —— 尾巴 ——
    {
      const pts = [[hip[0] - 8, hip[1] - 2]]; let a = Math.PI + 0.62 - P.tail * 1.3 + sit * 0.25 - P.pitch;
      const n = 8, wagP = tq * P.wagF * TAU;
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        a += (-0.1 + P.tail * 0.05 - sit * 0.04) + Math.sin(wagP - u * 2.6) * P.wag * 0.5 * u + wnd * 0.07 * u + (P.stretch ? 0.05 * P.stretch : 0);
        const p = pts[i - 1]; pts.push([p[0] + Math.cos(a) * 7.4, p[1] - Math.sin(a) * 7.4]);
      }
      for (const p of pts) p[1] = Math.min(p[1], gyAt(p[0]) - 3.5);    // 不穿地
      const sp = spline(pts, 5), wf = t => 2.6 + 8.4 * Math.pow(Math.sin(Math.PI * clamp(0.1 + t * 0.86)), 0.8) * (0.95 + 0.1 * noise1(t * 9 + boil));
      ctx.fillStyle = rgba(K.fur); ribbon(ctx, sp, wf);
      ctx.fillStyle = rgba(K.light, 0.75); ribbon(ctx, sp.map((p, i) => [p[0] + 1, p[1] + 2.6]), t => 3.4 * Math.sin(Math.PI * clamp(t * 0.8 + 0.05)));
      const tipN = Math.floor(sp.length * 0.72), tipPts = sp.slice(tipN);
      ctx.fillStyle = rgba(K.tip); ribbon(ctx, tipPts, t => wf(0.72 + t * 0.28) * (t < 0.2 ? 0.55 + t * 2.2 : 1) * 0.97);
      // 毛尖：边缘的小碎笔
      const e1 = [], e2 = [];
      for (let i = 0; i < sp.length; i++) { const a2 = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)]; let nx = -(b[1] - a2[1]), ny = b[0] - a2[0]; const d = Math.hypot(nx, ny) || 1; const w = wf(i / (sp.length - 1)) + (i % 3 === 0 ? 1.3 * rb() : 0); e1.push([sp[i][0] + nx / d * w, sp[i][1] + ny / d * w]); e2.push([sp[i][0] - nx / d * w, sp[i][1] - ny / d * w]); }
      ink(e1, 1.2, 0.8, { raw: true, gap: 0.1 }); ink(e2, 1.2, 0.8, { raw: true, gap: 0.1 });
    }

    // 近侧腿先画，肩部和大腿根由完整的身体毛色覆盖。
    legs.filter(l => !l.L.far).forEach(drawLeg);

    // —— 躯干与颈部：共用轮廓和毛色，避免连接带截断背色与腹毛 ——
    {
      const ax = sh[0] - hip[0], ay = sh[1] - hip[1], al = Math.hypot(ax, ay), ux = ax / al, uy = ay / al, vx = -uy, vy = ux;
      const T = (u, v) => [hip[0] + ux * u * al + vx * v, hip[1] + uy * u * al + vy * v];
      const st = 1 - P.stretch * 0.12, hc = R.headC;
      const neckEnd = [hc[0] - 4 + P.shake * 1.6, hc[1] + 2];
      const dx = neckEnd[0] - sh[0], dy = neckEnd[1] - sh[1], length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length, ny = dx / length;
      const neckMid = [lerp(sh[0], neckEnd[0], 0.55), lerp(sh[1], neckEnd[1], 0.55)];
      const nape = [
        [neckEnd[0] - nx * 8.6, neckEnd[1] - ny * 8.6],
        [neckMid[0] - nx * 10.5, neckMid[1] - ny * 10.5]
      ];
      const throat = [
        [neckMid[0] + nx * 8.6, neckMid[1] + ny * 8.6],
        [neckEnd[0] + nx * 8.6, neckEnd[1] + ny * 8.6]
      ];
      const back = [
        ...nape, T(0.9, -12.5), T(0.62, -12.6 * st), T(0.2, -12.8 * st),
        T(-0.12, -11.5), T(-0.33, -3), T(-0.24, 8.5)
      ];
      const belly = [
        T(0.1, 10.5 * st + sit * 3), T(0.5, 8.6 * st), T(0.86, 11),
        T(1.0, 12.8), T(1.06, 10.6), T(1.18, 11.8), ...throat
      ];
      const bp = spline([...back, ...belly], 6, true);
      const dorsal = T(0.45, -14), ventral = T(0.45, 12);
      const coat = ctx.createLinearGradient(dorsal[0], dorsal[1], ventral[0], ventral[1]);
      coat.addColorStop(0, rgba(mix(K.fur, K.back, 0.7)));
      coat.addColorStop(0.3, rgba(mix(K.fur, K.back, 0.22)));
      coat.addColorStop(0.65, rgba(K.fur));
      coat.addColorStop(1, rgba(mix(K.fur, K.shade, 0.08)));
      ctx.fillStyle = coat; tracePoly(ctx, bp); ctx.fill();
      ctx.save(); tracePoly(ctx, bp); ctx.clip();
      // 腹毛沿胸口连续延伸到下颌，两端收尖，边缘用浅色薄层过渡。
      const undercoat = spline([
        T(-0.18, 9.5), T(0.35, 9), T(0.86, 10.2), T(1.08, 8),
        [neckMid[0] + nx * 4.5, neckMid[1] + ny * 4.5],
        [neckEnd[0] + nx * 4, neckEnd[1] + ny * 4]
      ], 6);
      const width = t => (3.2 + 1.8 * t) * smooth(0, 0.15, t) * (1 - smooth(0.92, 1, t));
      for (const [spread, amount] of [[1.2, 0.22], [0.6, 0.48], [0, 0.88]]) {
        ctx.fillStyle = rgba(mix(K.fur, K.light, amount));
        ribbon(ctx, undercoat, t => width(t) + spread * Math.sin(Math.PI * t));
      }
      ctx.restore();
      ink(spline(back, 5), 1.3, 0.85, { raw: true });
      ink(spline([T(-0.2, 9), ...belly.slice(0, 3)], 5), 1.1, 0.7, { raw: true, gap: 0.16 });
      ink(spline(throat, 5), 1.1, 0.65, { raw: true, gap: 0.08 });
    }

    // —— 头 ——
    {
      const hc = R.headC, roll = P.shake * 0.16;
      ctx.save(); ctx.translate(hc[0] + P.shake * 1.6, hc[1]); ctx.rotate(R.hang + roll);
      const sq = 1 - Math.abs(P.shake) * 0.12;
      const wEar = clamp(wnd, 0, 1.3);
      function ear(bx, by, ang, far, seedK) {
        const len = 31, wd = 14.5, tw = (noise1(tq * 3 + seedK) - 0.5) * 0.05;
        const a = ang + tw + P.shake * (far ? -0.35 : 0.4) - wEar * 0.14;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(a);
        const o = [[-0.5, 5.2], [10, 9.2], [21, 6.8], [len, 0.8 + wEar * 1.4], [22, -5.2], [10, -7.4], [-0.5, -5.2]];
        const op = spline(o, 6);
        ctx.fillStyle = rgba(far ? K.shade : K.fur); tracePoly(ctx, op); ctx.fill();
        if (!far) {
          const inn = spline([[2, 2.6], [10, 5.6], [20, 4.2], [len - 5, 0.8], [20, -2.6], [10, -3.6], [2, -2.4]], 5, true);
          ctx.fillStyle = rgba(K.earIn); tracePoly(ctx, inn); ctx.fill();
          ctx.fillStyle = rgba(K.earDeep, 0.6); ribbon(ctx, spline([[3, 0.4], [12, 1.8], [22, 1.2]], 5), t => 2.4 * (1 - t));
          ctx.fillStyle = rgba(K.light, 0.95);                           // 耳根的绒毛
          for (let i = 0; i < 4; i++) ribbon(ctx, [[0.5, 3.6 - i * 2.2], [6 + i * 1.4, 4.4 - i * 2.4], [11 + (i % 2) * 3, 4.6 - i * 2.2]], t => 1.1 * (1 - t));
        } else { ctx.fillStyle = rgba(K.earDeep, 0.5); tracePoly(ctx, spline([[3, 2], [12, 4.5], [22, 3], [22, -2], [10, -3], [3, -2]], 4, true)); ctx.fill(); }
        ink(op, 1.25, far ? 0.65 : 0.9, { raw: true, gap: 0.04 });
        ctx.restore();
      }
      // 耳朵角度：0 = 向后贴伏，1 = 完全竖起
      const eA = lerp(-2.75, -1.86, clamp(P.earA, -0.2, 1.2)) - R.hang * 0.35, eB = lerp(-2.6, -1.62, clamp(P.earB, -0.2, 1.2)) - R.hang * 0.35;
      ear(-1.5, -8.5, eB, true, 1);
      // 头骨与口鼻
      const head = [[-11.5 * sq, -3], [-7, -10], [1, -11.4], [8.5, -8.6], [14, -3.6], [20.4, -1.2], [21.2, 1.4], [18.6, 3.6], [12, 5.6], [5, 8.6], [-1, 10.8], [-3.4, 13], [-5.6, 10.6], [-8.4, 12], [-9.4, 8.6], [-12 * sq, 4]];
      const hp = spline(head, 5, true);
      ctx.fillStyle = rgba(K.fur); tracePoly(ctx, hp); ctx.fill();
      ctx.save(); tracePoly(ctx, hp); ctx.clip();
      ctx.fillStyle = rgba(K.light); blob(ctx, 9, 6.4, 13, 5.4, -0.22, 0.12, RNG(8), 10); ctx.fill();
      blob(ctx, -3, 10, 8, 5, 0.1, 0.15, RNG(9), 9); ctx.fill();
      ctx.fillStyle = rgba(K.light, 0.8); blob(ctx, 6.4, -5.6, 3.6, 2, -0.5, 0.2, RNG(10), 8); ctx.fill();      // 眉点
      ctx.fillStyle = rgba(K.back, 0.6); ribbon(ctx, spline([[-8, -8], [2, -10.6], [12, -5.6], [19, -1.6]], 5), t => 2.6 * (1 - t * 0.6));
      ctx.restore();
      ink(spline([[-9.4, 8.6], [-12 * sq, 4], [-11.5 * sq, -3], [-7, -10], [1, -11.4], [8.5, -8.6], [14, -3.6], [20.4, -1.2]], 5), 1.3, 0.9, { raw: true });
      ink(spline([[18.6, 3.6], [12, 5.6], [5, 8.6], [-1, 10.8], [-3.4, 13], [-5.6, 10.6], [-8.4, 12], [-9.4, 8.6]], 4), 1.15, 0.8, { raw: true, gap: 0.03, wob: 0.3 });
      ear(-6.5, -7.2, eA, false, 2);
      // 眼睛
      const ex = 6.2, ey = -2.6;
      if (P.blink > 0.5) {
        const arc = P.squint > 0.4 ? [[ex - 3.4, ey + 0.6], [ex - 0.4, ey - 1.6], [ex + 3, ey + 0.4]] : [[ex - 3.4, ey - 0.2], [ex - 0.2, ey + 1.1], [ex + 3, ey - 0.4]];
        pencil(ctx, arc, 1.5, K.eye, 0.95, RNG(12), { gap: 0, wob: 0.2 });
      } else {
        ctx.fillStyle = rgba(K.eye); tracePoly(ctx, spline([[ex - 3.5, ey + 0.3], [ex - 1.4, ey - 2.9], [ex + 1.6, ey - 2.8], [ex + 3.3, ey - 0.2], [ex + 1.4, ey + 2.6], [ex - 1.8, ey + 2.5]], 5, true)); ctx.fill();
        ctx.fillStyle = rgba(mix(K.eye, '#7a5236', 0.5), 0.8); blob(ctx, ex + 0.2, ey + 0.9, 2, 1.3, 0, 0.1, RNG(13), 7); ctx.fill();
        ctx.fillStyle = rgba(K.hi, 0.95); blob(ctx, ex + 1.1, ey - 1.2, 1.05, 0.95, 0, 0.12, RNG(14), 6); ctx.fill();
        ctx.fillStyle = rgba(K.hi, 0.6); blob(ctx, ex - 1.2, ey + 1.1, 0.5, 0.45, 0, 0.1, RNG(15), 5); ctx.fill();
        pencil(ctx, [[ex - 4.2, ey + 0.4], [ex - 1.4, ey - 3.3], [ex + 2, ey - 3.2], [ex + 3.9, ey - 0.5]], 1.2, K.eye, 0.9, RNG(16), { gap: 0, wob: 0.2 });
      }
      // 鼻头与嘴
      ctx.fillStyle = rgba(K.nose); tracePoly(ctx, spline([[18.4, -0.6], [20.4, -1.8], [22.2, -0.2], [21.6, 2], [19.2, 2.2]], 5, true)); ctx.fill();
      ctx.fillStyle = rgba(K.hi, 0.55); blob(ctx, 20.6, -0.6, 0.8, 0.5, -0.4, 0.1, RNG(17), 5); ctx.fill();
      pencil(ctx, [[19.6, 2.4], [17.4, 4.2], [13.4, 5.2], [10.6, 4.4]], 1, K.ink, 0.75, RNG(18), { gap: 0, wob: 0.3 });
      // 胡须
      for (let i = 0; i < 3; i++) pencil(ctx, [[15.5 - i, 3 + i * 0.5], [21 - i * 2, 7.5 + i * 1.6 + wEar], [26 - i * 3, 9 + i * 2.6 + wEar * 2]], 0.55, K.ink, 0.45, rb, { gap: 0.05, taper: 1 });
      ctx.restore();
    }
    ctx.restore();
  }

  window.FOX = { state, draw, nosePos, S };
})();
