/**
 * Adaptive Heartbeat — 自适应心跳频率调整（SaaS API 版）
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
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";

const BASE_INTERVAL_MS = 30 * 60 * 1000; // 默认 30 分钟为基准

/** 创建 automaton_heartbeat_report 和 automaton_heartbeat_status 工具 */
export function createAdaptiveHeartbeatTools(
    api: OpenClawPluginApi,
    lifecycle: AutomatonLifecycleManager,
) {
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
            let currentMs: number;

            try {
                const state = await lifecycle.apiClient.getAutomatonState();
                currentMs = state.heartbeat_interval_ms || BASE_INTERVAL_MS;
            } catch (e) {
                currentMs = BASE_INTERVAL_MS;
            }

            let newIntervalMs = currentMs;

            if (isIdle) {
                const idleCount = await lifecycle.incrementIdleTick();
                if (lifecycle.shouldSlowDownHeartbeat()) {
                    const maxMs = BASE_INTERVAL_MS * 4;
                    newIntervalMs = Math.min(currentMs * cfg.idleHeartbeatMultiplier, maxMs);
                    await lifecycle.updateHeartbeatInterval(newIntervalMs);
                    message =
                        `🌙 连续空闲 ${idleCount} 次，已将心跳间隔延长至 **${newIntervalMs / 60000} 分钟**（深度休眠模式）。`;
                } else {
                    message = `😴 空闲次数：${idleCount}/${cfg.idleTicksBeforeSlowdown}，当前间隔 ${currentMs / 60000} 分钟。`;
                }
            } else {
                await lifecycle.resetIdleTick();
                newIntervalMs = BASE_INTERVAL_MS;
                await lifecycle.updateHeartbeatInterval(newIntervalMs);
                message = `⚡ 检测到实质工作，心跳间隔已重置为 **${newIntervalMs / 60000} 分钟**。`;
            }

            if (params.summary) {
                // optionally record to events if it was substantial
                if (!isIdle) {
                    await lifecycle.apiClient.recordEvent("heartbeat_active", String(params.summary));
                }
            }

            // 发送真实的心跳打卡给 Agent Hub 后端
            await lifecycle.pingHeartbeat();

            return {
                content: [{ type: "text", text: message }],
                details: { isIdle, idleTickCount: lifecycle.getIdleTickCount(), newIntervalMin: newIntervalMs / 60000 },
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
            let currentMs = BASE_INTERVAL_MS;
            try {
                const state = await lifecycle.apiClient.getAutomatonState();
                currentMs = state.heartbeat_interval_ms;
            } catch (e) { }

            const baseMin = BASE_INTERVAL_MS / 60000;
            const currentMin = currentMs / 60000;
            const idleCount = lifecycle.getIdleTickCount();
            const tier = await lifecycle.getSurvivalTier();

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
