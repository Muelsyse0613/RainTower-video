// Export the current standalone animation deterministically, including its soundtrack.
// Usage: node tools/export-video.mjs [output.mp4]
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || path.join(root, '荒漠里的造雨塔.mp4'));
const partial = output.replace(/\.mp4$/i, '') + '.partial.mp4';
const soundtrack = path.join(root, 'tools/preview.wav');
const fps = 30;
if (fs.existsSync(output) || fs.existsSync(partial)) throw new Error('Output already exists; choose a new filename.');
for (const source of ['src/audio.js', 'src/timeline.js']) {
  if (fs.statSync(path.join(root, source)).mtimeMs > fs.statSync(soundtrack).mtimeMs) {
    throw new Error('Soundtrack is stale. Run node tools/audio-check.mjs first.');
  }
}
fs.mkdirSync(path.dirname(output), { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  protocolTimeout: 120000,
});
let encoder;
let complete = false;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(root, '荒漠里的造雨塔.html')).href + '?t=0&mute');
  await page.waitForFunction(() => window.__ready === true, { timeout: 60000 });
  const info = await page.evaluate(() => ({
    duration: window.CUES.end,
    width: document.getElementById('stage').width,
    height: document.getElementById('stage').height,
  }));
  const frames = Math.round(info.duration * fps);
  encoder = spawn('ffmpeg', [
    '-nostdin', '-n', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-i', soundtrack, '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '256k', '-t', String(info.duration),
    '-movflags', '+faststart', '-metadata', 'title=荒漠里的造雨塔', partial,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  let encoderError;
  encoder.on('error', error => { encoderError = error; });
  encoder.stdin.on('error', error => { encoderError = error; });
  const closed = new Promise(resolve => encoder.on('close', (code, signal) => resolve({ code, signal })));
  console.log(`Rendering ${frames} frames: ${info.width}×${info.height}, ${fps} fps, ${info.duration}s, stereo audio`);
  const started = Date.now();
  let lastLog = started;
  for (let frame = 0; frame < frames; frame++) {
    if (encoderError) throw encoderError;
    if (encoder.exitCode !== null) throw new Error(`Encoder stopped with code ${encoder.exitCode}`);
    if (errors.length) throw new Error(errors.join('\n'));
    const jpeg = await page.evaluate(t => {
      window.__seek(t);
      return document.getElementById('stage').toDataURL('image/jpeg', 0.98).split(',')[1];
    }, frame / fps);
    if (!encoder.stdin.write(Buffer.from(jpeg, 'base64'))) await once(encoder.stdin, 'drain');
    const now = Date.now();
    if (now - lastLog >= 10000 || frame === frames - 1) {
      const elapsed = (now - started) / 1000;
      const done = frame + 1;
      console.log(`${done}/${frames} frames (${(done / frames * 100).toFixed(1)}%), ${(done / elapsed).toFixed(1)} fps, ETA ${Math.round((frames - done) / (done / elapsed))}s`);
      lastLog = now;
    }
  }
  encoder.stdin.end();
  const result = await closed;
  if (result.code !== 0) throw new Error(`Encoder failed: ${JSON.stringify(result)}`);
  if (errors.length) throw new Error(errors.join('\n'));
  fs.renameSync(partial, output);
  complete = true;
  console.log(`Exported ${output} (${(fs.statSync(output).size / 1024 / 1024).toFixed(1)} MiB)`);
} finally {
  if (!complete && encoder && encoder.exitCode === null) encoder.kill('SIGTERM');
  await browser.close();
}
