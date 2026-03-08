# System Overview (Cross-Repo)

本文档描述 `openclaw-agent-hub` 与 `openclaw-automaton-lifecycle` 的跨仓全景，确保新接手者能快速建立系统级认知。

## 1. 角色边界

- `openclaw-agent-hub`：后端 SaaS / 权威状态中心
- `openclaw-automaton-lifecycle`：OpenClaw 插件 thin client

## 2. 核心调用链

1. 插件启动后通过 `AGENT_HUB_URL` 访问 Hub
2. 读取/更新 `automaton_state`
3. 上报 `heartbeat`
4. 读写 `memory/events`、`memory/sops`
5. 写入 `soul/history`

## 3. 联调顺序

1. 启动 Hub（后端 + 可选前端管理 UI）
2. 配置 lifecycle 的 `AGENT_HUB_URL`
3. 安装并启用 lifecycle 插件
4. 触发插件工具并观察 Hub 数据变化

## 4. 版本与兼容

- 两仓库独立版本管理，但遵循统一 SemVer/Tag/Changelog 策略
- 如果跨仓接口字段变化，必须同步更新双方文档与变更记录

## 5. 文档入口

- Hub 全景：`openclaw-agent-hub/PROJECT_OVERVIEW.md`
- Lifecycle 全景：`openclaw-automaton-lifecycle/PROJECT_OVERVIEW.md`
- 两仓移交手册：`HANDOFF_RUNBOOK.md`
