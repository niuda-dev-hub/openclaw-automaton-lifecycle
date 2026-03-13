# Configuration

本插件支持两种配置来源：

1. OpenClaw 插件配置：`plugins.entries.automaton-lifecycle.config`（对应 `openclaw.plugin.json` 的 `configSchema`）
2. 环境变量（主要用于部署时注入敏感信息，如 Token）

## 1) 必要配置（Hub）

环境变量（见仓库根目录 README 的 `.env` 表格）：

- `AGENT_HUB_URL`
- `AGENT_HUB_TOKEN`（可选）

## 2) Telegram notifier（可选）

OpenClaw 插件 config：

```json
{
  "telegram": {
    "enabled": true,
    "botToken": "...",
    "chatId": "...",
    "parseMode": "MarkdownV2",
    "silentMode": {
      "enabled": true,
      "timezone": "Asia/Shanghai",
      "nightStart": 22,
      "nightEnd": 8
    },
    "notifyOn": {
      "budgetAlert": true,
      "heartbeatAnomaly": true,
      "soulUpdate": false,
      "agentEnd": false
    }
  }
}
```

环境变量（等价覆盖项）：

- `TELEGRAM_ENABLED=true`
- `TELEGRAM_BOT_TOKEN=...`
- `TELEGRAM_CHAT_ID=...`
- `TELEGRAM_SILENT_MODE=true`
- `TELEGRAM_TIMEZONE=Asia/Shanghai`

## 3) Progress Monitor（可选）

> 该模块依赖宿主侧是否暴露 `api.on("agent_end", ...)`。若不可用，会记录 warning 并不挂载。

OpenClaw 插件 config：

```json
{
  "progressMonitor": {
    "enabled": true,
    "useAi": false,
    "cooldownMs": 120000,
    "monitorNoReply": true,
    "monitorSlowReply": true,
    "slowReplyThresholdMs": 30000,
    "noReplyCooldownMs": 600000
  }
}
```

AI 模式（可选）：

- `useAi=true` 需要配置：
  - `PROGRESS_MONITOR_AI_URL`
  - `PROGRESS_MONITOR_AI_KEY`
  - `PROGRESS_MONITOR_AI_MODEL`（默认 `minimax-m2.5`）

## 4) Schema source of truth

所有插件 config 字段以 `openclaw.plugin.json` 的 `configSchema` 为准。
