# Event-driven hooks

本文件整理 OpenClaw 官方插件 `api.on(...)` 的可用 hook 名称，并说明哪些 hook 适合用于“进度监控/通知”。

## Source of truth

Hook 名称的权威来源是 OpenClaw 官方仓库的类型定义（白名单）：

- `openclaw/openclaw/src/plugins/types.ts` → `export type PluginHookName = ...`

说明：hook 名称以 OpenClaw 运行时版本为准；如 OpenClaw 升级导致 hook 集合变更，应同步更新本文档。

## 推荐用于进度监控的 hook

### Tool 级别（最重要）

- `before_tool_call`：工具调用前
- `after_tool_call`：工具调用后（包含 `durationMs` / `error` / `result`）

### Subagent 级别（多代理进度）

- `subagent_spawning`
- `subagent_spawned`
- `subagent_delivery_target`
- `subagent_ended`

### Run 级别

- `agent_end`：一次 agent run 完成后汇总

### 出站消息级别

- `message_sending`：发送前（可修改内容 / cancel）
- `message_sent`：发送后（success/error）

### 记录/落盘治理（解决 JSON/敏感信息问题的关键）

- `tool_result_persist`：工具结果即将写入 session transcript
- `before_message_write`：任何 message 写入前

## 官方仓库中的用法模式（示例）

这些例子展示了 hook 的典型用法：

- `message_received` / `message_sending`：`extensions/thread-ownership/index.ts`
- `agent_end` 做 post-run 分析：`extensions/memory-lancedb/index.ts`
- `subagent_*` 做路由与清理：`extensions/discord/src/subagent-hooks.ts`
- `message_sending` / `message_sent` 的执行与容错：`src/infra/outbound/deliver.ts`

## 注意事项（高优先级）

1. hook 处理函数必须尽量短，避免在热路径 await 网络。
2. 通知内容建议默认纯文本，不要把结构化对象 JSON.stringify 直接发给用户。
3. 需要强制脱敏/裁剪时，应优先使用 `tool_result_persist` / `before_message_write` 统一治理。
