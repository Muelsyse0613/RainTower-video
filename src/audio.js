/* 《荒漠里的造雨塔》 — 配乐与音效（纯 Web Audio，自生成一切素材）
 *
 * window.RainAudio.build(ctx, destination, offset = 0) -> { stop() }
 *   以 ctx.currentTime 作为影片 offset 秒处，一次性调度 offset..CUES.end 的全部声音。
 *   所有时刻引用 window.CUES（src/timeline.js）。所有随机使用固定种子。
 *
 * 信号流：
 *   乐器(钢琴/弦乐/木管) → musicBus ┐
 *   环境与拟音           → sfxBus   ├→ 干声 ─────────────┐
 *   远景(雷/齿轮余响)    → farBus   ┘→ 卷积混响(自生成IR) ┴→ 9.5k 柔和高切 → 30Hz 低切 → 压缩 → 落幕淡出 → stop 门 → destination
 */
(function () {
  'use strict';

  // ───────────────────────── 通用工具 ─────────────────────────
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const sstep = (a, b, x) => smooth((x - a) / (b - a));
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const TAU = Math.PI * 2;
  const PCLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function noteNum(s) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    if (!m) throw new Error('bad note ' + s);
    return 12 * (parseInt(m[3], 10) + 1) + PCLASS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  // 分段平滑插值表 [[t, v], ...]
  function table(tb, t) {
    if (t <= tb[0][0]) return tb[0][1];
    for (let i = 1; i < tb.length; i++) {
      if (t <= tb[i][0]) {
        const a = tb[i - 1], b = tb[i];
        return a[1] + (b[1] - a[1]) * smooth((t - a[0]) / (b[0] - a[0]));
      }
    }
    return tb[tb.length - 1][1];
  }
  const gauss = r => (r() + r() + r() + r() - 2) * 1.732;

  // ───────────────────────── 乐谱（数据） ─────────────────────────
  // 段落：每段把若干拍映射到两个 CUES 时刻之间；a = 乐句呼吸式速度起伏，rit = 段尾渐慢(负值=推进)
  function makeSegments(C) {
    return {
      A: { t0: C.foxSniff + 0.9, t1: C.gust, n: 8, a: 0.12, rit: 0.25 },
      B: { t0: C.rotorStart, t1: C.lotusOpen, n: 12, a: 0.14, rit: 0.12 },
      C: { t0: C.lotusOpen, t1: C.sunCovered, n: 15, a: 0.08, rit: 0.05 },
      H: { t0: C.sunCovered, t1: C.firstDrop - 1.1, n: 3, a: 0, rit: 0.35 },
      P: { t0: C.rainStart, t1: C.rainFull, n: 3, a: 0.05, rit: -0.12 },
      X: { t0: C.rainFull, t1: C.climax2, n: 12, a: 0.1, rit: 0.03 },
      X2: { t0: C.climax2, t1: C.rainThin + 0.6, n: 12, a: 0.12, rit: 0.12 },
      D: { t0: C.rainThin + 0.6, t1: C.rainEnd, n: 5, a: 0.05, rit: 0.3 },
      R: { t0: C.rainEnd, t1: C.foxFlower, n: 4, a: 0.1, rit: 0.45 },
      F: { t0: C.foxFlower, t1: C.end, n: 8, a: 0, rit: 0 }
    };
  }
  function segTime(seg, b) {
    const x = b / seg.n, a = seg.a, r = seg.rit, nrm = 1 + r;
    let w;
    if (x < 0) w = x * (1 + a) / nrm;
    else if (x > 1) w = 1 + (x - 1) * (1 + a + 3 * r) / nrm;
    else w = (x + a * Math.sin(TAU * x) / TAU + r * x * x * x) / nrm;
    return seg.t0 + (seg.t1 - seg.t0) * w;
  }

  // 主题（D 大调，3/4）：弱起 A4 D5 | F#5. E5 D5 E5 | A5— G5 F#5 | B5. A5 G5 F#5 | E5— C#5 E5 | (D5)
  const THEME = 'F#5:1.5 E5:.5 D5:.5 E5:.5 A5:2 G5:.5 F#5:.5 B5:1.5 A5:.5 G5:.5 F#5:.5 E5:2 C#5:.5 E5:.5';

  function writeScore(C) {
    const notes = [];
    const N = (inst, seg, b, p, d, v, o) => notes.push({ inst, seg, b, m: typeof p === 'string' ? noteNum(p) : p, d, v, o: o || {} });
    // 旋律：乐句呼吸力度曲线（句头轻、句中推高、句尾渐弱）
    const line = (inst, seg, b, str, v, o) => {
      o = o || {};
      const items = str.trim().split(/\s+/).map(tk => { const [p, d] = tk.split(':'); return { p, d: parseFloat(d) }; });
      const n = items.filter(i => i.p !== 'r').length;
      let k = 0;
      for (const it of items) {
        if (it.p !== 'r') {
          const pos = n > 1 ? k / (n - 1) : 0.5;
          const shape = 0.8 + 0.32 * Math.sin(Math.PI * Math.pow(pos, 0.75));
          N(inst, seg, b, noteNum(it.p) + (o.tr || 0), it.d, v * shape, Object.assign({ legato: true }, o));
          k++;
        }
        b += it.d;
      }
    };
    const chord = (inst, seg, b, d, ps, v, o) => ps.forEach((p, i) => N(inst, seg, b, p, d, v * (1 - 0.04 * i), Object.assign({ roll: i }, o || {})));
    const arp = (inst, seg, b, step, ps, v, ring, grow) => ps.forEach((p, i) => N(inst, seg, b + i * step, p, ring, v * (1 + (grow || 0) * i / ps.length) * (i === 0 ? 1.08 : 1)));

    // —— 起：远处、暗的毛毡钢琴单音（8s 后，极疏）——
    N('pno', 'A', 0, 'A3', 3.5, 0.2, { dark: 1 });
    N('pno', 'A', 2.5, 'E4', 3.0, 0.16, { dark: 1 });
    N('pno', 'A', 4.5, 'F#3', 3.0, 0.19, { dark: 1 });
    N('pno', 'A', 6.6, 'D4', 4.2, 0.15, { dark: 1 });

    // —— 承：微光的低音弦乐持续音 + 钢琴动机片段 + 单簧管应答 ——
    N('str', 'B', 0.6, 'D2', 11.7, 0.5, { att: 3.2, rel: 1.4 });
    N('str', 'B', 0.6, 'A2', 11.7, 0.42, { att: 3.6, rel: 1.4 });
    N('str', 'B', 6, 'D3', 6.2, 0.3, { att: 2.0 });
    N('str', 'B', 6, 'F#3', 6.2, 0.26, { att: 2.4 });
    line('pno', 'B', 3, 'A4:.5 D5:.5 F#5:1.5 E5:.5 D5:.5 E5:.5 A5:3', 0.42, { legato: false });
    chord('pno', 'B', 4, 3, ['D3', 'A3', 'E4'], 0.3);
    chord('pno', 'B', 7, 3, ['B2', 'F#3', 'A3', 'D4'], 0.3);
    chord('pno', 'B', 10, 2.5, ['G2', 'D3', 'F#3', 'B3'], 0.27);
    line('cl', 'B', 9.5, 'B4:1.5 A4:.5 G4:.5', 0.36);

    // —— 转：弦乐群 + 木管，36–46.5 渐强与和声上行（低音 D–B–G–A–E–F#–G–A）——
    const cr = b => 0.5 + 0.5 * (b / 15);
    N('cl', 'C', 0, 'F#4', 2.2, 0.38, { legato: true });
    line('cl', 'C', 2, 'A4:.5 D5:.5 F#5:1.5 E5:.5 D5:.5 E5:.5 A5:2 G5:.5 F#5:.5', 0.46);
    line('fl', 'C', 6, 'A5:2 G5:.5 F#5:.5', 0.4);
    line('fl', 'C', 9, 'B5:1.5 A5:1.5 B5:1.5', 0.56);
    line('cl', 'C', 9, 'E5:1.5 C#5:1.5 D5:1.5', 0.46);
    // 高点 D6 / E5 延入“悬停”，在 sunCovered 处收气
    N('fl', 'C', 13.5, 'D6', 1.5, 0.62, { endAt: ['H', 2.4], fadeFrom: C.sunCovered, fadeTo: 0.22, legato: true });
    N('cl', 'C', 13.5, 'E5', 1.5, 0.5, { endAt: ['H', 0.6], fadeFrom: C.sunCovered - 0.3, fadeTo: 0.3 });
    const Cch = [
      [0, 3, ['D3', 'A3', 'E4', 'F#4'], 'D2'],
      [3, 3, ['B2', 'F#3', 'A3', 'D4'], 'B1'],
      [6, 1.5, ['G2', 'D3', 'F#3', 'B3'], 'G1'],
      [7.5, 1.5, ['A2', 'E3', 'A3', 'C#4'], 'A1'],
      [9, 1.5, ['E3', 'B3', 'D4', 'F#4'], 'E2'],
      [10.5, 1.5, ['F#3', 'C#4', 'E4', 'A4'], 'F#2'],
      [12, 1.5, ['G3', 'B3', 'D4', 'G4'], 'G2'],
      [13.5, 1.5, ['A3', 'D4', 'E4', 'A4'], 'A2']
    ];
    for (const [b, d, ps, bass] of Cch) {
      const k = cr(b);
      chord('str', 'C', b, d + 0.15, ps, 0.34 * k + 0.06, { att: b === 0 ? 1.6 : 0.5 });
      N('str', 'C', b, bass, d + 0.15, 0.4 * k + 0.08, { att: b === 0 ? 1.8 : 0.45 });
    }
    chord('str', 'C', 9, 3.1, ['G4', 'B4'], 0.38, { att: 0.9 });
    chord('str', 'C', 12, 1.6, ['B4', 'D5'], 0.48, { att: 0.4 });
    chord('str', 'C', 13.5, 1.6, ['D5', 'E5'], 0.52, { att: 0.4, endAt: ['H', 2.3], fadeFrom: C.sunCovered, fadeTo: 0.25 });
    N('str', 'H', 0, 'A4', 2.3, 0.3, { att: 0.5, fadeFrom: C.sunCovered + 0.6, fadeTo: 0.3 });
    arp('pno', 'C', 0, 0.5, ['D3', 'A3', 'E4', 'F#4', 'A4', 'E4'], 0.26, 1.3);
    arp('pno', 'C', 3, 0.5, ['B2', 'F#3', 'A3', 'D4', 'F#4', 'D4'], 0.29, 1.2);
    arp('pno', 'C', 6, 0.5, ['G2', 'D3', 'B3'], 0.33, 1.0);
    arp('pno', 'C', 7.5, 0.5, ['A2', 'E3', 'C#4'], 0.35, 1.0);
    arp('pno', 'C', 9, 0.5, ['E2', 'B2', 'G3'], 0.38, 1.0);
    arp('pno', 'C', 10.5, 0.5, ['F#2', 'C#3', 'A3'], 0.4, 1.0);
    arp('pno', 'C', 12, 0.25, ['G2', 'D3', 'G3', 'B3', 'D4', 'G4'], 0.42, 0.9, 0.3);
    arp('pno', 'C', 13.5, 0.25, ['A2', 'E3', 'A3', 'D4', 'E4', 'A4'], 0.46, 1.2, 0.3);

    // —— 雨起：钢琴上行琶音，弦乐膨胀，旋律弱起 ——
    arp('pno', 'P', 0, 0.5, ['D3', 'A3', 'D4', 'E4', 'F#4', 'A4'], 0.3, 1.6, 0.5);
    chord('str', 'P', 0.6, 2.5, ['D3', 'A3', 'F#4'], 0.46, { att: 1.5 });
    N('str', 'P', 1, 'D2', 2.1, 0.46, { att: 1.2 });
    line('fl', 'P', 2, 'A4:.5 D5:.5', 0.52);
    line('str', 'P', 2, 'A4:.5 D5:.5', 0.42, { att: 0.15 });

    // —— 高潮：主题完整呈现（长笛+小提琴主旋律，单簧管低八度，全弦乐，钢琴琶音）——
    line('fl', 'X', 0, THEME, 0.8);
    line('str', 'X', 0, THEME, 0.64, { att: 0.14, rel: 0.5 });
    line('cl', 'X', 0, THEME, 0.5, { tr: -12 });
    const xv = b => 0.86 + 0.16 * Math.sin(Math.PI * clamp(b / 11, 0, 1));
    const Xch = [
      [0, 3, ['F#3', 'A3', 'D4', 'E4'], ['D2', 'D3']],
      [3, 1.5, ['F#3', 'B3', 'D4'], ['B1', 'B2']],
      [4.5, 1.5, ['F#3', 'A3', 'D4'], ['A1', 'A2']],
      [6, 1.5, ['G3', 'B3', 'D4', 'F#4'], ['G1', 'G2']],
      [7.5, 1.5, ['G3', 'B3', 'D4', 'E4'], ['E2', 'E3']],
      [9, 1.5, ['A3', 'D4', 'E4'], ['A1', 'A2']],
      [10.5, 1.5, ['G3', 'C#4', 'E4'], ['A1', 'A2']]
    ];
    for (const [b, d, ps, bs] of Xch) {
      chord('str', 'X', b, d + 0.15, ps, 0.52 * xv(b), { att: b === 0 ? 0.6 : 0.35 });
      chord('str', 'X', b, d + 0.15, bs, 0.55 * xv(b), { att: 0.4 });
    }
    const Xarp = [
      [0, ['D3', 'A3', 'E4', 'F#4', 'A4', 'E4']],
      [3, ['B2', 'F#3', 'D4']], [4.5, ['A2', 'F#3', 'D4']],
      [6, ['G2', 'D3', 'B3', 'F#4', 'B4', 'F#4']],
      [9, ['A2', 'E3', 'D4']], [10.5, ['A2', 'G3', 'C#4']]
    ];
    for (const [b, ps] of Xarp) arp('pno', 'X', b, 0.5, ps, 0.4 * xv(b), 1.2);

    // —— 高潮第二遍：弦乐与单簧管接过主题，长笛在上方吹对题（第三小节与主题平行三度），和声换走法，钢琴加密为十六分 ——
    line('str', 'X2', 0, THEME, 0.72, { att: 0.12, rel: 0.5 });
    line('cl', 'X2', 0, THEME, 0.52, { tr: -12 });
    line('fl', 'X2', 0, 'A5:1.5 B5:.5 A5:1 D6:2 C#6:.5 D6:.5 D6:1.5 C#6:.5 B5:.5 A5:.5 A5:2 G5:.5 A5:.5', 0.6);
    const X2ch = [
      [0, 3, ['A3', 'D4', 'F#4', 'A4'], ['F#2', 'F#3']],
      [3, 1.5, ['G3', 'B3', 'D4', 'A4'], ['G1', 'G2']],
      [4.5, 1.5, ['A3', 'D4', 'F#4'], ['A1', 'A2']],
      [6, 1.5, ['F#3', 'B3', 'D4', 'F#4'], ['B1', 'B2']],
      [7.5, 1.5, ['G3', 'B3', 'D4', 'E4'], ['G1', 'G2']],
      [9, 1.5, ['A3', 'D4', 'E4', 'A4'], ['A1', 'A2']],
      [10.5, 1.5, ['G3', 'C#4', 'E4', 'A4'], ['A1', 'A2']]
    ];
    for (const [b, d, ps, bs] of X2ch) {
      chord('str', 'X2', b, d + 0.15, ps, 0.54 * xv(b), { att: b === 0 ? 0.5 : 0.35 });
      chord('str', 'X2', b, d + 0.15, bs, 0.57 * xv(b), { att: 0.4 });
    }
    const X2arp = [
      [0, ['F#2', 'D3', 'A3', 'D4', 'F#4', 'A4', 'D5', 'A4', 'F#4', 'D4', 'A3', 'D4']],
      [3, ['G2', 'D3', 'G3', 'B3', 'D4', 'A4']], [4.5, ['A2', 'D3', 'F#3', 'A3', 'D4', 'F#4']],
      [6, ['B2', 'F#3', 'B3', 'D4', 'F#4', 'B4']], [7.5, ['G2', 'D3', 'G3', 'B3', 'E4', 'B4']],
      [9, ['A2', 'E3', 'A3', 'D4', 'E4', 'A4']], [10.5, ['A2', 'E3', 'G3', 'C#4', 'E4', 'G4']]
    ];
    for (const [b, ps] of X2arp) arp('pno', 'X2', b, 0.25, ps, 0.36 * xv(b), 1.0);

    // —— 阻碍终止到 Bm，借用 Gm6 —— 雨势渐小
    N('str', 'D', 0, 'D5', 3.2, 0.52, { att: 0.2, fadeFrom: C.rainThin + 1.6, fadeTo: 0.45 });
    N('fl', 'D', 0, 'D5', 2.4, 0.4, { fadeFrom: C.rainThin + 1.2, fadeTo: 0.4 });
    chord('str', 'D', 0, 3.1, ['F#3', 'A3', 'B3'], 0.44, { att: 0.3 });
    chord('str', 'D', 0, 3.1, ['B1', 'B2'], 0.44, { att: 0.3 });
    chord('str', 'D', 3, 2.4, ['G3', 'Bb3', 'D4', 'E4'], 0.32, { att: 0.5 });
    chord('str', 'D', 3, 2.4, ['G1', 'G2'], 0.3, { att: 0.5 });
    line('fl', 'D', 3, 'A5:1 G5:.9', 0.3);
    arp('pno', 'D', 0, 0.5, ['B2', 'F#3', 'D4'], 0.3, 1.4);
    line('pno', 'D', 4, 'A4:.5 D5:.5', 0.3, { legato: false });

    // —— 合：钢琴独奏主题再现 → foxFlower 处 V–I 终止 ——
    line('pno', 'R', 0, 'F#5:1.5 E5:.5 D5:.5 C#5:.5 E5:1', 0.36, { legato: false });
    chord('pno', 'R', 0, 2, ['G2', 'D3', 'F#3', 'B3'], 0.25);
    chord('pno', 'R', 2, 0.5, ['A2', 'E3', 'G3', 'D4'], 0.23);
    chord('pno', 'R', 2.5, 1.5, ['A2', 'E3', 'G3', 'C#4'], 0.23);
    chord('str', 'R', 0, 2.1, ['B3', 'D4'], 0.2, { att: 0.8 });
    chord('str', 'R', 2, 2.1, ['G3', 'C#4'], 0.2, { att: 0.6 });
    N('str', 'R', 0, 'G2', 2.1, 0.22, { att: 0.8 });
    N('str', 'R', 2, 'A2', 2.1, 0.22, { att: 0.6 });

    N('pno', 'F', 0, 'D5', 6, 0.34);
    chord('pno', 'F', 0, 6.5, ['D2', 'A2', 'F#3', 'E4', 'A4'], 0.3, { rollStep: 0.06 });
    chord('str', 'F', 0.1, 6.6, ['D3', 'A3', 'F#4'], 0.24, { att: 1.0, fadeFrom: C.foxFlower + 1, fadeTo: 0.3 });
    N('str', 'F', 0.1, 'D2', 6.6, 0.25, { att: 1.2, fadeFrom: C.foxFlower + 1, fadeTo: 0.3 });
    N('pno', 'F', 2.5, 'A4', 2, 0.17);
    N('pno', 'F', 3.5, 'E5', 3.5, 0.15);
    // 段落整体力度（塑造情绪弧线：承段克制，高潮略高于 44s 的渐强顶点）
    const DYN = { A: 1, B: 0.8, C: 0.97, H: 1, P: 1, X: 1.06, X2: 1.14, D: 1, R: 1, F: 1 };
    for (const nt of notes) nt.v = Math.min(1, nt.v * DYN[nt.seg]);
    return notes;
  }

  // ───────────────────────── 主体 ─────────────────────────
  function build(ctx, destination, offset) {
    const C = window.CUES;
    if (!C) throw new Error('RainAudio: window.CUES missing (load timeline.js first)');
    const sr = ctx.sampleRate;
    const END = C.end;
    offset = clamp(+offset || 0, 0, END);
    const t0 = ctx.currentTime;
    const T = ft => t0 + (ft - offset);
    const live = [];          // 所有已调度的源节点（stop 用）
    const R = name => { let h = 2166136261; for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619); return mulberry32(h >>> 0); };

    // —— 底层 DSP 辅助 ——
    function onePoleLP(d, fc) { const a = 1 - Math.exp(-TAU * fc / sr); let y = 0; for (let i = 0; i < d.length; i++) { y += a * (d[i] - y); d[i] = y; } }
    function onePoleHP(d, fc) { const a = Math.exp(-TAU * fc / sr); let x1 = 0, y1 = 0; for (let i = 0; i < d.length; i++) { const x = d[i]; const y = a * (y1 + x - x1); x1 = x; y1 = y; d[i] = y; } }
    function normPeak(d, p) { let m = 0; for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > m) m = v; } if (m > 0) { const g = p / m; for (let i = 0; i < d.length; i++) d[i] *= g; } }
    function normRMS(d, target) { let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; const rms = Math.sqrt(s / d.length); if (rms > 0) { const g = target / rms; for (let i = 0; i < d.length; i++) d[i] *= g; } }
    function toBuf(chs) { const b = ctx.createBuffer(chs.length, chs[0].length, sr); chs.forEach((c, i) => b.copyToChannel(c, i)); return b; }
    // 衰减正弦分音（旋转器实现，自带指数衰减）
    function addPartial(out, start, f, amp, tau, phase) {
      const w = TAU * f / sr, c = Math.cos(w), s = Math.sin(w), r = Math.exp(-1 / (tau * sr));
      let x = Math.cos(phase) * amp, y = Math.sin(phase) * amp;
      const stop = Math.min(out.length, start + Math.ceil(tau * sr * 7));
      for (let i = start; i < stop; i++) { out[i] += y; const nx = r * (c * x - s * y); y = r * (s * x + c * y); x = nx; }
    }
    // 二极点共振器（模态合成）
    function resonate(inp, f, tau, gain, out) {
      const w = TAU * f / sr, r = Math.exp(-1 / (tau * sr));
      const b1 = 2 * r * Math.cos(w), b2 = -r * r, g = gain * (1 - r) * 2 * Math.sin(w);
      let y1 = 0, y2 = 0;
      for (let i = 0; i < inp.length; i++) { const y = inp[i] * g + b1 * y1 + b2 * y2; y2 = y1; y1 = y; out[i] += y; }
    }

    // —— 噪声素材：粉红 / 布朗（无缝循环） ——
    function loopify(d, fade) {
      const n = d.length - fade;
      const o = new Float32Array(n);
      for (let i = 0; i < n; i++) o[i] = d[i];
      for (let i = 0; i < fade; i++) { const a = i / fade; o[i] = d[i] * Math.sqrt(a) + d[n + i] * Math.sqrt(1 - a); }
      return o;
    }
    function pinkData(sec, seed) {
      const r = mulberry32(seed), fade = Math.floor(0.2 * sr), n = Math.floor(sec * sr) + fade, d = new Float32Array(n);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = r() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      }
      const o = loopify(d, fade); onePoleHP(o, 20); normRMS(o, 0.25); return o;
    }
    function brownData(sec, seed) {
      const r = mulberry32(seed), fade = Math.floor(0.2 * sr), n = Math.floor(sec * sr) + fade, d = new Float32Array(n);
      let y = 0;
      for (let i = 0; i < n; i++) { y = (y + 0.02 * (r() * 2 - 1)) / 1.02; d[i] = y; }
      const o = loopify(d, fade); onePoleHP(o, 18); normRMS(o, 0.25); return o;
    }
    const pinkA = toBuf([pinkData(9, 11)]);
    const pinkB = toBuf([pinkData(9.7, 23)]);
    const brown = toBuf([brownData(8.3, 37)]);
    // 颗粒纹理（沙粒、雨的淅沥、草叶），立体声去相关
    function grainBuffer(sec, rate, seed, tauMin, tauMax, lpHz, hpHz) {
      const n = Math.floor(sec * sr), chs = [];
      for (let ch = 0; ch < 2; ch++) {
        const r = mulberry32(seed + ch * 101), d = new Float32Array(n);
        let t = 0;
        for (;;) {
          t += -Math.log(1 - r()) / rate;
          const i0 = Math.floor(t * sr); if (i0 >= n) break;
          const amp = Math.pow(r(), 2.2), tau = (tauMin + (tauMax - tauMin) * r()) * sr, L = Math.ceil(tau * 5);
          for (let j = 0; j < L; j++) d[(i0 + j) % n] += amp * (r() * 2 - 1) * Math.exp(-j / tau);
        }
        onePoleLP(d, lpHz); onePoleLP(d, lpHz * 1.5); onePoleHP(d, hpHz); normRMS(d, 0.25);
        chs.push(d);
      }
      return toBuf(chs);
    }
    const sandTex = grainBuffer(5, 1100, 501, 0.0003, 0.0018, 8000, 1200);
    const patterTex = grainBuffer(6, 420, 733, 0.0008, 0.004, 6500, 700);
    const leafTex = grainBuffer(5, 240, 919, 0.002, 0.009, 4500, 500);

    // —— 冲激响应：左右不相关、指数衰减、随时间变暗的滤波噪声 + 早期反射，尾长约 3.2s ——
    function makeIR() {
      const len = Math.floor(3.3 * sr), pre = Math.floor(0.017 * sr), chs = [];
      for (let ch = 0; ch < 2; ch++) {
        const r = mulberry32(9001 + ch * 77), d = new Float32Array(len);
        const tau = 3.0 / 6.9;
        let lp = 0;
        for (let i = pre; i < len; i++) {
          const t = (i - pre) / sr;
          const env = Math.exp(-t / tau) * (1 - Math.exp(-t / 0.014));
          const a = 0.55 * Math.exp(-t / 0.8) + 0.05;
          lp += a * ((r() * 2 - 1) - lp);
          d[i] = lp * env;
        }
        const taps = [0.009, 0.016, 0.023, 0.031, 0.043, 0.054, 0.067, 0.083];
        taps.forEach((tt, k) => {
          const idx = pre + Math.floor((tt + (r() - 0.5) * 0.005) * sr);
          const g = (0.5 - k * 0.045) * (r() < 0.5 ? -1 : 1) * 0.3;
          for (let j = 0; j < 30; j++) d[idx + j] += g * Math.exp(-j / 6) * (r() * 2 - 1);
        });
        onePoleHP(d, 140);
        for (let i = len - 2000; i < len; i++) d[i] *= (len - i) / 2000;
        chs.push(d);
      }
      return toBuf(chs);
    }

    // —— 总线 ——
    const stopGate = ctx.createGain(); stopGate.connect(destination);
    const master = ctx.createGain(); master.connect(stopGate);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 2.2; comp.attack.value = 0.03; comp.release.value = 0.35;
    comp.connect(master);
    const lowCut = ctx.createBiquadFilter(); lowCut.type = 'highpass'; lowCut.frequency.value = 30; lowCut.Q.value = -2; lowCut.connect(comp);
    const hiCut = ctx.createBiquadFilter(); hiCut.type = 'lowpass'; hiCut.frequency.value = 9500; hiCut.Q.value = -3; hiCut.connect(lowCut);
    const pre = ctx.createGain(); pre.connect(hiCut);
    const conv = ctx.createConvolver(); conv.normalize = true; conv.buffer = makeIR();
    const wet = ctx.createGain(); wet.gain.value = 0.9; conv.connect(wet); wet.connect(pre);
    const revIn = ctx.createGain(); revIn.connect(conv);
    function bus(level, dry, send) {
      const g = ctx.createGain(); g.gain.value = level;
      const d = ctx.createGain(); d.gain.value = dry; g.connect(d); d.connect(pre);
      const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(revIn);
      return g;
    }
    const MIX = {
      music: 1.0, sfx: 1.0, far: 1.0,
      wind: 0.27, windBody: 0.17, windWidth: 0.15, whistle: 0.04, sandHiss: 0.07,
      flap: 0.7, rumble: 0.08, gear: 0.6, slip: 0.35, groan: 0.25, swoosh: 0.17, pour: 0.25, paw: 0.2, sniff: 0.1,
      lotus: 0.15, slide: 0.07, hiss: 0.05, vapor: 0.22, thunder: 0.35, drop1: 0.3,
      rainFar: 0.28, rainPatter: 0.22, rainBody: 0.22, dropNear: 0.17, metal: 0.05, puddle: 0.13, drip: 0.17, leaves: 0.1
    };
    const LV = { pno: 1.0, str: 0.068, fl: 0.17, cl: 0.15 };
    if (window.__RAIN_AUDIO_MIX) Object.assign(MIX, window.__RAIN_AUDIO_MIX);   // 调试：自检脚本用于分组测量
    // 调试用独奏开关（仅自检脚本使用）：window.__RAIN_AUDIO_SOLO = 'music' | 'sfx'
    const solo = window.__RAIN_AUDIO_SOLO;
    const musicBus = bus(solo === 'sfx' ? 0 : MIX.music, 0.78, 0.5);
    const sfxBus = bus(solo === 'music' ? 0 : MIX.sfx, 0.9, 0.16);
    const farBus = bus(solo === 'music' ? 0 : MIX.far, 0.55, 0.7);

    // 影片末尾落幕淡出（fadeOut → end 前 0.15s 归零）
    curve(master.gain, t => (t < C.fadeOut ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * clamp((t - C.fadeOut) / (END - 0.15 - C.fadeOut), 0, 1))), offset, END, 30);

    // —— 调度辅助 ——
    function curve(param, fn, ft0, ft1, rate) {
      const a = Math.max(ft0, offset);
      if (ft1 - a < 0.02) return false;
      const n = Math.max(2, Math.ceil((ft1 - a) * (rate || 30)) + 1);
      const arr = new Float32Array(n);
      for (let i = 0; i < n; i++) { const v = fn(a + (ft1 - a) * i / (n - 1)); arr[i] = Number.isFinite(v) ? v : 0; }
      param.value = arr[0];
      param.setValueCurveAtTime(arr, T(a), ft1 - a);
      return true;
    }
    function loopSrc(buf, ft0, ft1, rng, rate) {
      const a = Math.max(ft0, offset);
      if (ft1 - a < 0.02) return null;
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      if (rate) s.playbackRate.value = rate;
      s.start(T(a), (rng ? rng() : 0) * buf.duration * 0.9);
      s.stop(T(ft1));
      live.push(s);
      return s;
    }
    function filt(type, f, q) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; }
    function gainN(v) { const g = ctx.createGain(); g.gain.value = v === undefined ? 1 : v; return g; }
    function panN(p) { const s = ctx.createStereoPanner(); s.pan.value = clamp(p || 0, -1, 1); return s; }
    function chain() { for (let i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }
    // 一次性播放素材
    function shot(buf, ft, o) {
      if (ft < offset - 0.005) return;
      const s = ctx.createBufferSource(); s.buffer = buf;
      if (o.rate) s.playbackRate.value = o.rate;
      let node = s;
      if (o.lp) node = chain(node, filt('lowpass', o.lp, -1));
      if (o.hp) node = chain(node, filt('highpass', o.hp, -1));
      const g = gainN(o.gain); const p = panN(o.pan);
      chain(node, g, p, o.dest || sfxBus);
      s.start(T(ft));
      live.push(s);
    }
    // 滤波噪声脉冲（快起、指数衰减、频率扫动）
    function burst(buf, ft, o, rng) {
      if (ft < offset - 0.005) return;
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = filt(o.type || 'bandpass', o.f0, o.Q === undefined ? 1 : o.Q);
      const t = T(ft), att = o.att || 0.01, dec = o.dec || 0.1;
      if (o.f1) { f.frequency.setValueAtTime(o.f0, t); f.frequency.exponentialRampToValueAtTime(o.f1, t + att + dec * 3); }
      const g = gainN(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.peak, t + att); g.gain.setTargetAtTime(0, t + att, dec);
      chain(s, f, g, panN(o.pan), o.dest || sfxBus);
      s.start(t, (rng ? rng() : 0.3) * buf.duration * 0.9); s.stop(t + att + dec * 8);
      live.push(s);
    }

    // ───────────────────── 环境函数（全部由 CUES 派生） ─────────────────────
    const gustList = C.gusts;
    function gustAt(t) {
      let e = 0, pw = 0, pv = 0;
      for (let i = 0; i < gustList.length; i++) {
        const gt = gustList[i][0], a = gustList[i][1];
        const rise = 0.5 + 0.45 * (1 - a), fall = 1.5 + 1.9 * a;     // 快起慢落
        const x = t - gt + 0.3;
        if (x <= 0 || x > rise + fall * 8) continue;
        const v = x < rise ? smooth(x / rise) : Math.exp(-(x - rise) / fall);
        const ev = a * v;
        e += ev; pw += ev;
        pv += ev * (-0.8 + 1.6 * Math.min(1, x / (rise + fall * 1.8)));   // 左 → 右
      }
      return { e, pan: pw > 1e-4 ? (pv / pw) * Math.min(1, pw * 3) : 0 };
    }
    const breath = t => 0.5 + 0.5 * (0.5 * Math.sin(TAU * t / 7.3 + 1) + 0.3 * Math.sin(TAU * t / 4.1 + 2) + 0.2 * Math.sin(TAU * t / 11.7));
    const gWind = t => 0.13 + 0.06 * breath(t) + 0.85 * gustAt(t).e;
    const windArc = t => table([[0, 0.7], [14, 0.75], [16, 1], [33, 1], [46, 0.95], [50, 0.7], [54, 0.6], [67, 0.6], [70, 0.7], [END, 0.6]], t);
    // 第一滴雨前约 1 秒近乎静默
    const duck = t => 1 - 0.88 * sstep(C.firstDrop - 1.4, C.firstDrop - 0.9, t) * (1 - sstep(C.firstDrop + 0.1, C.rainStart + 0.4, t));
    const openIn = t => sstep(0, 2.5, t);
    // 风车转速：rotorStart 起极慢，~40s 达到 4 秒一圈
    const rotSpeed = t => (t < C.rotorStart ? 0 : 0.25 * Math.pow(sstep(C.rotorStart, C.rotorStart + 17, t), 1.25));
    const PHI_RATE = 200, phiTab = new Float32Array(Math.ceil(END * PHI_RATE) + 2);
    for (let i = 1; i < phiTab.length; i++) phiTab[i] = phiTab[i - 1] + rotSpeed(i / PHI_RATE) / PHI_RATE;
    const phiAt = t => { const x = clamp(t, 0, END) * PHI_RATE, i = Math.floor(x), f = x - i; return phiTab[i] * (1 - f) + phiTab[Math.min(i + 1, phiTab.length - 1)] * f; };
    // 雨势
    const rainI = t => (t < C.rainStart ? 0 : table([
      [C.rainStart, 0.05], [C.rainStart + 1.2, 0.14], [C.rainFull - 0.4, 0.45], [C.rainFull + 0.8, 1.0],
      [C.rainThin, 0.95], [C.rainThin + 2.5, 0.45], [C.rainEnd - 0.6, 0.12], [C.rainEnd, 0.02], [C.rainEnd + 0.5, 0]
    ], t) * (0.92 + 0.08 * Math.sin(TAU * t / 3.7)));

    // ───────────────────── 风：沙漠在呼吸 ─────────────────────
    (function wind() {
      const r = R('wind');
      const a0 = 0, a1 = END;
      const main = loopSrc(pinkA, a0, a1, r);
      if (!main) return;
      const bp = filt('bandpass', 400, 1.1), g = gainN(0), p = panN(0);
      chain(main, bp, g, p, sfxBus);
      curve(bp.frequency, t => 240 + 950 * Math.pow(gWind(t), 1.2), a0, a1, 30);
      curve(g.gain, t => MIX.wind * windArc(t) * Math.pow(gWind(t), 1.4) * duck(t) * openIn(t), a0, a1, 30);
      curve(p.pan, t => clamp(gustAt(t).pan, -0.9, 0.9), a0, a1, 30);
      // 低沉的风体
      const body = loopSrc(brown, a0, a1, r), lp = filt('lowpass', 250, 0), gb = gainN(0);
      chain(body, lp, gb, sfxBus);
      curve(lp.frequency, t => 140 + 300 * gWind(t), a0, a1, 20);
      curve(gb.gain, t => MIX.windBody * windArc(t) * gWind(t) * duck(t) * openIn(t), a0, a1, 20);
      // 宽度层：另一路去相关噪声，反向声像
      const wsrc = loopSrc(pinkB, a0, a1, r), bp2 = filt('bandpass', 900, 0.7), g2 = gainN(0), p2 = panN(0);
      chain(wsrc, bp2, g2, p2, sfxBus);
      curve(bp2.frequency, t => 600 + 1500 * gWind(t), a0, a1, 20);
      curve(g2.gain, t => MIX.windWidth * windArc(t) * Math.pow(gWind(t), 1.6) * duck(t) * openIn(t), a0, a1, 20);
      curve(p2.pan, t => clamp(-0.55 * gustAt(t).pan + 0.15 * Math.sin(TAU * t / 9), -0.9, 0.9), a0, a1, 20);
      // 阵风顶端的空腔哨音（高 Q 带通，极轻）
      const wh = loopSrc(pinkA, a0, a1, r), bp3 = filt('bandpass', 700, 9), g3 = gainN(0), p3 = panN(0);
      chain(wh, bp3, g3, p3, sfxBus);
      curve(bp3.frequency, t => 520 + 700 * gWind(t), a0, a1, 30);
      curve(g3.gain, t => MIX.whistle * windArc(t) * Math.pow(Math.max(0, gWind(t) - 0.42), 1.6) * duck(t), a0, a1, 30);
      curve(p3.pan, t => clamp(gustAt(t).pan * 1.1, -0.95, 0.95), a0, a1, 30);
      // 风卷细沙的嘶嘶声（只在干旱段）
      const ss = loopSrc(sandTex, a0, C.vaporEnd, r), hp = filt('bandpass', 5000, 0.5), g4 = gainN(0), p4 = panN(0);
      if (ss) {
        chain(ss, hp, g4, p4, sfxBus);
        curve(g4.gain, t => MIX.sandHiss * Math.pow(gWind(t), 2) * (1 - sstep(C.lotusOpen, C.cloudGrow + 2, t)) * openIn(t), a0, C.vaporEnd, 30);
        curve(p4.pan, t => clamp(gustAt(t).pan, -0.9, 0.9), a0, C.vaporEnd, 30);
      }
    })();

    // ───────────────────── 起：沙狐嗅枯根的沙粒窸窣 ─────────────────────
    (function sniffRustle() {
      const r = R('sniff');
      const ft0 = C.foxSniff, ft1 = C.gust + 0.5;
      const bumps = [];
      let t = ft0 + 0.3;
      while (t < ft1 - 0.5) { bumps.push([t, 0.4 + 0.6 * r(), 0.12 + 0.25 * r()]); t += 0.35 + r() * 1.1; }
      const s = loopSrc(sandTex, ft0, ft1, r);
      if (!s) return;
      const bp = filt('bandpass', 3200, 0.8), g = gainN(0);
      chain(s, bp, g, panN(-0.15), sfxBus);
      curve(g.gain, tt => {
        let v = 0;
        for (const [bt, a, d] of bumps) { const x = tt - bt; if (x > 0 && x < d * 6) v += a * (x < 0.03 ? x / 0.03 : Math.exp(-(x - 0.03) / d)); }
        return MIX.sniff * v;
      }, ft0, ft1, 120);
    })();

    // ───────────────────── 承：帆布鼓动 ─────────────────────
    (function sailFlap() {
      const r = R('flap'), t = C.sailFlap;
      burst(brown, t, { type: 'lowpass', f0: 520, f1: 160, Q: 2, att: 0.025, dec: 0.14, peak: MIX.flap, pan: -0.1 }, r);
      burst(brown, t + 0.17, { type: 'lowpass', f0: 380, f1: 140, Q: 1, att: 0.03, dec: 0.12, peak: MIX.flap * 0.5, pan: 0.05 }, r);
      // 布料抖动的细碎扑簌
      const s = loopSrc(pinkB, t - 0.05, t + 1.2, r);
      if (s) {
        const bp = filt('bandpass', 900, 1.0), g = gainN(0);
        chain(s, bp, g, panN(0.1), sfxBus);
        curve(g.gain, tt => { const x = tt - t; if (x < 0) return 0; return MIX.flap * 0.22 * Math.min(1, x / 0.02) * Math.exp(-x / 0.25) * (0.55 + 0.45 * Math.sin(TAU * 17 * x)); }, t - 0.05, t + 1.2, 200);
      }
    })();

    // ───────────────────── 齿轮：咬合 / 回退 / 再咬合 ─────────────────────
    function clankBuffer(seed, f0, heavy) {
      const r = mulberry32(seed), n = Math.floor(3.2 * sr), d = new Float32Array(n);
      const ratios = [1, 1.52, 2.11, 2.67, 3.43, 4.18, 5.07, 6.31, 7.9, 10.4, 13.1];
      ratios.forEach((q, k) => {
        const f = f0 * q * (1 + (r() - 0.5) * 0.02); if (f > 8000) return;
        addPartial(d, 0, f, 0.5 / (1 + 0.45 * k), 1.9 * heavy / (1 + 0.5 * k), 0);
      });
      // 齿牙逐个落位 “咔—”
      const hits = [0, 0.045, 0.1, 0.17, 0.27, 0.39];
      hits.forEach((ht, h) => {
        const i0 = Math.floor(ht * sr), a = 1 / (1 + h * 0.9);
        let y = 0;
        for (let j = 0; j < 0.006 * sr; j++) { y += 0.3 * ((r() * 2 - 1) - y); d[i0 + j] += a * 0.7 * y * Math.exp(-j / (0.0015 * sr)); }
        [1, 1.37, 2.03, 2.71, 3.6].forEach((q, k) => addPartial(d, i0, 410 * q * (1 + 0.03 * h), a * 0.12 / (1 + k * 0.6), 0.09 / (1 + k * 0.3), r() * TAU * 0));
      });
      // 刮擦
      const sc = new Float32Array(Math.floor(0.6 * sr));
      for (let j = 0; j < sc.length; j++) { const x = j / sr; sc[j] = (r() * 2 - 1) * Math.min(1, x / 0.02) * Math.exp(-x / 0.18); }
      const scOut = new Float32Array(sc.length);
      resonate(sc, 900, 0.03, 0.4, scOut); resonate(sc, 1730, 0.02, 0.25, scOut); resonate(sc, 2650, 0.015, 0.12, scOut);
      for (let j = 0; j < sc.length; j++) d[j + Math.floor(0.02 * sr)] += scOut[j] * 0.5;
      // 低频撞击：下滑的次声 + 闷响
      let ph = 0;
      for (let j = 0; j < 0.9 * sr; j++) {
        const x = j / sr, f = 38 + 18 * Math.exp(-x / 0.08);
        ph += TAU * f / sr;
        d[j] += 0.9 * heavy * Math.sin(ph) * Math.min(1, x / 0.004) * Math.exp(-x / 0.26);
      }
      let y = 0;
      for (let j = 0; j < 0.4 * sr; j++) { y += 0.02 * ((r() * 2 - 1) - y); d[j] += 6 * y * Math.exp(-j / (0.09 * sr)); }
      for (let j = 0; j < 64; j++) d[j] *= j / 64;
      onePoleHP(d, 28); normPeak(d, 0.9);
      return toBuf([d]);
    }
    function stickSlip(len, seed, rateFn, ampFn, modes, noise) {
      const r = mulberry32(seed), n = Math.floor(len * sr), ex = new Float32Array(n), out = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += rateFn(t) / sr;
        if (ph >= 1) { ph -= 1 + (r() - 0.5) * 0.2; ex[i] += ampFn(t) * (0.6 + 0.8 * r()); }
        ex[i] += (r() * 2 - 1) * noise * ampFn(t);
      }
      for (const [f, tau, g] of modes) resonate(ex, f, tau, g, out);
      onePoleHP(out, 35); normPeak(out, 0.9);
      return out;
    }
    (function gears() {
      const clank1 = clankBuffer(4242, 58, 1.0), clank2 = clankBuffer(4343, 63, 0.85);
      shot(clank1, C.gearJerk1, { gain: MIX.gear, pan: 0.05, lp: 6000, dest: sfxBus });
      shot(clank1, C.gearJerk1 + 0.01, { gain: MIX.gear * 0.5, pan: 0.05, lp: 3000, dest: farBus });
      // 回退：短促吱嘎（下滑的摩擦）+ 一记小撞
      const slip = stickSlip(0.55, 777, t => 150 - 90 * t, t => Math.min(1, t / 0.03) * Math.exp(-t / 0.22),
        [[430, 0.05, 1], [690, 0.04, 0.8], [1020, 0.035, 0.6], [1480, 0.03, 0.45], [2150, 0.02, 0.3], [180, 0.08, 0.5]], 0.05);
      shot(toBuf([slip]), C.gearSlip, { gain: MIX.slip, pan: 0.15, lp: 5000 });
      burst(brown, C.gearSlip + 0.42, { type: 'lowpass', f0: 300, Q: 1, att: 0.006, dec: 0.08, peak: MIX.slip * 1.2, pan: 0.1 });
      shot(clank2, C.gearJerk2, { gain: MIX.gear * 0.9, pan: -0.05, lp: 6000 });
      shot(clank2, C.gearJerk2 + 0.01, { gain: MIX.gear * 0.45, pan: -0.05, lp: 3000, dest: farBus });
    })();

    // ───────────────────── 古老转轴的摩擦低鸣 → 渐顺渐轻 ─────────────────────
    (function rotorGroan() {
      const g0 = C.rotorStart, g1 = C.rotorStart + 21;
      if (g1 <= offset) return;
      const r = mulberry32(31337), n = Math.floor((g1 - g0) * sr);
      const ex = new Float32Array(n), out = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = g0 + i / sr, s = rotSpeed(t) / 0.25;
        const rate = 9 + 40 * s + 5 * Math.sin(TAU * phiAt(t));
        ph += rate / sr;
        if (ph >= 1) { ph -= 1 + (r() - 0.5) * 0.3 * (1 - 0.7 * s); ex[i] += (0.6 + 0.8 * r()) * (1 - 0.5 * s); }
        ex[i] += (r() * 2 - 1) * (0.05 + 0.08 * s);
      }
      [[68, 0.35, 1], [109, 0.3, 0.8], [157, 0.25, 0.7], [231, 0.2, 0.55], [322, 0.16, 0.42], [447, 0.12, 0.32], [633, 0.08, 0.2], [905, 0.05, 0.1]]
        .forEach(([f, tau, g]) => resonate(ex, f, tau, g, out));
      // 一条缓慢滑动的“呻吟”共振（每 64 样点更新系数）
      let y1 = 0, y2 = 0;
      for (let i = 0; i < n; i += 64) {
        const t = g0 + i / sr, ph2 = phiAt(t);
        const f = 92 + 26 * Math.sin(TAU * ph2 + 0.6) + 34 * (rotSpeed(t) / 0.25);
        const w = TAU * f / sr, rr = Math.exp(-1 / (0.5 * sr)), b1 = 2 * rr * Math.cos(w), b2 = -rr * rr, gg = 1.6 * (1 - rr) * 2 * Math.sin(w);
        for (let j = i; j < Math.min(n, i + 64); j++) { const y = ex[j] * gg + b1 * y1 + b2 * y2; y2 = y1; y1 = y; out[j] += y; }
      }
      for (let i = 0; i < n; i++) {
        const t = g0 + i / sr;
        out[i] *= 0.5 + 0.5 * Math.pow(Math.sin(Math.PI * (phiAt(t) + 0.2)), 2);
      }
      onePoleHP(out, 40); onePoleLP(out, 2500); normPeak(out, 0.9);
      for (let i = 0; i < 600; i++) out[i] *= i / 600;
      const buf = toBuf([out]);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const g = gainN(0), lp = filt('lowpass', 1500, -1);
      chain(s, lp, g, panN(0.08), sfxBus);
      const st = Math.max(g0, offset);
      s.start(T(st), st - g0); live.push(s);
      curve(g.gain, t => MIX.groan * sstep(g0, g0 + 0.4, t) * (1 - 0.85 * sstep(g0 + 4, g0 + 17, t)) * (1 - sstep(g0 + 17, g1 - 0.2, t)) * duck(t), g0, g1, 30);
      curve(lp.frequency, t => 900 + 1500 * (rotSpeed(t) / 0.25), g0, g1, 10);
      // 塔身低沉的运转底噪（极轻、干净）
      const rb = loopSrc(brown, g0, END, r);
      if (rb) {
        const bp = filt('bandpass', 85, 1.2), gr = gainN(0);
        chain(rb, bp, gr, sfxBus);
        curve(gr.gain, t => MIX.rumble * (rotSpeed(t) / 0.25) * (0.75 + 0.25 * Math.sin(TAU * phiAt(t) * 6)) * duck(t), g0, END, 30);
      }
    })();

    // ───────────────────── 风车扇叶掠风 “呼—呼—”（六片帆翼） ─────────────────────
    (function blades() {
      const r = R('blades'), a0 = C.rotorStart, a1 = END;
      const blade = t => { const x = (phiAt(t) * 6) % 1; return Math.exp(-Math.pow((x - 0.5) / 0.17, 2)); };
      const amt = t => Math.pow(rotSpeed(t) / 0.25, 1.5) * table([[a0, 1], [50, 1], [C.rainFull, 0.75], [C.rainEnd, 0.8], [END, 0.85]], t) * duck(t);
      const s = loopSrc(pinkB, a0, a1, r);
      if (!s) return;
      const bp = filt('bandpass', 500, 1.4), g = gainN(0), p = panN(0);
      chain(s, bp, g, p, sfxBus);
      curve(bp.frequency, t => 380 + 380 * blade(t) + 120 * rotSpeed(t) / 0.25, a0, a1, 60);
      curve(g.gain, t => MIX.swoosh * amt(t) * (0.08 + blade(t)), a0, a1, 60);
      curve(p.pan, t => 0.25 * Math.sin(TAU * phiAt(t)), a0, a1, 30);
      const s2 = loopSrc(brown, a0, a1, r), lp = filt('lowpass', 300, 0), g2 = gainN(0);
      chain(s2, lp, g2, sfxBus);
      curve(g2.gain, t => MIX.swoosh * 0.8 * amt(t) * blade(t), a0, a1, 60);
    })();

    // ───────────────────── 沙土震落：细沙流泻 + 小块落沙 ─────────────────────
    (function sandPour() {
      const r = R('pour'), a0 = C.gearJerk1 + 0.3, a1 = C.foxJump + 0.4;
      const env = t => sstep(a0, a0 + 0.7, t) * (0.7 + 0.3 * sstep(C.gearJerk2, C.gearJerk2 + 0.4, t)) * (1 - sstep(C.rotorStart + 0.3, a1, t));
      [[-0.3, 2200, 0], [0.35, 1500, 0.4]].forEach(([pan, f, dl], k) => {
        const s = loopSrc(sandTex, a0, a1, r, 0.8 + 0.1 * k);
        if (!s) return;
        const bp = filt('bandpass', f, 0.6), g = gainN(0);
        chain(s, bp, g, panN(pan), sfxBus);
        curve(g.gain, t => MIX.pour * env(t - dl) * (0.8 + 0.2 * Math.sin(TAU * t * 1.3 + k)), a0, a1, 30);
      });
      [0.9, 1.5, 2.2, 2.8].forEach((dt, i) => burst(brown, C.gearJerk1 + dt, { type: 'lowpass', f0: 420, Q: 0, att: 0.01, dec: 0.06, peak: MIX.pour * 0.7, pan: (i % 2 ? 0.3 : -0.25) }, r));
    })();

    // ───────────────────── 小爪踏沙 ─────────────────────
    (function paws() {
      const r = R('paws');
      [C.foxJump, C.foxJump + 0.6, C.foxJump + 1.2, C.foxLand].forEach((t, i) => {
        const pan = -0.3 + 0.2 * i;
        burst(sandTex, t, { type: 'bandpass', f0: 2300, Q: 0.9, att: 0.004, dec: 0.05, peak: MIX.paw, pan }, r);
        burst(sandTex, t + 0.035, { type: 'bandpass', f0: 1800, Q: 0.9, att: 0.004, dec: 0.04, peak: MIX.paw * 0.6, pan: pan + 0.05 }, r);
        burst(brown, t, { type: 'lowpass', f0: 260, Q: 0, att: 0.004, dec: 0.035, peak: MIX.paw * 1.2, pan }, r);
      });
    })();

    // ───────────────────── 转：黄铜花瓣绽开（金属延展 + 摩擦滑移）、蒸汽嘶声 ─────────────────────
    (function lotus() {
      const r = R('lotus');
      const brass = [[300, 0.12, 1], [470, 0.1, 0.8], [730, 0.08, 0.6], [1100, 0.06, 0.45], [1650, 0.04, 0.3], [2450, 0.03, 0.18]];
      const creaks = [0, 1, 2].map(k => toBuf([stickSlip(1.5, 900 + k, t => 20 + 22 * Math.sin(Math.PI * t / 1.5) + 6 * k, t => sstep(0, 0.3, t) * (1 - sstep(0.9, 1.5, t)), brass, 0.04)]));
      [0, 0.85, 1.7, 2.6, 3.5, 4.3].forEach((dt, i) => {
        const t = C.lotusOpen + dt;
        shot(creaks[i % 3], t, { gain: MIX.lotus * (1 - i * 0.08), pan: (r() - 0.5) * 1.0, rate: 0.85 + r() * 0.3, lp: 3200, dest: i % 2 ? farBus : sfxBus });
        burst(pinkA, t + 0.1, { type: 'bandpass', f0: 900, f1: 1700, Q: 2, att: 0.25, dec: 0.3, peak: MIX.slide, pan: (r() - 0.5) * 0.8 }, r);
      });
      // 蒸汽嘶声渐起（并入水汽）
      const a0 = C.lotusOpen + 1, a1 = C.vaporEnd + 0.5;
      const s = loopSrc(pinkB, a0, a1, r);
      if (s) {
        const hp = filt('highpass', 2200, -1), bp = filt('bandpass', 4200, 0.6), g = gainN(0);
        chain(s, hp, bp, g, panN(0.1), sfxBus);
        curve(g.gain, t => MIX.hiss * sstep(a0, C.vaporStart + 0.2, t) * (1 - sstep(C.firstDrop - 3, C.vaporEnd, t)) * (0.85 + 0.15 * Math.sin(TAU * t / 2.3)) * duck(t), a0, a1, 30);
        curve(bp.frequency, t => 3800 + 900 * Math.sin(TAU * t / 5.1), a0, a1, 10);
      }
    })();

    // ───────────────────── 水汽喷涌 ─────────────────────
    (function vapor() {
      const r = R('vapor'), a0 = C.vaporStart - 0.3, a1 = C.vaporEnd + 0.5;
      const env = t => sstep(C.vaporStart - 0.2, C.vaporStart + 1.2, t) * (0.85 + 0.15 * Math.sin(TAU * t / 3.3) + 0.25 * gustAt(t).e) * (1 - sstep(C.firstDrop - 1.5, C.vaporEnd, t)) * duck(t);
      [[pinkA, -0.35, 0], [pinkB, 0.35, 1.7]].forEach(([buf, pan, ph]) => {
        const s = loopSrc(buf, a0, a1, r);
        if (!s) return;
        const bp = filt('bandpass', 900, 0.8), g = gainN(0);
        chain(s, bp, g, panN(pan), sfxBus);
        curve(bp.frequency, t => 700 + 450 * Math.sin(TAU * t / 6.7 + ph) + 400 * gustAt(t).e, a0, a1, 20);
        curve(g.gain, t => MIX.vapor * env(t), a0, a1, 30);
      });
      burst(brown, C.vaporStart, { type: 'lowpass', f0: 200, f1: 700, Q: 1, att: 0.35, dec: 0.7, peak: MIX.vapor, pan: 0 }, r);
    })();

    // ───────────────────── 远处闷雷（很低、很柔） ─────────────────────
    (function thunder() {
      const r = R('thunder');
      const roll = (ts, dur, bumps, peak, f) => {
        const s = loopSrc(brown, ts, ts + dur, r);
        if (!s) return;
        const lp = filt('lowpass', f, 0), g = gainN(0);
        chain(s, lp, g, panN(-0.35), farBus);
        curve(g.gain, t => { let v = 0; for (const [bt, a] of bumps) { const x = t - ts - bt; if (x > 0) v += a * (x < 0.35 ? smooth(x / 0.35) : Math.exp(-(x - 0.35) / 0.55)); } return peak * v * (1 - sstep(ts + dur - 0.5, ts + dur, t)); }, ts, ts + dur, 60);
        curve(lp.frequency, t => f * (0.7 + 0.3 * Math.sin(TAU * (t - ts) / 1.7)), ts, ts + dur, 20);
      };
      roll(C.beams - 0.3, C.firstDrop - 1.2 - (C.beams - 0.3), [[0, 0.6], [0.55, 1], [1.2, 0.7], [1.75, 0.45]], MIX.thunder, 210);
      roll(C.rainStart + 0.6, 3.8, [[0, 0.5], [0.7, 0.4], [1.5, 0.25]], MIX.thunder * 0.6, 150);
    })();

    // ───────────────────── 雨滴素材 ─────────────────────
    function dropBuf(seed, kind, f0) {
      const r = mulberry32(seed);
      const len = kind === 'puddle' ? 0.25 : kind === 'metal' ? 0.3 : kind === 'first' ? 0.32 : 0.15;
      const n = Math.floor(len * sr), d = new Float32Array(n);
      // 撞击瞬态
      let y = 0;
      for (let j = 0; j < 0.003 * sr; j++) { y += 0.5 * ((r() * 2 - 1) - y); d[j] += (kind === 'first' ? 0.06 : 0.35) * y * Math.exp(-j / (0.0008 * sr)); }
      if (kind === 'first') {
        // 水滴落在湿润的鼻头上：先是一下很轻的闷“噗”（低通噪声），再带出一个低而短的水音，最后一粒更小的回弹
        let lp1 = 0, lp2 = 0;
        for (let j = 0; j < 0.05 * sr; j++) { const x = j / sr; lp1 += 0.07 * ((r() * 2 - 1) - lp1); lp2 += 0.07 * (lp1 - lp2); d[j] += 5.5 * lp2 * Math.min(1, x / 0.002) * Math.exp(-x / 0.011); }
        const voice = (t0, f, amp, tau, gl) => { let ph = 0; const st = Math.floor(t0 * sr); for (let j = st; j < n; j++) { const x = (j - st) / sr, ff = f * (1 + gl * (1 - Math.exp(-x / 0.02))); ph += TAU * ff / sr; d[j] += amp * (Math.sin(ph) + 0.22 * Math.sin(ph * 2.01)) * Math.min(1, x / 0.005) * Math.exp(-x / tau); } };
        voice(0.004, f0, 0.3, 0.03, -0.24);
        voice(0.098, f0 * 1.42, 0.07, 0.016, 0.2);
      } else if (kind === 'plink' || kind === 'puddle') {
        const tau = kind === 'puddle' ? 0.06 : kind === 'first' ? 0.028 : 0.012 + 0.018 * r();
        const glide = kind === 'first' ? -0.42 : 0.55;   // 气泡上滑 / 鼻尖“嗒”下滑
        const gt = kind === 'first' ? 0.03 : 0.01;
        let ph = 0;
        const start = Math.floor(0.001 * sr);
        for (let j = start; j < n; j++) {
          const x = (j - start) / sr, f = f0 * (1 + glide * (1 - Math.exp(-x / gt)));
          ph += TAU * f / sr;
          d[j] += 0.8 * Math.sin(ph) * Math.min(1, x / 0.0015) * Math.exp(-x / tau);
        }
        if (kind === 'puddle') { let b = 0; for (let j = 0; j < 0.08 * sr; j++) { b += 0.03 * ((r() * 2 - 1) - b); d[j] += 4 * b * Math.exp(-j / (0.02 * sr)); } }
      } else if (kind === 'tap') {
        const ex = new Float32Array(n);
        for (let j = 0; j < 0.004 * sr; j++) ex[j] = (r() * 2 - 1) * Math.exp(-j / (0.001 * sr));
        resonate(ex, f0, 0.006, 1, d); resonate(ex, f0 * 1.63, 0.004, 0.6, d);
      } else if (kind === 'metal') {
        [1, 1.58, 2.24, 2.93, 3.81].forEach((q, k) => addPartial(d, 2, f0 * q * (1 + (r() - 0.5) * 0.03), 0.25 / (1 + k), (0.04 + 0.06 * r()) / (1 + 0.3 * k), 0));
      }
      for (let j = n - 400; j < n; j++) d[j] *= (n - j) / 400;
      onePoleLP(d, kind === 'metal' ? 6500 : 8000); normPeak(d, 0.9);
      return toBuf([d]);
    }
    const rdr = mulberry32(2024);
    const plinks = [], taps = [], metals = [], puddles = [];
    for (let i = 0; i < 10; i++) plinks.push(dropBuf(100 + i, 'plink', 1300 + 1900 * rdr()));
    for (let i = 0; i < 8; i++) taps.push(dropBuf(200 + i, 'tap', 1400 + 2600 * rdr()));
    for (let i = 0; i < 5; i++) metals.push(dropBuf(300 + i, 'metal', 2100 + 1200 * rdr()));
    for (let i = 0; i < 5; i++) puddles.push(dropBuf(400 + i, 'puddle', 300 + 260 * rdr()));
    const firstDropBuf = dropBuf(77, 'first', 640);

    // 第一滴雨 — 鼻尖上的“嗒”
    shot(firstDropBuf, C.firstDrop, { gain: MIX.drop1, pan: 0.05 });

    // ───────────────────── 雨：远处沙沙 + 中层淅沥 + 近处雨滴 + 金属滴答 + 积水“咚” ─────────────────────
    const rainBus = gainN(1); chain(rainBus, filt('lowpass', 7500, -1), sfxBus);
    (function rainBeds() {
      const r = R('rain'), a0 = C.rainStart - 0.1, a1 = C.rainEnd + 0.8;
      [[pinkA, -0.65], [pinkB, 0.65]].forEach(([buf, pan], k) => {
        const s = loopSrc(buf, a0, a1, r);
        if (!s) return;
        const hp = filt('highpass', 1800, -1), bp = filt('bandpass', 5500, 0.6), g = gainN(0);
        chain(s, hp, bp, g, panN(pan), rainBus);
        curve(bp.frequency, t => 5200 + 900 * Math.sin(TAU * t / (7 + k * 2.3)), a0, a1, 10);
        curve(g.gain, t => MIX.rainFar * Math.pow(rainI(t), 1.2), a0, a1, 30);
      });
      const pt = loopSrc(patterTex, a0, a1, r);
      if (pt) {
        const bp = filt('bandpass', 2400, 0.5), g = gainN(0);
        chain(pt, bp, g, rainBus);
        curve(bp.frequency, t => 2100 + 600 * Math.sin(TAU * t / 5.3), a0, a1, 10);
        curve(g.gain, t => MIX.rainPatter * Math.pow(rainI(t), 1.1), a0, a1, 30);
      }
      const bd = loopSrc(brown, a0, a1, r);
      if (bd) {
        const lp = filt('lowpass', 500, -1), hp = filt('highpass', 90, -1), g = gainN(0);
        chain(bd, lp, hp, g, rainBus);
        curve(g.gain, t => MIX.rainBody * Math.pow(rainI(t), 1.5), a0, a1, 30);
      }
    })();
    (function rainDrops() {
      const r = R('drops');
      const poisson = (ft0, ft1, lamMax, lamFn, fn) => {
        let t = ft0;
        for (;;) {
          t += -Math.log(1 - r()) / lamMax;
          if (t >= ft1) break;
          if (r() * lamMax < lamFn(t)) fn(t);
          else { r(); r(); r(); }
        }
      };
      const rs = C.rainStart, re = C.rainEnd;
      // 近处雨滴（稀疏开始时更清晰、更“近”）
      poisson(rs, re + 0.3, 24, t => (rainI(t) > 0.001 ? 1.5 + 20 * rainI(t) : 0), t => {
        const I = rainI(t), sparse = 1 - sstep(C.rainFull - 0.5, C.rainFull + 1, t);
        const isPlink = r() < 0.45;
        const arr = isPlink ? plinks : taps;
        const b = arr[Math.floor(r() * arr.length)];
        const g = MIX.dropNear * (0.25 + 0.75 * r() * r()) * (0.6 + 0.6 * sparse) * (isPlink ? 0.7 : 1) * (0.5 + 0.5 * Math.min(1, I * 3));
        shot(b, t, { gain: g, pan: (r() * 2 - 1) * 0.9, rate: 0.8 + r() * 0.45, dest: rainBus });
      });
      // 落在金属塔身上的清脆滴答（少量、短、柔）
      poisson(rs + 0.5, re, 3, t => 0.3 + 2.2 * rainI(t), t => {
        const b = metals[Math.floor(r() * metals.length)];
        shot(b, t, { gain: MIX.metal * (0.4 + 0.6 * r()), pan: -0.1 + (r() - 0.5) * 0.5, rate: 0.85 + r() * 0.3, dest: rainBus });
      });
      // 积水里的“咚”
      poisson(C.wetStart, re + 0.2, 2, t => 0.2 + 1.4 * rainI(t), t => {
        const b = puddles[Math.floor(r() * puddles.length)];
        shot(b, t, { gain: MIX.puddle * (0.4 + 0.6 * r()), pan: (r() * 2 - 1) * 0.7, rate: 0.85 + r() * 0.35, dest: rainBus });
      });
      // 雨停后的滴水（叶尖、塔檐、积水）
      poisson(re - 0.5, END - 1.2, 3.2, t => 0.35 + 2.8 * Math.exp(-(t - re) / 3.5), t => {
        const k = r();
        const arr = k < 0.5 ? plinks : k < 0.8 ? puddles : k < 0.93 ? taps : metals;
        const b = arr[Math.floor(r() * arr.length)];
        const dim = 1 - 0.5 * sstep(re, END, t);
        shot(b, t, { gain: MIX.drip * dim * (0.35 + 0.65 * r()) * (arr === metals ? 0.25 : 1), pan: (r() * 2 - 1) * 0.8, rate: 0.85 + r() * 0.3, dest: rainBus });
      });
    })();

    // ───────────────────── 合：草叶沙沙 ─────────────────────
    (function leaves() {
      const r = R('leaves'), a0 = C.sprout - 1, a1 = END;
      const s = loopSrc(leafTex, a0, a1, r);
      if (!s) return;
      const bp = filt('bandpass', 2600, 0.5), g = gainN(0), p = panN(0);
      chain(s, bp, g, p, sfxBus);
      curve(g.gain, t => MIX.leaves * sstep(a0, C.sprout + 5, t) * (0.6 + 0.4 * sstep(C.rainEnd - 1, C.rainEnd + 2, t)) * (0.2 + 1.3 * gustAt(t).e + 0.1 * breath(t)), a0, a1, 30);
      curve(p.pan, t => clamp(0.7 * gustAt(t).pan, -0.8, 0.8), a0, a1, 20);
    })();

    // ───────────────────── 乐器 ─────────────────────
    const pnoBus = gainN(1), strBus = gainN(1), wwBus = gainN(1);
    pnoBus.connect(musicBus); strBus.connect(musicBus); wwBus.connect(musicBus);
    const wr = mulberry32(555);
    function wave(fn, N) {
      const re = new Float32Array(N + 1), im = new Float32Array(N + 1);
      for (let k = 1; k <= N; k++) im[k] = fn(k);
      return ctx.createPeriodicWave(re, im);
    }
    const bowA = wave(k => Math.pow(k, -1.05) * (0.75 + 0.5 * wr()), 40);
    const bowB = wave(k => Math.pow(k, -1.1) * (0.7 + 0.6 * wr()) * (k % 2 ? 1 : -1), 40);
    const clarW = wave(k => (k % 2 ? Math.pow(k, -0.85) : 0.07 / k) * (0.85 + 0.3 * wr()), 24);
    const fluteW = wave(k => [0, 1, 0.42, 0.18, 0.09, 0.05, 0.03, 0.018, 0.01][k] || 0, 8);
    // 弦乐群共享的三路慢颤音 LFO（调制量，不直出）
    const vib = [5.1, 5.55, 4.8].map((f, i) => {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = gainN(5 + i * 1.2); o.connect(g);
      o.start(T(offset)); o.stop(T(END) + 0.5); live.push(o);
      return g;
    });

    // 毛毡钢琴：每个音高一份采样（非谐分音、双弦拍频、两段衰减、琴槌毡头噪声）
    const pianoCache = {};
    function pianoSample(m) {
      if (pianoCache[m]) return pianoCache[m];
      const f0 = mtof(m), len = m < 50 ? 5.2 : m < 66 ? 4.4 : 3.4, n = Math.floor(len * sr), d = new Float32Array(n);
      const r = mulberry32(1000 + m);
      const B = 0.00022 * Math.pow(2, (m - 48) / 20);
      const tau1 = 2.6 * Math.pow(0.5, (m - 45) / 22) + 0.45;
      for (let k = 1; k <= 14; k++) {
        const fk = f0 * k * Math.sqrt(1 + B * k * k);
        if (fk > 6500) break;
        const amp = Math.pow(k, -1.4) * (0.25 + 0.75 * Math.abs(Math.sin(Math.PI * k * 0.118)));
        const tk = tau1 / (1 + 0.5 * (k - 1));
        if (k <= 3) {
          const cents = 0.7 + r() * 0.9;
          addPartial(d, 0, fk, amp * 0.62, tk * 0.5, 0);
          addPartial(d, 0, fk * Math.pow(2, cents / 1200), amp * 0.38, tk * 1.9, 0);
        } else addPartial(d, 0, fk, amp, tk * 0.6, 0);
      }
      // 毡头琴槌：柔软的噪声瞬态 + 低沉木质敲击
      let y = 0;
      const hc = Math.min(0.5, 0.06 + f0 / 6000);
      for (let j = 0; j < 0.035 * sr; j++) {
        y += hc * ((r() * 2 - 1) - y);
        d[j] += 0.16 * y * (1 - Math.exp(-j / (0.0006 * sr))) * Math.exp(-j / (0.006 * sr));
      }
      addPartial(d, 0, 105 + r() * 20, 0.03, 0.025, 0);
      for (let j = 0; j < 0.002 * sr; j++) d[j] *= j / (0.002 * sr);
      for (let j = n - 2000; j < n; j++) d[j] *= (n - j) / 2000;
      normPeak(d, 0.6);
      return (pianoCache[m] = toBuf([d]));
    }

    function playPiano(nt) {
      const t = T(nt.t), e = T(nt.e), v = nt.v;
      const s = ctx.createBufferSource(); s.buffer = pianoSample(nt.m);
      const lp = filt('lowpass', 1000, -2);
      const fc0 = (nt.o.dark ? 380 + 1600 * v : 500 + 5200 * Math.pow(v, 1.5)) * (0.8 + 0.4 * clamp((nt.m - 40) / 50, 0, 1));
      lp.frequency.setValueAtTime(fc0, t);
      lp.frequency.setTargetAtTime(fc0 * 0.45 + 250, t + 0.01, 0.7);
      const g = gainN(0), amp = LV.pno * Math.pow(v, 1.5);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.004);
      g.gain.setValueAtTime(amp, e); g.gain.setTargetAtTime(0, e, 0.18);
      chain(s, lp, g, panN((nt.m - 62) / 70 + nt.jp), pnoBus);
      s.start(t); s.stop(Math.min(e + 1.5, t + s.buffer.duration)); live.push(s);
    }

    function playStrings(nt) {
      const f = mtof(nt.m), v = nt.v, lo = nt.m < 48;
      let ft = nt.t, att = nt.o.att !== undefined ? nt.o.att : (0.18 + 0.45 * (1 - v)) * (lo ? 1.5 : 1);
      if (ft < offset) { att = Math.min(att, 0.8); ft = offset; }
      const t = T(ft), e = T(nt.e), rel = nt.o.rel || (lo ? 0.9 : 0.6);
      const amp = LV.str * Math.pow(v, 1.4) * (lo ? 1.25 : 1);
      const fl = filt('lowpass', 800, 0.5);
      const fcPeak = Math.min(9000, f * 2.2 + 600 + 3200 * v * v);
      fl.frequency.setValueAtTime(Math.min(fcPeak, f * 1.1 + 250), t);
      fl.frequency.linearRampToValueAtTime(fcPeak, t + att * 1.2);
      fl.frequency.setTargetAtTime(fcPeak * 0.78, t + att * 1.2, 1.5);
      fl.frequency.setTargetAtTime(f * 1.2 + 300, e, rel * 0.5);
      const g = gainN(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + att);
      if (nt.o.fadeFrom !== undefined) {
        const fs = Math.max(T(nt.o.fadeFrom), t + att);
        if (fs < e) { g.gain.setValueAtTime(amp, fs); g.gain.linearRampToValueAtTime(amp * nt.o.fadeTo, e); }
      } else if (e - t - att > 0.6) g.gain.linearRampToValueAtTime(amp * 1.07, (t + att + e) / 2);
      g.gain.setTargetAtTime(0, e, rel / 3);
      chain(fl, g, panN((64 - nt.m) / 70 + nt.jp), strBus);
      const stopAt = e + rel * 3;
      const dets = [-8, 0.5, 7.5];
      const r = nt.r;
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator(); o.setPeriodicWave(i % 2 ? bowB : bowA); o.frequency.value = f;
        const d0 = dets[i] + (r() - 0.5) * 4;
        o.detune.setValueAtTime(d0, t); o.detune.linearRampToValueAtTime(d0 + (r() - 0.5) * 5, e);
        vib[i].connect(o.detune);
        o.connect(fl); o.start(t); o.stop(stopAt); live.push(o);
      }
      // 弓毛摩擦噪声
      const ns = ctx.createBufferSource(); ns.buffer = r() < 0.5 ? pinkA : pinkB; ns.loop = true;
      const bp = filt('bandpass', Math.min(7000, f * 3.2), 1.2), gn = gainN(0);
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(3.0, t + att * 0.6); gn.gain.setTargetAtTime(1.0, t + att * 0.6, 0.3); gn.gain.setTargetAtTime(0, e, rel / 3);
      chain(ns, bp, gn, fl);
      ns.start(t, r() * 8); ns.stop(stopAt); live.push(ns);
    }

    function playWind(nt) {
      if (nt.t < offset) return;
      const isFl = nt.inst === 'fl', f = mtof(nt.m), v = nt.v, r = nt.r;
      const t = T(nt.t), e = T(nt.e);
      const att = (isFl ? 0.09 : 0.07) + 0.08 * (1 - v), rel = nt.o.rel || 0.14;
      const amp = LV[nt.inst] * Math.pow(v, 1.3);
      const fl = filt('lowpass', 1000, 0.9);
      fl.frequency.setValueAtTime(f * 1.3, t);
      fl.frequency.linearRampToValueAtTime(Math.min(9000, f * (2.2 + 3.5 * v)), t + att * 1.5);
      fl.frequency.setTargetAtTime(f * 1.2, e, rel / 2);
      const g = gainN(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + att);
      if (nt.o.fadeFrom !== undefined) {
        const fs = Math.max(T(nt.o.fadeFrom), t + att);
        if (fs < e) { g.gain.setValueAtTime(amp, fs); g.gain.linearRampToValueAtTime(amp * nt.o.fadeTo, e); }
      }
      g.gain.setTargetAtTime(0, e, rel / 3);
      chain(fl, g, panN((isFl ? -0.18 : 0.22) + nt.jp), wwBus);
      const stopAt = e + rel * 4;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 4.8 + r() * 0.7;
      const lg = gainN(0);
      lg.gain.setValueAtTime(0, t + 0.25); lg.gain.linearRampToValueAtTime(isFl ? 11 : 6, Math.min(e, t + 0.9));
      lfo.connect(lg); lfo.start(t); lfo.stop(stopAt); live.push(lfo);
      const slide = -(22 + r() * 20);
      [[0, 1], [5, 0.35]].forEach(([dc, lvl]) => {
        const o = ctx.createOscillator(); o.setPeriodicWave(isFl ? fluteW : clarW); o.frequency.value = f;
        o.detune.setValueAtTime(dc + slide, t); o.detune.setTargetAtTime(dc, t, 0.035);
        lg.connect(o.detune);
        const og = gainN(lvl); chain(o, og, fl);
        o.start(t); o.stop(stopAt); live.push(o);
      });
      // 气息噪声
      const ns = ctx.createBufferSource(); ns.buffer = r() < 0.5 ? pinkA : pinkB; ns.loop = true;
      const bp = filt('bandpass', Math.min(8000, f * (isFl ? 1.8 : 2.6)), 0.9), gb = gainN(0);
      gb.gain.setValueAtTime(0, t); gb.gain.linearRampToValueAtTime(2.4, t + 0.025); gb.gain.setTargetAtTime(isFl ? 0.9 : 0.45, t + 0.03, 0.08); gb.gain.setTargetAtTime(0, e, rel / 3);
      chain(ns, bp, gb, fl);
      ns.start(t, r() * 8); ns.stop(stopAt); live.push(ns);
    }

    // —— 乐谱 → 演奏：起音偏移、和弦琶开、力度人性化、连奏重叠 ——
    (function perform() {
      const segs = makeSegments(C), score = writeScore(C), hr = mulberry32(8080);
      const evs = score.map(nt => {
        const sg = segs[nt.seg];
        const jitter = clamp(gauss(hr) * 0.009, -0.022, 0.022);
        const rollStep = nt.o.rollStep || (nt.inst === 'pno' ? 0.014 + hr() * 0.01 : 0.006 + hr() * 0.006);
        const roll = (nt.o.roll || 0) * rollStep;
        const st = segTime(sg, nt.b) + jitter + roll;
        let en = nt.o.endAt ? segTime(segs[nt.o.endAt[0]], nt.o.endAt[1]) : segTime(sg, nt.b + nt.d);
        if (nt.o.legato && nt.inst !== 'pno') en += 0.07;
        en = Math.min(en, END - 0.3);
        return { inst: nt.inst, m: nt.m, t: st, e: Math.max(en, st + 0.08), v: clamp(nt.v * (1 + gauss(hr) * 0.05), 0.05, 1), o: nt.o, jp: (hr() - 0.5) * 0.12, r: mulberry32(Math.floor(hr() * 1e9)) };
      });
      for (const ev of evs) {
        if (ev.e <= offset + 0.05) continue;
        if (ev.inst === 'pno') { if (ev.t >= offset) playPiano(ev); }
        else if (ev.inst === 'str') { if (ev.t >= offset || ev.e - offset > 0.5) playStrings(ev); }
        else playWind(ev);
      }
    })();

    // ───────────────────── 停止 ─────────────────────
    let stopped = false;
    return {
      stop() {
        if (stopped) return;
        stopped = true;
        const now = ctx.currentTime;
        try {
          stopGate.gain.cancelScheduledValues(now);
          stopGate.gain.setValueAtTime(stopGate.gain.value, now);
          stopGate.gain.linearRampToValueAtTime(0, now + 0.25);
        } catch (e) { /* context already closed */ }
        setTimeout(() => {
          for (const s of live) { try { s.stop(); } catch (e) { /* already stopped */ } }
          try { stopGate.disconnect(); } catch (e) { /* already disconnected */ }
        }, 350);
      }
    };
  }

  window.RainAudio = { build };
})();
