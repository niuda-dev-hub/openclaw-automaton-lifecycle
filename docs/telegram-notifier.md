# Telegram Notifier

本插件内置 Telegram notifier，用于监听 lifecycle 事件并发送 Telegram 消息。

## 开关

- 默认关闭：`telegram.enabled=false`
- 开启后需要提供：`botToken` + `chatId`

## Silent mode

silent mode 的策略是：

- 仍然发送消息
- 在夜间时段设置 `disable_notification=true`

即“静默不打扰”而不是“静默丢消息”。

## 消息格式（修复点）

通知内容默认使用纯文本，避免 Markdown/转义混用导致：

- 用户看到奇怪的转义符
- 把结构化 JSON 作为文本暴露

如需 Markdown，请在配置中显式设置 `parseMode`，并确保内容本身符合 Telegram 的格式要求。
