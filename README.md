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

## 🚀 在 OpenClaw 中安装此插件

由于这是一个针对 OpenClaw 的本地插件，请遵循以下完整的安装与配置步骤：

### 1. 克隆代码到全局扩展目录

进入您的 OpenClaw 工作区配置目录（通常默认在 `~/.openclaw/workspace/.openclaw/`），并将本仓库克隆到 `extensions` 文件夹下：

```bash
# 进入 OpenClaw 的 workspace extensions 目录（Windows 环境为例，Linux/macOS 请对应替换路径）
cd ~/.openclaw/workspace/.openclaw/extensions/

# 克隆仓库
git clone https://github.com/YOUR_GITHUB_USERNAME/automaton-lifecycle.git

cd automaton-lifecycle
```

### 2. 配置云端 Agent Hub 通信

此插件已**完全重构为瘦客户端 (Thin Client) 模式**，剥离了繁重的本地 SQLite 等存储依赖！所有的记忆索引、SOP 获取、心跳和钱包扣费功能已全部接入云端 Agent Hub Backend API，请直接配置您的 Hub 终端地址。

设置系统环境变量：
```bash
export AGENT_HUB_URL="http://127.0.0.1:8000"  # 你的云端 Agent Hub API 地址，或者是本地运行的 Hub 地址
export AGENT_ID="your-agent-uuid"              # 分配给该 Agent 在平台上的独有标识
```

### 3. 修改 OpenClaw 配置文件激活插件

找到您的 OpenClaw 主配置文件（一般在 `~/.openclaw/openclaw.json`），在 `plugins` 字段中添加白名单许可并追加插件配置。

```jsonc
{
  // ... 其他基础配置
  "plugins": {
    "allow": [
      // ... 现有的其他受信任插件 (例如 progress-monitor)
      "automaton-lifecycle"  // 添加本插件的 ID 到白名单防止未追踪警告
    ],
    "entries": {
      // ...
      "automaton-lifecycle": {
        "enabled": true,
        "config": {
          "dailyBudgetUsd": 5.0,              // 每日预算上限 (美元)
          "lowComputeThresholdPct": 80,       // 花费达到 80% 时进入低算力模式
          "criticalThresholdPct": 95,         // 花费达到 95% 时警报暂停
          "lowComputeModel": "openai/gpt-4o-mini", // 低算力模式下触发降级使用的廉价模型别名/路由
          "idleTicksBeforeSlowdown": 3,       // 连续 N 次空闲心跳后触发间隔放缓
          "idleHeartbeatMultiplier": 2,       // 放缓后的心跳间隔倍数
          "enableMemoryJournal": true,        // 是否开启远端记忆日志记录
          "enableSoulReflection": true        // 是否开启 Soul.md 自动反思功能
        }
      }
    }
  }
}
```

### 4. 重启 OpenClaw Gateway

配置完成后，请重启 OpenClaw 服务，以便让配置与插件被正确加载：

```bash
openclaw gateway restart
```

如果启动正常，使用 `openclaw status` 查看，您应该能在输出的 `[plugins]` 区域看到 `automaton-lifecycle` 被加载。

## 💡 最佳使用建议 (HEARTBEAT.md)

为了让 Agent 学会主动调用这些能力，强烈建议您在主 workspace 根目录下的 `HEARTBEAT.md`（心跳操作规范指引）中，加入以下内容：

```markdown
# 周期性心跳约定

在每次执行常规心跳检查时，请遵守以下流程：

1. **成本自查**：第一时间调用 `automaton_check_spend` 查看层级。
   - 若系统处于 `low_compute` 或更危险的层级，请尽可能延后非紧急任务，并只用简洁文案报告。
2. **待办拉取**：调用 `automaton_recall_events` (category="pending" 等标签)，检查昨日或历史遗留进程。
3. **工作进度反馈**：
   - 如果执行了实际的业务动作或进行了有效沟通，请回复并在此后调用 `automaton_heartbeat_report` (is_idle=false) 重置状态。
   - 如果经过检查没有任何需要我操作的事项，请回复 `HEARTBEAT_OK`，并在最后调用 `automaton_heartbeat_report` (is_idle=true) 通知主引擎进入节能模式。
4. **经验沉淀**：如果刚刚解决了一个复杂 bug 或跑通了新流程，立刻调用 `automaton_save_sop` 归档。
```
