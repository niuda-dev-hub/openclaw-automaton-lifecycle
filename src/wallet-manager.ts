/**
 * Wallet Manager — 计费钱包管理工具
 *
 * 允许管理者为 Agent 账户余额进行充值（打钱）。
 *
 * Tool: automaton_fund_wallet
 */
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import { getDb } from "./db.js";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";

export function createWalletTools(
    api: OpenClawPluginApi,
    lifecycle: AutomatonLifecycleManager,
) {
    return [
        {
            name: "automaton_fund_wallet",
            label: "为 Agent 钱包补给资金",
            description:
                "当账户余额不足或破产(dead)时，可以调用此工具向钱包中注入虚拟资金(USD)。\n" +
                "仅限于被授权的管理者或是拥有虚拟货币的实体调用。不要给自己随便加钱！",
            parameters: Type.Object({
                amount_usd: Type.Number({ description: "注资金额 (例如 10.0)" }),
                memo: Type.Optional(Type.String({ description: "充资备注" })),
            }),

            async execute(_id: string, params: Record<string, unknown>) {
                const amount = Number(params.amount_usd);
                if (isNaN(amount) || amount <= 0) {
                    return { error: "注资金额必须大于 0" };
                }

                const dbPath = (api.pluginConfig as Record<string, string>)?.dbPath;
                const db = getDb(dbPath);

                db.prepare(`
                    UPDATE agent_wallets 
                    SET balance_usd = balance_usd + ?, updated_at = datetime('now')
                    WHERE id = 'default'
                `).run(amount);

                // 获取充值后的当前余额与 tier 刷新状态
                const row = db.prepare("SELECT balance_usd FROM agent_wallets WHERE id='default'").get() as { balance_usd: number };
                const newTier = lifecycle.getSurvivalTier(); // 立即重新计算并刷新缓存

                // 可以写一条系统行为日志以便日后追踪
                api.logger?.info?.(`[automaton-lifecycle] Wallet funded: +$${amount.toFixed(2)}, Memo: ${params.memo}, New Balance: $${row.balance_usd.toFixed(4)}`);

                return {
                    content: [
                        {
                            type: "text",
                            text: `✅ **充值成功**\n\n- 注资金额: $${amount.toFixed(2)}\n- 新账户余额: $${row.balance_usd.toFixed(4)}\n- 状态刷新为: ${newTier}`,
                        },
                    ],
                    details: {
                        added: amount,
                        new_balance: row.balance_usd,
                        new_tier: newTier,
                    },
                };
            },
        },
    ];
}
