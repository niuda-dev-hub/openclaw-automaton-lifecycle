# Architecture

`openclaw-automaton-lifecycle` 是 OpenClaw 侧插件（thin client）。核心职责是：注册工具、读写本地状态、调用 `openclaw-agent-hub` API。

## Module map

- `index.ts`
  - 插件入口
  - 注册 9 个生命周期工具
  - 初始化 Telegram notifier（可选）与 Progress Monitor（可选）

- `src/lifecycle-manager.ts`
  - 跨模块共享状态与配置读取
  - 与 Hub 通信的 ApiClient 持有者
  - 作为事件总线（EventEmitter）供内部模块订阅

- `src/api-client.ts`
  - 与 `openclaw-agent-hub` 的 HTTP 客户端

- `src/spend-tracker.ts`
  - 工具：`automaton_check_spend`
  - 预算与 Survival Tier
  - 触发事件：`budget:alert`

- `src/adaptive-heartbeat.ts`
  - 工具：`automaton_heartbeat_report` / `automaton_heartbeat_status`
  - 空闲检测与心跳间隔调整
  - 触发事件：`heartbeat:anomaly`

- `src/memory-journal.ts`
  - 工具：事件记忆 + SOP

- `src/soul-reflection.ts`
  - 工具：SOUL reflect / update
  - SOUL 更新后触发事件：`soul:update`

- `src/telegram-notifier.ts` + `src/telegram/*`
  - 监听 lifecycle 事件并发送 Telegram 通知（可选）

- `src/progress-monitor.ts`
  - 监听宿主侧 `agent_end`（若可用）
  - 生成 progress 相关事件并通过 lifecycle 事件总线发出

## Runtime boundaries

- Hub 是权威状态中心：钱包/心跳/记忆/SOUL 的持久化都在 Hub。
- 本插件仅做：本地缓存 + 工具注册 + HTTP 调用 + 策略驱动。
