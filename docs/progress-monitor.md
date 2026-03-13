# Progress Monitor

本插件内置 `progress-monitor` 模块，用于在宿主侧生命周期事件发生时，触发内部事件并配合 Telegram notifier 发送通知。

## 目标

- 在一次 agent run 结束时（`agent_end`）提供：
  - 固定格式通知（默认）
  - 可选 AI 分析通知（useAi=true）
- 监控异常：
  - slow reply（duration 过长）
  - no reply（replies=0）

## 启用

在 OpenClaw 插件配置中：

```json
{
  "progressMonitor": {
    "enabled": true,
    "useAi": false
  }
}
```

## 事件

Progress Monitor 通过 lifecycle 事件总线发出：

- `progress:task_done`
- `progress:slow_reply`
- `progress:no_reply`
- `progress:ai_notify`

并同时发出 run 级内部事件：

- `agent:end`

说明：这里的 `agent:end` 是本插件内部事件命名（通过 lifecycle 事件总线发出），与 OpenClaw 官方 hook `agent_end`（宿主侧 `api.on("agent_end", ...)`）不是同一个层级。

## 设计约束

- 默认不依赖 Markdown，消息按纯文本拼接，避免把 JSON 原样暴露给用户。
- 若宿主 `api.on` 不可用（未暴露 `agent_end` 事件），模块会自动不挂载。
