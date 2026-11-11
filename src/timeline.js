/* 《荒漠里的造雨塔》 — 共享时间线（画面与声音共用同一份节拍表，单位：秒） */
(function () {
  'use strict';
  const CUES = {
    DUR: 78,
    // —— 起：干涸与沉睡 ——
    open: 0,            // 远景，热浪
    foxSniff: 8,        // 镜头落到塔底阴影，小沙狐嗅枯根
    // —— 承：微风与苏醒 ——
    gust: 16.0,         // 一阵清凉的风掠过沙脊
    earsUp: 17.2,       // 沙狐竖耳
    sailFlap: 19.0,     // 帆布鼓动一下
    gearJerk1: 20.5,    // 齿轮第一次咬合（沉重的“咔”）
    gearSlip: 21.3,     // 回退半格
    gearJerk2: 22.4,    // 第二次咬合
    rotorStart: 23.0,   // 开始极慢地转动，伴随持续的摩擦低鸣
    glowOn: 23.5,       // 琥珀与青蓝微光亮起（到 27s 稳定）
    foxJump: 24.5,      // 沙狐受惊后跃（24.5 / 25.1 / 25.7 三次落地）
    foxLand: 26.3,
    // —— 转：凝云与甘霖 ——
    lotusOpen: 33.0,    // 莲花穹顶开始绽放
    lotusDone: 38.0,
    vaporStart: 36.0,   // 水汽喷涌
    vaporEnd: 53.0,
    cloudGrow: 38.0,    // 积雨云翻涌膨胀
    sunCovered: 46.5,   // 云遮住太阳，光线转暗
    beams: 47.5,        // 丁达尔光束
    firstDrop: 50.8,    // 第一滴雨落在沙狐鼻尖
    rainStart: 51.6,    // 稀疏雨点
    rainFull: 54.0,     // 漫天春雨，配乐高潮
    // —— 合：绿洲与余韵 ——
    wetStart: 53.0,     // 沙地与塔身开始被浸润
    sprout: 57.0,       // 新芽、苔藓、野花
    rainThin: 63.0,     // 雨势渐小
    rainEnd: 67.5,      // 雨停
    sunBack: 65.0,      // 云开日出
    rainbow: 66.0,      // 双彩虹浮现
    foxReturn: 66.5,    // 沙狐跑回草丛
    foxFlower: 71.0,    // 轻嗅花朵
    fadeOut: 74.5,      // 缓缓落幕
    end: 78,
    // 阵风表：[时刻, 强度 0..1]。风从画面左侧吹向右侧，约 900 世界像素/秒
    gusts: [
      [3.5, 0.22], [9.6, 0.18], [13.2, 0.14],
      [16.0, 1.0], [19.0, 0.8], [22.2, 0.5], [27.0, 0.7], [30.6, 0.85],
      [33.5, 0.9], [36.4, 1.0], [39.0, 0.8], [41.8, 1.0], [44.5, 0.9], [47.6, 0.8],
      [50.2, 0.6], [53.4, 0.75], [56.5, 0.6], [59.8, 0.55], [62.6, 0.4],
      [66.0, 0.3], [69.5, 0.35], [72.8, 0.3], [75.5, 0.2]
    ]
  };
  // 春雨是全片高潮：在故事时间 58.4 秒处插入 9.6 秒的新段落（四个“雨润万物”的镜头 + 主题再奏一遍）。
  // 不改变任何播放速度：成片时间 = 故事时间（插入点之后整体后移 9.6 秒）。
  // 画面各模块按“故事时间”写（CUES_STORY）；配乐、导出与播放时钟用“成片时间”（CUES）。
  const INS_AT = 58.4, INS_LEN = 9.6;
  const toFilm = s => (s < INS_AT ? s : s + INS_LEN);
  const FILM = {};
  for (const k in CUES) FILM[k] = typeof CUES[k] === 'number' ? toFilm(CUES[k]) : CUES[k];
  FILM.gusts = CUES.gusts.map(g => [toFilm(g[0]), g[1]]).concat([[60.3, 0.55], [63.5, 0.6], [66.2, 0.5]]).sort((p, q) => p[0] - q[0]);
  FILM.climax2 = CUES.rainFull + INS_LEN;                           // 主题第二遍的起点
  FILM.DUR = FILM.end = CUES.end + INS_LEN;
  FILM.INS_AT = INS_AT; FILM.INS_LEN = INS_LEN; FILM.toFilm = toFilm;
  window.CUES_STORY = CUES;
  window.CUES = FILM;
})();
