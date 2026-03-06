/**
 * Spend Tracker — Token 花费追踪与生存层级查询（SaaS API 版）
 *
 * Tool: automaton_check_spend
 */
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";

/** 创建 automaton_check_spend 工具 */
export function createSpendTrackerTool(api: OpenClawPluginApi, lifecycle: AutomatonLifecycleManager) {
    return {
        name: "automaton_check_spend",
        label: "查询 Agent 钱包余额与生存层级",
        description:
            "查询 Agent 当前账户余额（USD）与当前的 Survival Tier（high/normal/low_compute/critical/dead）。" +
            "余额不足时可告知管理者使用 automaton_fund_wallet 为账户充值。",
        parameters: Type.Object({}),

        async execute(_id: string, _params: Record<string, unknown>) {
            // 获取最新 SaaS 云端状态
            const state = await lifecycle.apiClient.getAutomatonState();
            // 同时让 lifecycle-manager 的缓存层更新
            const tier = await lifecycle.getSurvivalTier();
            const cfg = lifecycle.getConfig();

            return {
                content: [
                    {
                        type: "text",
                        text:
                            `💰 **Agent 钱包账户状态**\n\n` +
                            `- 当前账户余额：$${state.balance_usd.toFixed(4)} USD\n` +
                            `- 今日起花费：$${state.daily_spent_usd.toFixed(4)} USD\n` +
                            `- 历史总花费：$${state.lifetime_spent_usd.toFixed(4)} USD\n` +
                            `- 每日预算参考：$${cfg.dailyBudgetUsd.toFixed(2)} USD\n` +
                            `- **当前 Survival Tier：${tier}**\n\n` +
                            (state.balance_usd <= 0
                                ? `⛔ **账户已破产！大部分功能已断电。请管理员用 automaton_fund_wallet 打钱。**\n\n`
                                : ""),
                    },
                ],
                details: { state, tier, config: cfg },
            };
        },
    };
}
