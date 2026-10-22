# 数据格式

以 `examples/edition.json` 为最小可运行输入，真实一期放在忽略提交的 `runs/episode/edition.json`。

- `title`：封面标题，建议 4–10 个汉字；`date`：实际期号 YYYY-MM-DD
- `maxSeconds`：默认 420；输出固定 1920×1080 / 60fps
- `stories[]`：稳定 `id`、`company`、`title`、最多 3 个短 `points`、原文 `sources[]`、`cues[]`
- `cues[]`：`text`、可选 `emotion`（使用当前 MiniMax 模型支持值）、`pauseMs`（150–1500）
- `media[]`：`type: image | video`、`file`（相对仓库路径，必须在 runs/ 下）、`source`（真实原文 URL）、`cue`（从 0 开始）、`receipt`（image 必填，相对仓库路径）
- `ticker[]`：`text`、`source`，最多 10 条；正文没有有效快讯时留空

图片例子：

```json
{
  "type": "image",
  "file": "runs/episode/evidence/source-1.png",
  "source": "https://example.org/announcement",
  "cue": 0,
  "receipt": "runs/episode/evidence/source-1.json"
}
```

图片需要对应 `capture-review.mjs` 已确认的收据。视频不由截图工具获取，放到本地 runs/ 后写明真实 source；自行保存录屏过程、裁剪区间、是否静音以及审核记录，模板播放时静音，避免原音覆盖配音。工具不会伪造视频已被核验的标记。

`collect` 配置为 `feeds: [{name,url}]`，可选 ISO `since`/`until`，默认命令启动前 24 小时。保存每个原始 feed 与错误。日期缺失不丢弃线索，但 `dateVerified=false`，Agent 需要回原文核验。

配音缓存 key 包含文本、模型、端点、voice_id、情绪和 1.1 倍速；改动对应输入只重做受影响句。`voice-manifest.json` 绑定整个稿件，未匹配的旧音频不能偷偷套回。每句 32000Hz / 单声道 / 16bit PCM WAV。组装只拼接原样 PCM 和停顿，不重采样或变速。字幕显示边界来自每句音频文件，不是词级声学对齐。

可选 `python scripts/align.py AUDIO.wav "对应的完整短句" OUTPUT.json` 产生真实识别词时间戳与文本相似度，用于复核发音/漏字；它不自动覆盖字幕，也不能替代实际试听。需自行安装 faster-whisper 和模型，见制作说明。
