# Rain Tower · 荒漠里的造雨塔

A hand-painted-style animated short following a little fennec fox as an ancient rainmaking tower awakens and brings a desert to life. The visuals, character animation, music, and sound effects are generated with JavaScript, Canvas 2D, and Web Audio.

一部手绘风格的动画短片。小沙狐见证古老的造雨塔苏醒，春雨落下，荒漠重新焕发生机。画面、角色动作、配乐与音效均由 JavaScript、Canvas 2D 和 Web Audio 生成。

The current film runs for **87.6 seconds** at **1600 × 900**. Video export renders each frame at **30 fps** and includes stereo audio. Fixed random seeds and a shared timeline drive the animation and soundtrack.

当前成片全长 **87.6 秒**，画幅为 **1600 × 900**。视频导出采用 **30 帧/秒**逐帧渲染，包含立体声。动画与声音由共享时间线和固定随机种子驱动。

Download or clone this repository, then open [`荒漠里的造雨塔.html`](荒漠里的造雨塔.html) in a modern desktop browser. Click the play button to start the film and enable sound. This standalone file contains its visual and audio code and can play offline.

下载或克隆仓库后，用现代桌面浏览器打开 [`荒漠里的造雨塔.html`](荒漠里的造雨塔.html)，点击播放按钮开启声音并观看。这个独立 HTML 文件已包含画面与声音代码，可离线播放。

```bash
git clone https://github.com/Muelsyse0613/RainTower-video.git
cd RainTower-video
```

For source development, serve the repository locally and open <http://127.0.0.1:8000/dev.html>. This page loads the individual files in `src/`.

开发时可启动本地服务器，访问 <http://127.0.0.1:8000/dev.html>。开发页直接加载 `src/` 内各模块，便于修改和调试。

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

After editing the source, rebuild the standalone HTML from the repository root. Python 3 uses only its standard library for this step.

修改源码后，在仓库根目录执行以下命令，重新生成独立 HTML。此步骤仅使用 Python 3 标准库。

```bash
python3 build.py
```

To export an MP4, install **Node.js 18+**, **Python 3**, **Google Chrome**, and **FFmpeg**. Ensure `ffmpeg` is on your `PATH`, then run the following commands from the repository root. The audio step generates `tools/preview.wav` from the current timeline before video rendering.

导出 MP4 需要 **Node.js 18 或更高版本**、**Python 3**、**Google Chrome** 和 **FFmpeg**。确保命令行可以运行 `ffmpeg`，然后在仓库根目录依次执行以下命令。音频步骤会根据当前时间线生成 `tools/preview.wav`，供视频合成使用。

```bash
npm install
npm run build
npm run audio
npm run export -- RainTower.mp4
```

The tools default to Chrome's standard macOS installation path. On another operating system or with a different Chrome location, set `CHROME_PATH` to the browser executable before running the audio and export commands. For example, in a POSIX shell with Chrome installed at `/usr/bin/google-chrome`.

工具默认使用 macOS 上 Chrome 的标准安装路径。使用其他系统或安装路径时，请先将 `CHROME_PATH` 设置为浏览器可执行文件的路径，再运行音频与视频导出命令。例如，在 POSIX shell 中，若 Chrome 位于 `/usr/bin/google-chrome`。

```bash
export CHROME_PATH=/usr/bin/google-chrome
npm run audio
npm run export -- RainTower.mp4
```

The exporter reads the film duration from the timeline and refuses to overwrite an existing output file. Choose a new filename for each version. Generated WAV/MP4 files, dependencies, and local cache files are excluded by `.gitignore`.

导出器从时间线读取成片时长，并在目标文件已存在时停止。导出新版本时请使用新的文件名。生成的 WAV、MP4、依赖目录与本地缓存已通过 `.gitignore` 排除。

| File / 文件 | Purpose / 用途 |
| --- | --- |
| `dev.html` | Development player / 模块化开发播放页 |
| `荒漠里的造雨塔.html` | Standalone player / 可离线播放的独立文件 |
| `src/timeline.js` | Story and film timing / 故事与成片时间线 |
| `src/lib.js` | Drawing, math, noise, and wind helpers / 绘画、数学、噪声与风场工具 |
| `src/world.js` | Landscape, sky, terrain, and stream / 天空、地形、场景与溪流 |
| `src/tower.js` | Rain tower and moving machinery / 造雨塔与机械部件 |
| `src/fox.js` | Fennec fox rig, animation, and drawing / 沙狐骨架、表演与绘制 |
| `src/fx.js` | Clouds, rain, vegetation, and other effects / 云雨、植被与其他特效 |
| `src/audio.js` | Procedural score and sound effects / 程序生成的配乐与音效 |
| `src/main.js` | Camera, compositing, and playback / 镜头、合成与播放控制 |
| `build.py` | Standalone HTML bundler / 独立 HTML 打包脚本 |
| `tools/audio-check.mjs` | Audio renderer and diagnostics / 音频渲染与自检 |
| `tools/export-video.mjs` | Frame-by-frame MP4 exporter / MP4 逐帧导出 |
| `tools/perf-check.mjs` | Browser rendering performance check / 浏览器绘制性能检查 |

Licensed under the [MIT License](LICENSE). Copyright © 2026 Muelsyse0613.

本项目采用 [MIT 许可证](LICENSE)。Copyright © 2026 Muelsyse0613。
