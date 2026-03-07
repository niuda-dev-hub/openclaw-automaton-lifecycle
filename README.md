# OpenClaw Automaton Lifecycle Plugin

这是一个将 [Automaton](https://github.com/a16z/automaton) 强大的"生存式智能体"理念移植到 [OpenClaw](https://github.com/tloncorp/openclaw) 的插件。

通过此插件，OpenClaw Agent 将拥有成本感知、自适应心跳放缓机制，以及基于云端 Agent Hub 的结构化长期记忆和自省分析能力。

## ✨ 核心特性

- 💰 **云端钱包与生存层级 (Wallet & Survival Tier)**：与 Agent Hub 的 Ledger 机制直通。自动追踪大模型 API 的成本开销，并从云端钱包扣减，剩余成本低于阈值时动态降级 Agent 资源调度策略。
- 🫀 **自适应心跳机制 (Adaptive Heartbeat)**：由远端 Hub SaaS 接管状态轮询与心跳控制。在没有实质任务需要处理时自动放缓心跳，避免 API 滥用和无效唤醒。
- 🧠 **高度结构化事件记忆 (Memory Journal)**：脱离本地单薄文件的限制，重要情节（Event）与 标准操作规程（SOP）全部存储至云端双擎数据库中，实现记忆永久安全留存与多终端共享。
- 🪞 **深层自我进化 (Soul Reflection)**：空闲期间触发的高维自省机制，依赖远端提供的上下文跨度建议对本地或云端的 `SOUL.md` 发起演进建议，使 Persona 自反馈迭代成长。

## 🛠 提供的 Agent 工具

该插件向 OpenClaw 注册了以下 9 个工具供 Agent 使用：

| 工具名 | 用途 |
|---|---|
| `automaton_check_spend` | 查询今日 API 花费与当前所属的 Survival Tier。 |
| `automaton_heartbeat_report` | 上报本次心跳是否为"空闲"，连续空闲会触发频率放缓。 |
| `automaton_heartbeat_status` | 查看当前心跳间隔状态。 |
| `automaton_remember_event` | 将重要情节事件保存到远端记忆库。 |
| `automaton_recall_events` | 按分类或关键词精准检索历史记忆。 |
| `automaton_save_sop` | 保存一套成功的操作步骤模板（SOP）。 |
| `automaton_recall_sop` | 检索历史解法模板，直接复用经验。 |
| `automaton_soul_reflect` | 获取 SOUL 文件的自省上下文，交由 LLM 生成更新建议。 |
| `automaton_soul_update` | 安全地写入新版 `SOUL.md`，并在远端记录版本历史。 |

## 🚀 快速安装 / 移除（推荐）

只需一条命令，全平台（Windows / macOS / Linux）通用：

```bash
# 在任意临时目录运行（脚本会自动把插件安装到 ~/.openclaw/extensions/）
# 例如：cd ~ 或 cd /tmp
git clone https://github.com/niudakok-kok/automaton-lifecycle-openclaw.git
node automaton-lifecycle-openclaw/scripts/manage.js
```

脚本启动后会呈现菜单，由你选择**安装**或**移除**：

```
╔══════════════════════════════════════╗
║  automaton-lifecycle 插件管理工具    ║
╠══════════════════════════════════════╣
║  1. 安装插件                         ║
║  2. 移除插件                         ║
╚══════════════════════════════════════╝

请输入选项 [1/2]：
```

**安装** 时脚本自动完成：
1. 克隆 / 更新代码到正确的 OpenClaw extensions 目录
2. `npm install` 安装依赖
3. 基于 `.env.example` 创建 `.env` 配置文件
4. 自动注册插件到 `openclaw.json`（无需手动编辑）

**移除** 时脚本自动完成：
1. 从 `openclaw.json` 注销插件
2. 二次确认后删除整个插件目录

> 你也可以通过参数跳过菜单直接执行：
> `node scripts/manage.js install` 或 `node scripts/manage.js uninstall`

---

## ⚙️ 配置插件（.env 文件）

所有插件配置都集中在插件目录下的 **`.env` 文件**中，**无需修改 `openclaw.json`**。

安装完成后，编辑 `.env` 文件：
```bash
# 路径示例（Windows 下请替换为对应路径）
nano ~/.openclaw/workspace/.openclaw/extensions/automaton-lifecycle/.env
```

**核心配置项：**

| 变量名 | 说明 | 默认值 |
|---|---|---|
| `AGENT_HUB_URL` | Agent Hub 后端地址 | `http://127.0.0.1:8000` |
| `AGENT_ID` | Agent UUID（留空则自动注册） | _(空)_ |
| `DAILY_BUDGET_USD` | 每日预算上限（美元） | `5.0` |
| `LOW_COMPUTE_THRESHOLD_PCT` | 进入低算力模式阈值（%） | `80` |
| `CRITICAL_THRESHOLD_PCT` | 进入告警模式阈值（%） | `95` |
| `IDLE_TICKS_BEFORE_SLOWDOWN` | 连续空闲 N 次后拉长心跳 | `3` |
| `IDLE_HEARTBEAT_MULTIPLIER` | 空闲时心跳间隔放大倍数 | `2` |
| `ENABLE_MEMORY_JOURNAL` | 远端记忆日志（true/false） | `true` |
| `ENABLE_SOUL_REFLECTION` | Soul 自省功能（true/false） | `true` |

完整配置示例见 [`.env.example`](.env.example)。

> **关于 `AGENT_ID`**：首次留空即可，插件在被调用时自动向 Hub 注册并获取 UUID。若遭遇网络代理拦截，可先在 Agent Hub UI 手动创建 Agent，将 UUID 填入此处。

---

> **ℹ️ 无需手动修改 `openclaw.json`**：安装脚本会自动调用 `scripts/patch-openclaw-config.js` 将插件注册到白名单中，卸载脚本会同步清理。

---

## 🔄 重启 Gateway

配置完成后，重启 OpenClaw 服务：

```bash
# Linux / macOS
openclaw gateway restart

# Windows
openclaw gateway stop; openclaw gateway start
```

---

## 🗑️ 完整移除插件

**Linux / macOS:**
```bash
node ~/.openclaw/extensions/automaton-lifecycle/scripts/manage.js uninstall
```

**Windows (PowerShell):**
```powershell
node "$HOME\.openclaw\extensions\automaton-lifecycle\scripts\manage.js" uninstall
```

移除脚本会进行二次确认，然后删除整个插件目录（包含你的 `.env` 和所有数据）。

---

## 💡 HEARTBEAT.md 最佳实践

为了让 Agent 学会主动调用这些能力，强烈建议在 workspace 根目录的 `HEARTBEAT.md` 中加入以下约定：

```markdown
# 周期性心跳约定

每次执行常规心跳检查时，请遵守以下流程：

1. **成本自查**：调用 `automaton_check_spend` 查看层级。
   - 若处于 `low_compute` 或更危险层级，延后非紧急任务。
2. **待办拉取**：调用 `automaton_recall_events` (category="pending") 检查遗留事项。
3. **工作进度反馈**：
   - 执行了实际动作 → 调用 `automaton_heartbeat_report` (is_idle=false)
   - 无任何待处理事项 → 回复 `HEARTBEAT_OK` 并调用 `automaton_heartbeat_report` (is_idle=true)
4. **经验沉淀**：解决复杂问题后立刻调用 `automaton_save_sop` 归档。
```
