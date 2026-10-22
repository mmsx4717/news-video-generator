# 项目约定

制作资讯视频先读 skills/news-video-generator/SKILL.md，按当前阶段再读 docs。

- 用户当前要求优先；一个主题也能制作，不凑新闻数量
- 信息源是标准 RSS / Atom，可由 RSSHub 提供，一次采集，不内置个人订阅或调度
- runs/ 保存私有输入、证据、配音与缓存；public/ 是当前预览构建；均不进 Git
- 修改源码后执行 npm test、npm run demo、npm run check；制作中不要用 demo 覆盖正在审查的 public/，可在独立 checkout 验证
- 不调用付费 TTS 测试，不自动发布视频。开源包只用 release-files.json 允许项
- 保留已有工程和交付；重导出使用新目录
