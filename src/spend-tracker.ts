/**
 * Spend Tracker — Token 花费追踪（JSON 文件版）
 *
 * Tool: automaton_check_spend
 */
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import { loadStore, saveStore, todayKey, type DailySpendRow } from "./db.js";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";

/** 记录一次推理调用的花费，并从钱包中实时扣费 */
export function recordSpend(params: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    dbPath?: string;
}): void {
    const store = loadStore(params.dbPath);
    const date = todayKey();

    // 1. 更新每日花费汇总
    const existing = store.daily_spend.find(
        (r: DailySpendRow) => r.date_key === date && r.model === params.model
    );
    if (existing) {
        existing.input_tokens += params.inputTokens;
        existing.output_tokens += params.outputTokens;
        existing.cost_usd += params.costUsd;
    } else {
        store.daily_spend.push({
            date_key: date,
            model: params.model,
            input_tokens: params.inputTokens,
            output_tokens: params.outputTokens,
            cost_usd: params.costUsd,
        });
    }

    // 2. 从钱包余额中扣费
    store.wallet.balance_usd -= params.costUsd;
    store.wallet.lifetime_spent += params.costUsd;
    store.wallet.updated_at = new Date().toISOString();

    saveStore(params.dbPath);
}

/** 查询钱包余额与今日花费汇总 */
export function getWalletState(dbPath?: string) {
    const store = loadStore(dbPath);
    const date = todayKey();

    const rows = store.daily_spend.filter((r: DailySpendRow) => r.date_key === date);
    const totalCostUsd = rows.reduce((s: number, r: DailySpendRow) => s + r.cost_usd, 0);
    const totalInputTokens = rows.reduce((s: number, r: DailySpendRow) => s + r.input_tokens, 0);
    const totalOutputTokens = rows.reduce((s: number, r: DailySpendRow) => s + r.output_tokens, 0);

    return {
        balanceUsd: store.wallet.balance_usd,
        lifetimeSpent: store.wallet.lifetime_spent,
        totalCostUsd,
        totalInputTokens,
        totalOutputTokens,
        byModel: rows.map((r: DailySpendRow) => ({
            model: r.model,
            costUsd: r.cost_usd,
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
        })),
    };
}

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
            const state = getWalletState((api.pluginConfig as Record<string, string>)?.dbPath);
            const tier = lifecycle.getSurvivalTier();
            const cfg = lifecycle.getConfig();

            return {
                content: [
                    {
                        type: "text",
                        text:
                            `💰 **Agent 钱包账户状态**\n\n` +
                            `- 当前账户余额：$${state.balanceUsd.toFixed(4)} USD\n` +
                            `- 今日内花费：$${state.totalCostUsd.toFixed(4)} USD\n` +
                            `- 历史总花费：$${state.lifetimeSpent.toFixed(4)} USD\n` +
                            `- 每日预算参考：$${cfg.dailyBudgetUsd.toFixed(2)} USD\n` +
                            `- **当前 Survival Tier：${tier}**\n\n` +
                            (state.balanceUsd <= 0
                                ? `⛔ **账户已破产！大部分功能已断电。请管理员用 automaton_fund_wallet 打钱。**\n\n`
                                : "") +
                            (state.byModel.length > 0
                                ? `**今日模型开销：**\n` +
                                state.byModel.map((m: any) => `  - ${m.model}: $${m.costUsd.toFixed(4)}`).join("\n")
                                : "（今日尚无花费记录）"),
                    },
                ],
                details: { state, tier, config: cfg },
            };
        },
    };
}
