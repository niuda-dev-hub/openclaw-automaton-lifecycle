/**
 * automaton-lifecycle 插件入口
 *
 * 注册插件的全部 9 个工具：
 *  - automaton_check_spend         花费查询与 Survival Tier
 *  - automaton_heartbeat_report    上报心跳结果（是否空闲）
 *  - automaton_heartbeat_status    查看自适应心跳状态
 *  - automaton_remember_event      保存情节记忆事件
 *  - automaton_recall_events       检索历史记忆事件
 *  - automaton_save_sop            保存 SOP 操作规程
 *  - automaton_recall_sop          检索 SOP 操作规程
 *  - automaton_soul_reflect        触发 SOUL.md 自省分析
 *  - automaton_soul_update         写入更新后的 SOUL.md
 */
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import { createSpendTrackerTool } from "./src/spend-tracker.js";
import { createAdaptiveHeartbeatTools } from "./src/adaptive-heartbeat.js";
import { createMemoryJournalTools } from "./src/memory-journal.js";
import { createSoulReflectionTool } from "./src/soul-reflection.js";
import { AutomatonLifecycleManager } from "./src/lifecycle-manager.js";
import { createTelegramNotifier } from "./src/telegram-notifier.js";
import { initProgressMonitor } from "./src/progress-monitor.js";

export default function register(api: OpenClawPluginApi) {
  // 初始化核心生命周期管理器（跨模块共享状态）
  const lifecycle = new AutomatonLifecycleManager(api);

  // Initialize Telegram notifier (reads config, no-op if disabled)
  const _telegramNotifier = createTelegramNotifier(api, lifecycle);

  initProgressMonitor(api, lifecycle);

  // 工具 1: automaton_check_wallet (原 check_spend)
  const checkSpendTool = createSpendTrackerTool(api, lifecycle) as unknown as AnyAgentTool;
  api.registerTool(checkSpendTool, { name: checkSpendTool.name });

  // 工具 2-3: automaton_heartbeat_report / automaton_heartbeat_status
  for (const tool of createAdaptiveHeartbeatTools(api, lifecycle)) {
    api.registerTool(tool as unknown as AnyAgentTool, { name: tool.name });
  }

  // 工具 4-7: 结构化记忆日志（记录/检索事件、保存/检索 SOP）
  for (const tool of createMemoryJournalTools(api, lifecycle)) {
    api.registerTool(tool as unknown as AnyAgentTool, { name: tool.name });
  }

  // 工具 8-9: SOUL.md 自省（分析 + 写入）
  const { reflectTool, updateTool } = createSoulReflectionTool(api, lifecycle);
  api.registerTool(reflectTool as unknown as AnyAgentTool, { name: reflectTool.name });
  api.registerTool(updateTool as unknown as AnyAgentTool, { name: updateTool.name });

  api.logger?.info?.("automaton-lifecycle: 9 tools + telegram-notifier registered successfully.");
}
