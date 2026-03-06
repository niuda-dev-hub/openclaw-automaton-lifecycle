/**
 * Adaptive Heartbeat — 自适应心跳频率调整
 *
 * 逻辑：
 *  - 若连续 N 次心跳均为 HEARTBEAT_OK（无实质动作），
 *    自动将心跳间隔乘以 multiplier（默认 2x），进入"深度休眠"。
 *  - 当 Survival Tier 降至 low_compute / critical 时，
 *    立即收缩心跳频率到最短（保持观察）。
 *  - 当有新消息或唤醒事件时，还原正常频率。
 *
 * Tool: automaton_heartbeat_status
 *   - 查看当前心跳状态、空闲次数、建议的下一次间隔
 *
 * Tool: automaton_heartbeat_report
 *   - 由 Heartbeat 提示词调用；输入当前心跳内容，
 *     插件自动判断是否为空闲并更新计数
 */
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import { loadStore, saveStore } from "./db.js";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";

const KV_BASE_INTERVAL = "heartbeat_base_interval_min";
const KV_CURRENT_INTERVAL = "heartbeat_current_interval_min";

/** 读取 KV 状态 */
function readKv(key: string, dbPath?: string): string | null {
    const store = loadStore(dbPath);
    return store.heartbeat_state[key] ?? null;
}

/** 写入 KV 状态 */
function writeKv(key: string, value: string, dbPath?: string): void {
    const store = loadStore(dbPath);
    store.heartbeat_state[key] = value;
    saveStore(dbPath);
}

/** 读取基准和当前心跳间隔（分钟） */
export function getHeartbeatIntervals(dbPath?: string): {
    baseMin: number;
    currentMin: number;
} {
    const base = parseInt(readKv(KV_BASE_INTERVAL, dbPath) ?? "30", 10);
    const current = parseInt(readKv(KV_CURRENT_INTERVAL, dbPath) ?? String(base), 10);
    return { baseMin: base, currentMin: current };
}

/** 将当前间隔乘以 multiplier（放缓心跳） */
function slowDownHeartbeat(multiplier: number, dbPath?: string): number {
    const { baseMin, currentMin } = getHeartbeatIntervals(dbPath);
    const maxMin = baseMin * 4; // 最多放缓到基准的 4 倍
    const newMin = Math.min(currentMin * multiplier, maxMin);
    writeKv(KV_CURRENT_INTERVAL, String(newMin), dbPath);
    return newMin;
}

/** 还原心跳间隔到基准值 */
function resetHeartbeat(dbPath?: string): number {
    const { baseMin } = getHeartbeatIntervals(dbPath);
    writeKv(KV_CURRENT_INTERVAL, String(baseMin), dbPath);
    return baseMin;
}

/** 创建 automaton_heartbeat_report 和 automaton_heartbeat_status 工具 */
export function createAdaptiveHeartbeatTools(
    api: OpenClawPluginApi,
    lifecycle: AutomatonLifecycleManager,
) {
    const dbPath = (api.pluginConfig as Record<string, string>)?.dbPath;
    const cfg = lifecycle.getConfig();

    // Tool 1: automaton_heartbeat_report
    const reportTool = {
        name: "automaton_heartbeat_report",
        label: "上报心跳结果",
        description:
            "在 Heartbeat 任务结束后调用此工具，上报本次心跳是否产生了实质工作。" +
            "插件将根据连续空闲次数自动调整下一次心跳间隔（空闲越多，间隔越长）。" +
            "当出现重要事件时，请将 is_idle 设为 false 以重置间隔。",
        parameters: Type.Object({
            is_idle: Type.Boolean({
                description:
                    "本次心跳是否为完全空闲（即回复了 HEARTBEAT_OK 且无任何操作）。true=空闲，false=有实质工作。",
            }),
            summary: Type.Optional(
                Type.String({ description: "本次心跳的简短摘要（可选，用于记录到日志）。" }),
            ),
        }),

        async execute(_id: string, params: Record<string, unknown>) {
            const isIdle = params.is_idle === true;
            let message: string;
            let newInterval: number | undefined;

            if (isIdle) {
                const idleCount = lifecycle.incrementIdleTick();
                if (lifecycle.shouldSlowDownHeartbeat()) {
                    newInterval = slowDownHeartbeat(cfg.idleHeartbeatMultiplier, dbPath);
                    message =
                        `🌙 连续空闲 ${idleCount} 次，已将心跳间隔延长至 **${newInterval} 分钟**（深度休眠模式）。`;
                } else {
                    const { currentMin } = getHeartbeatIntervals(dbPath);
                    message = `😴 空闲次数：${idleCount}/${cfg.idleTicksBeforeSlowdown}，当前间隔 ${currentMin} 分钟。`;
                }
            } else {
                lifecycle.resetIdleTick();
                newInterval = resetHeartbeat(dbPath);
                message = `⚡ 检测到实质工作，心跳间隔已重置为 **${newInterval} 分钟**。`;
            }

            return {
                content: [{ type: "text", text: message }],
                details: { isIdle, idleTickCount: lifecycle.getIdleTickCount(), newIntervalMin: newInterval },
            };
        },
    };

    // Tool 2: automaton_heartbeat_status
    const statusTool = {
        name: "automaton_heartbeat_status",
        label: "查看心跳状态",
        description: "查看当前的自适应心跳状态，包括基准间隔、当前间隔和连续空闲次数。",
        parameters: Type.Object({}),

        async execute(_id: string, _params: Record<string, unknown>) {
            const { baseMin, currentMin } = getHeartbeatIntervals(dbPath);
            const idleCount = lifecycle.getIdleTickCount();
            const tier = lifecycle.getSurvivalTier();

            return {
                content: [
                    {
                        type: "text",
                        text:
                            `💓 **心跳状态**\n\n` +
                            `- 基准间隔：${baseMin} 分钟\n` +
                            `- 当前间隔：${currentMin} 分钟\n` +
                            `- 连续空闲次数：${idleCount}/${cfg.idleTicksBeforeSlowdown}\n` +
                            `- 触发放缓阈值：${cfg.idleTicksBeforeSlowdown} 次\n` +
                            `- 当前 Survival Tier：${tier}\n` +
                            (currentMin > baseMin
                                ? `\n⚠️ 当前处于深度休眠模式（间隔是基准的 ${(currentMin / baseMin).toFixed(1)}x）`
                                : "\n✅ 心跳间隔正常"),
                    },
                ],
                details: { baseMin, currentMin, idleCount, tier },
            };
        },
    };

    return [reportTool, statusTool];
}
