# Rain Tower

[English](README.md) | [简体中文](README.zh-CN.md)

A hand-painted-style animated short following a little fennec fox as an ancient rainmaking tower awakens and brings a desert to life. The visuals, character animation, music, and sound effects are generated with JavaScript, Canvas 2D, and Web Audio.

The current film runs for **87.6 seconds** at **1600 × 900**. Video export renders each frame at **30 fps** and includes stereo audio. Fixed random seeds and a shared timeline drive the animation and soundtrack.

Download or clone this repository, then open [`荒漠里的造雨塔.html`](荒漠里的造雨塔.html) in a modern desktop browser. Click the play button to start the film and enable sound. This standalone file contains its visual and audio code and can play offline.

```bash
git clone https://github.com/Muelsyse0613/RainTower-video.git
cd RainTower-video
```

For source development, serve the repository locally and open <http://127.0.0.1:8000/dev.html>. This page loads the individual files in `src/`.

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

After editing the source, rebuild the standalone HTML from the repository root. Python 3 uses only its standard library for this step.

```bash
python3 build.py
```

To export an MP4, install **Node.js 18+**, **Python 3**, **Google Chrome**, and **FFmpeg**. Ensure `ffmpeg` is on your `PATH`, then run the following commands from the repository root. The audio step generates `tools/preview.wav` from the current timeline before video rendering.

```bash
npm install
npm run build
npm run audio
npm run export -- RainTower.mp4
```

The tools default to Chrome's standard macOS installation path. On another operating system or with a different Chrome location, set `CHROME_PATH` to the browser executable before running the audio and export commands. For example, in a POSIX shell with Chrome installed at `/usr/bin/google-chrome`.

```bash
export CHROME_PATH=/usr/bin/google-chrome
npm run audio
npm run export -- RainTower.mp4
```

The exporter reads the film duration from the timeline and refuses to overwrite an existing output file. Choose a new filename for each version. Generated WAV/MP4 files, dependencies, and local cache files are excluded by `.gitignore`.

| File | Purpose |
| --- | --- |
| `dev.html` | Development player |
| `荒漠里的造雨塔.html` | Standalone player |
| `src/timeline.js` | Story and film timing |
| `src/lib.js` | Drawing, math, noise, and wind helpers |
| `src/world.js` | Landscape, sky, terrain, and stream |
| `src/tower.js` | Rain tower and moving machinery |
| `src/fox.js` | Fennec fox rig, animation, and drawing |
| `src/fx.js` | Clouds, rain, vegetation, and other effects |
| `src/audio.js` | Procedural score and sound effects |
| `src/main.js` | Camera, compositing, and playback |
| `build.py` | Standalone HTML bundler |
| `tools/audio-check.mjs` | Audio renderer and diagnostics |
| `tools/export-video.mjs` | Frame-by-frame MP4 exporter |
| `tools/perf-check.mjs` | Browser rendering performance check |

Licensed under the [MIT License](LICENSE). Copyright © 2026 Muelsyse0613.
