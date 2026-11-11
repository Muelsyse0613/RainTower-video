// 离线渲染自检：node tools/audio-check.mjs [--no-wav]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SR = 44100;
const writeWav = !process.argv.includes('--no-wav');
const wantSolo = process.argv.includes('--solo');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required'], protocolTimeout: 600000 });
try {
  const page = await browser.newPage();
  page.on('console', m => console.log('[page]', m.type(), m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('about:blank');
  await page.addScriptTag({ path: path.join(ROOT, 'src/timeline.js') });
  await page.addScriptTag({ path: path.join(ROOT, 'src/audio.js') });

  const res = await page.evaluate(async (SR, DUR, wantWav, wantSolo) => {
    DUR = window.CUES.end;                                           // 成片时长取自时间线
    const out = {};
    async function render(offset, dur) {
      const ctx = new OfflineAudioContext(2, Math.round(dur * SR), SR);
      const b0 = performance.now();
      window.RainAudio.build(ctx, ctx.destination, offset);
      const buildMs = performance.now() - b0;
      const r0 = performance.now();
      const buf = await ctx.startRendering();
      return { buf, buildMs, renderMs: performance.now() - r0 };
    }
    const { buf, buildMs, renderMs } = await render(0, DUR);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    let peak = 0, nan = 0;
    for (let i = 0; i < L.length; i++) {
      const a = L[i], b = R[i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) { nan++; continue; }
      const m = Math.max(Math.abs(a), Math.abs(b)); if (m > peak) peak = m;
    }
    const win = 2 * SR, rms = [];
    for (let s = 0; s < L.length; s += win) {
      let acc = 0, pk = 0, n = 0;
      for (let i = s; i < Math.min(L.length, s + win); i++) { acc += L[i] * L[i] + R[i] * R[i]; n += 2; pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
      rms.push({ t: s / SR, db: 10 * Math.log10(acc / n + 1e-20), pk: 20 * Math.log10(pk + 1e-20) });
    }
    // 细粒度：49–52 秒每 0.25s
    const fine = [];
    for (let t = 48; t < 53; t += 0.25) {
      let acc = 0, n = 0; const s = Math.floor(t * SR);
      for (let i = s; i < s + 0.25 * SR; i++) { acc += L[i] * L[i] + R[i] * R[i]; n += 2; }
      fine.push([t, +(10 * Math.log10(acc / n + 1e-20)).toFixed(1)]);
    }
    let tail = 0;
    for (let i = L.length - Math.round(0.1 * SR); i < L.length; i++) tail = Math.max(tail, Math.abs(L[i]), Math.abs(R[i]));
    Object.assign(out, { buildMs, renderMs, peak, nan, rms, fine, tailPeak: tail });
    if (wantSolo) {
      for (const solo of ['music', 'sfx']) {
        window.__RAIN_AUDIO_SOLO = solo;
        const o = await render(0, DUR);
        const a = o.buf.getChannelData(0), b = o.buf.getChannelData(1), arr = [];
        for (let s = 0; s < a.length; s += win) {
          let acc = 0, n = 0;
          for (let i = s; i < Math.min(a.length, s + win); i++) { acc += a[i] * a[i] + b[i] * b[i]; n += 2; }
          arr.push(10 * Math.log10(acc / n + 1e-20));
        }
        out['solo_' + solo] = arr;
      }
      window.__RAIN_AUDIO_SOLO = undefined;
    }
    // offset = 40
    try {
      const o = await render(40, DUR - 40);
      const d = o.buf.getChannelData(0); let pk = 0, bad = 0;
      for (let i = 0; i < d.length; i++) { if (!Number.isFinite(d[i])) bad++; else pk = Math.max(pk, Math.abs(d[i])); }
      out.off40 = { ok: true, buildMs: o.buildMs, renderMs: o.renderMs, peak: pk, nan: bad };
    } catch (e) { out.off40 = { ok: false, err: String(e && e.stack || e) }; }
    if (wantWav) {
      const n = L.length, bytes = new Uint8Array(44 + n * 4), dv = new DataView(bytes.buffer);
      const ws = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
      ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); ws(8, 'WAVE'); ws(12, 'fmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true);
      dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        dv.setInt16(44 + i * 4, Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), true);
        dv.setInt16(46 + i * 4, Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), true);
      }
      let s = ''; const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      out.wav = btoa(s);
    }
    return out;
  }, SR, null, writeWav, wantSolo);

  console.log(`build ${res.buildMs.toFixed(0)} ms, render ${(res.renderMs / 1000).toFixed(1)} s`);
  console.log(`peak ${res.peak.toFixed(3)} (${(20 * Math.log10(res.peak)).toFixed(1)} dBFS), NaN samples ${res.nan}, last 0.1s peak ${res.tailPeak.toExponential(2)}`);
  console.log('2s windows (start  RMS dB  peak dB):');
  res.rms.forEach((w, k) => console.log(`  ${String(w.t).padStart(2)}s ${w.db.toFixed(1).padStart(6)} ${w.pk.toFixed(1).padStart(6)}` + (res.solo_music ? `  mus ${res.solo_music[k].toFixed(1).padStart(6)} sfx ${res.solo_sfx[k].toFixed(1).padStart(6)}` : '') + `  ${'#'.repeat(Math.max(0, Math.round((w.db + 60) / 1.5)))}`));
  console.log('fine 48–53s:', res.fine.map(([t, d]) => `${t}:${d}`).join(' '));
  console.log('offset=40:', JSON.stringify(res.off40));
  if (res.wav) { fs.writeFileSync(path.join(ROOT, 'tools/preview.wav'), Buffer.from(res.wav, 'base64')); console.log('wrote tools/preview.wav'); }
} finally {
  await browser.close();
}
