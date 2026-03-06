/**
 * Spend Tracker — Token 花费追踪器
 *
 * 记录每次推理调用的 Token 用量和 USD 花费，
 * 供 survival-tier 判断当前生存层级使用。
 *
 * Tool: automaton_check_spend
 *   - 查询今日累计花费和当前 Survival Tier
 */
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import { getDb, todayKey } from "./db.js";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";

/**
 * 记录一次推理调用的花费，并从 Agent 虚拟钱包中扣费。
 * 由 lifecycle-manager 在接收到推理事件后调用。
 */
export function recordSpend(params: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    dbPath?: string;
}): void {
    const db = getDb(params.dbPath);
    const date = todayKey();

    // 开启事务保证记录流水和扣费的原子性
    const tx = db.transaction(() => {
        // 1. 记录每日消费流水
        db.prepare(`
        INSERT INTO daily_spend (date_key, model, input_tokens, output_tokens, cost_usd)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(date_key, model) DO UPDATE SET
          input_tokens  = input_tokens  + excluded.input_tokens,
          output_tokens = output_tokens + excluded.output_tokens,
          cost_usd      = cost_usd      + excluded.cost_usd,
          updated_at    = datetime('now')
        `).run(date, params.model, params.inputTokens, params.outputTokens, params.costUsd);

        // 2. 从钱包余额中实时扣费
        db.prepare(`
        UPDATE agent_wallets
        SET 
            balance_usd = balance_usd - ?,
            lifetime_spent = lifetime_spent + ?,
            updated_at = datetime('now')
        WHERE id = 'default'
        `).run(params.costUsd, params.costUsd);
    });

    tx();
}

/**
 * 查询钱包余额以及今日花费汇总。
 */
export function getWalletState(dbPath?: string): {
    balanceUsd: number;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    byModel: Array<{ model: string; costUsd: number; inputTokens: number; outputTokens: number }>;
} {
    const db = getDb(dbPath);
    const date = todayKey();

    // 1. 获取当前钱包余额
    const wallet = db.prepare(`SELECT balance_usd FROM agent_wallets WHERE id = 'default'`).get() as { balance_usd: number } | undefined;
    const balanceUsd = wallet ? wallet.balance_usd : 0;

    // 2. 获取今日开销列表
    const rows = db.prepare(`
    SELECT model, input_tokens, output_tokens, cost_usd
    FROM daily_spend
    WHERE date_key = ?
    ORDER BY cost_usd DESC
  `).all(date) as Array<{
        model: string;
        input_tokens: number;
        output_tokens: number;
        cost_usd: number;
    }>;

    const totalCostUsd = rows.reduce((s, r) => s + r.cost_usd, 0);
    const totalInputTokens = rows.reduce((s, r) => s + r.input_tokens, 0);
    const totalOutputTokens = rows.reduce((s, r) => s + r.output_tokens, 0);

    return {
        balanceUsd,
        totalCostUsd,
        totalInputTokens,
        totalOutputTokens,
        byModel: rows.map((r) => ({
            model: r.model,
            costUsd: r.cost_usd,
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
        })),
    };
}

/** 创建 automaton_check_spend 工具 */
export function createSpendTrackerTool(
    api: OpenClawPluginApi,
    lifecycle: AutomatonLifecycleManager,
) {
    return {
        name: "automaton_check_spend",
        label: "查询今日 API 花费与生存层级",
        description:
            "查询今日累计的 API Token 花费（USD）以及当前的 Survival Tier（high/normal/low_compute/critical）。" +
            "可用于了解剩余预算，决定是否需要降低推理频率或切换到便宜模型。",
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
                            `- 每日预算限制：$${cfg.dailyBudgetUsd.toFixed(2)} USD\n` +
                            `- **当前 Survival Tier：${tier}**\n\n` +
                            `*(提示: 如果余额不足导致存活等级过低，可以联系管理者发送打钱充值命令)*\n\n` +
                            (state.byModel.length > 0
                                ? `**今日模型开销分布：**\n` +
                                state.byModel
                                    .map((m: any) => `  - ${m.model}: $${m.costUsd.toFixed(4)}`)
                                    .join("\n")
                                : "（今日尚无花费记录）"),
                    },
                ],
                details: { state, tier, config: cfg },
            };
        },
    };
}
