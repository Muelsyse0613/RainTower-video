# 荒漠里的造雨塔

[English](README.md) | [简体中文](README.zh-CN.md)

一部手绘风格的动画短片。小沙狐见证古老的造雨塔苏醒，春雨落下，荒漠重新焕发生机。画面、角色动作、配乐与音效均由 JavaScript、Canvas 2D 和 Web Audio 生成。

当前成片全长 **87.6 秒**，画幅为 **1600 × 900**。视频导出采用 **30 帧/秒**逐帧渲染，包含立体声。动画与声音由共享时间线和固定随机种子驱动。

下载或克隆仓库后，用现代桌面浏览器打开 [`荒漠里的造雨塔.html`](荒漠里的造雨塔.html)，点击播放按钮开启声音并观看。这个独立 HTML 文件已包含画面与声音代码，可离线播放。

```bash
git clone https://github.com/Muelsyse0613/RainTower-video.git
cd RainTower-video
```

开发时可启动本地服务器，访问 <http://127.0.0.1:8000/dev.html>。开发页直接加载 `src/` 内各模块，便于修改和调试。

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

修改源码后，在仓库根目录执行以下命令，重新生成独立 HTML。此步骤仅使用 Python 3 标准库。

```bash
python3 build.py
```

导出 MP4 需要 **Node.js 18 或更高版本**、**Python 3**、**Google Chrome** 和 **FFmpeg**。确保命令行可以运行 `ffmpeg`，然后在仓库根目录依次执行以下命令。音频步骤会根据当前时间线生成 `tools/preview.wav`，供视频合成使用。

```bash
npm install
npm run build
npm run audio
npm run export -- RainTower.mp4
```

工具默认使用 macOS 上 Chrome 的标准安装路径。使用其他系统或安装路径时，请先将 `CHROME_PATH` 设置为浏览器可执行文件的路径，再运行音频与视频导出命令。例如，在 POSIX shell 中，若 Chrome 位于 `/usr/bin/google-chrome`。

```bash
export CHROME_PATH=/usr/bin/google-chrome
npm run audio
npm run export -- RainTower.mp4
```

导出器从时间线读取成片时长，并在目标文件已存在时停止。导出新版本时请使用新的文件名。生成的 WAV、MP4、依赖目录与本地缓存已通过 `.gitignore` 排除。

| 文件 | 用途 |
| --- | --- |
| `dev.html` | 模块化开发播放页 |
| `荒漠里的造雨塔.html` | 可离线播放的独立文件 |
| `src/timeline.js` | 故事与成片时间线 |
| `src/lib.js` | 绘画、数学、噪声与风场工具 |
| `src/world.js` | 天空、地形、场景与溪流 |
| `src/tower.js` | 造雨塔与机械部件 |
| `src/fox.js` | 沙狐骨架、表演与绘制 |
| `src/fx.js` | 云雨、植被与其他特效 |
| `src/audio.js` | 程序生成的配乐与音效 |
| `src/main.js` | 镜头、合成与播放控制 |
| `build.py` | 独立 HTML 打包脚本 |
| `tools/audio-check.mjs` | 音频渲染与自检 |
| `tools/export-video.mjs` | MP4 逐帧导出 |
| `tools/perf-check.mjs` | 浏览器绘制性能检查 |

本项目采用 [MIT 许可证](LICENSE)。版权所有 © 2026 Muelsyse0613。
