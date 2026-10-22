# 制作与故障处理

依赖固定在 package-lock.json，`npm ci` 不会改动其他工程。浏览器显式安装：`npx playwright install chromium`，或设置 `REMOTION_BROWSER_EXECUTABLE` 到已有可执行文件。渲染另需 Remotion 自身支持的系统依赖。Linux 中文字体可安装 Noto CJK；本仓库不打包字体。

MiniMax 接口参考 [官方同步 TTS 文档](https://platform.minimax.io/docs/api-reference/speech-t2a-http)。`.env` 只在本机，使用你自己有权使用的完整 voice_id；显示名不一定是接口 ID。支持国际 `api.minimax.io` 和国内 `api.minimaxi.com` 的 t2a_v2 端点，默认 speech-2.8-hd。先运行 dry run 核对将要合成的 cue，再明确 `--execute`。不要在日志或截图中显示 API Key。

脚本保存请求前状态，再调用一次服务。超时或未知结果会留下待核对账本，不自动重试收费请求；确认提供方状态后，保留旧目录，手动修复对应 key 的失败账本再重试。可复用的成功缓存必须同时匹配输入、音频哈希和 PCM 格式。测试用的是内存模拟响应，不调用实际 MiniMax。

字幕按逐句合成边界提供，若要扩展逐字时间戳，可自行安装可选依赖 `python -m pip install faster-whisper`，并提前下载模型或通过 `WHISPER_MODEL` 设置本地模型目录。运行 `align.py` 会加载模型；默认 local_files_only，不自动下载。它输出声学词时间戳和文本相似度，低匹配拒绝通过，不按字数伪造词级时间。

预览及审核：先 assemble，再 Studio，最后 stills。预览看到旧内容时，确认 src/Root.tsx 读取的是当前 public/edition.json，必要时刷新 Studio；不要改编译后的临时 bundle。修改稿件需要重新跑 tts dry run / assemble；仅布局修改复用语音，但需重新生成检查帧和审核哈希。

导出和交付都不覆盖原目录。FFmpeg / ffprobe 必须可执行；可用 `FFMPEG_PATH` 和 `FFPROBE_PATH` 指定。交付通过全解码、帧数/编码/音画时长和原始旁白相关性检查，静音示例会明确跳过相关性并标记 demo。`checks.json` 不声称完整主观试听。

打包发布只包含 release-files.json 清单内文件，禁止人物图、视频、音频、运行数据、环境文件、依赖和 Git 历史。要加入通用静态图片等新类型时，应先明确版权和发布范围，再修改扫描与白名单，不能直接关闭检查。
