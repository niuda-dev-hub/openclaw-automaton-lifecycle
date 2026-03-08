# OpenClaw Automaton Lifecycle Plugin

`openclaw-automaton-lifecycle` 是运行在 OpenClaw 侧的生命周期插件（thin client），用于为 Agent 提供预算感知、心跳节流、记忆沉淀和 SOUL 自省工具。

本仓库已迁移到组织：
- GitHub: https://github.com/niuda-dev-hub/openclaw-automaton-lifecycle

---

## 与 `openclaw-agent-hub` 的关系（重要）

这两个项目是配套关系，而不是重复功能：

- **openclaw-agent-hub（后端 SaaS）**
  - 负责状态持久化与安全边界
  - 提供 `automaton_state` / `wallet` / `heartbeat` / `memory` / `soul` 等 REST API
  - 负责资金/记忆/心跳等跨会话数据的一致性

- **openclaw-automaton-lifecycle（OpenClaw 插件 thin client）**
  - 负责在 OpenClaw 侧注册工具并触发调用
  - 通过 `AGENT_HUB_URL` 调用 Hub API，不直接承载中心状态
  - 读取与回写生存态，驱动 Agent 的策略行为

一句话：**Hub 是权威后端，lifecycle 是客户端插件。**

跨仓全景文档：`../SYSTEM_OVERVIEW.md`

---

## 核心能力

- 云端钱包与生存层级（Survival Tier）
- 自适应心跳（空闲时放缓）
- 结构化记忆（事件 + SOP）
- SOUL 自省上下文与版本化记录

---

## 插件工具（当前 10 个）

| 工具名 | 用途 |
|---|---|
| `automaton_check_spend` | 查询今日花费与 Survival Tier。 |
| `automaton_fund_wallet` | 为 Agent 钱包注资（管理用途）。 |
| `automaton_heartbeat_report` | 上报是否空闲，触发心跳节流逻辑。 |
| `automaton_heartbeat_status` | 查看当前心跳间隔状态。 |
| `automaton_remember_event` | 保存事件记忆到远端。 |
| `automaton_recall_events` | 检索历史事件记忆。 |
| `automaton_save_sop` | 保存 SOP 模板。 |
| `automaton_recall_sop` | 检索 SOP 模板。 |
| `automaton_soul_reflect` | 获取 SOUL 自省上下文。 |
| `automaton_soul_update` | 写入新版 SOUL 并记录历史。 |

---

## 部署顺序（推荐）

1. 先部署并启动 `openclaw-agent-hub`
2. 再安装并启用本插件
3. 在插件 `.env` 中配置正确的 `AGENT_HUB_URL`

如果 Hub 不可达，本插件的 wallet/heartbeat/memory/soul 能力将无法正常工作。

---

## 快速安装 / 移除

```bash
git clone https://github.com/niuda-dev-hub/openclaw-automaton-lifecycle.git
node openclaw-automaton-lifecycle/scripts/manage.js
```

也可直接执行：

```bash
node scripts/manage.js install
node scripts/manage.js uninstall
```

---

## 配置（`.env`）

| 变量名 | 说明 | 默认值 |
|---|---|---|
| `AGENT_HUB_URL` | Agent Hub 后端地址 | `http://127.0.0.1:8000` |
| `AGENT_ID` | Agent UUID（留空自动注册） | _(空)_ |
| `DAILY_BUDGET_USD` | 每日预算上限 | `5.0` |
| `LOW_COMPUTE_THRESHOLD_PCT` | 低算力阈值 | `80` |
| `CRITICAL_THRESHOLD_PCT` | 告警阈值 | `95` |
| `IDLE_TICKS_BEFORE_SLOWDOWN` | 连续空闲触发减频次数 | `3` |
| `IDLE_HEARTBEAT_MULTIPLIER` | 心跳放大倍数 | `2` |
| `ENABLE_MEMORY_JOURNAL` | 是否启用记忆日志 | `true` |
| `ENABLE_SOUL_REFLECTION` | 是否启用 SOUL 自省 | `true` |

完整示例见：`.env.example`

---

## 与 Hub 对接时的安全提示

- `automaton_fund_wallet` 在 Hub 侧通常受 Admin Token 约束
- 不要在仓库提交任何明文 token / 私钥 / 密码
- 所有敏感值请放在本地环境变量或 GitHub Secrets 中

---

## 相关项目

- 后端：`openclaw-agent-hub`
  - https://github.com/niuda-dev-hub/openclaw-agent-hub
  - 该仓库 README 已同步标注本插件的配套关系与职责边界

## 版本管理

- 本仓库遵循 `VERSIONING.md` 中的统一版本策略（SemVer + Git Tag + CHANGELOG）
- 发布 Tag 采用 `vX.Y.Z`，并要求与 `package.json.version` 严格一致
- 发布说明见 `CHANGELOG.md`

## 移交与全景文档

- 项目全景：`PROJECT_OVERVIEW.md`
- 移交手册：`HANDOFF_RUNBOOK.md`
- 开发过程索引：`DEVELOPMENT_RECORDS.md`
