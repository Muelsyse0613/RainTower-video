// 实时性能检查：在无界面 Chrome 里按真实时间推进，统计各段的单帧绘制耗时
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'], protocolTimeout: 240000 });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900 });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(pathToFileURL(path.join(root, process.argv[2] || 'dev.html')).href + '?t=0&mute&live' + (process.argv[3] ? '&isq=' + process.argv[3] : ''));
  await page.waitForFunction(() => window.__ready === true, { timeout: 90000 });
  const res = await page.evaluate(async () => {
    const run = (t0, dur) => new Promise(res => { const st = performance.now(); let last = st, n = 0, slow = 0, cost = 0, mx = 0;
      const f = () => { const now = performance.now(), d = now - last; last = now; n++; if (d > 25) slow++; const a = performance.now(); window.__seek(t0 + (now - st) / 1000); const c = performance.now() - a; cost += c; if (c > mx) mx = c;
        if (now - st < dur * 1000) requestAnimationFrame(f); else res(`${String(t0).padStart(5)}s  fps ${(n / dur).toFixed(0).padStart(3)}  slowFrames ${String(slow).padStart(3)}  draw avg ${(cost / n).toFixed(1)}ms max ${mx.toFixed(0)}ms`); };
      requestAnimationFrame(f); });
    const out = []; for (const t0 of [2, 8.5, 20.5, 41, 50, 53, 59, 63, 67, 75]) out.push(await run(t0, 2.5)); return out; });
  console.log(res.join('\n'));
} finally { await browser.close(); }
