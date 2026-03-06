/**
 * Wallet Manager — 充值工具（JSON 文件版）
 *
 * Tool: automaton_fund_wallet
 */
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import { loadStore, saveStore } from "./db.js";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";

export function createWalletTools(api: OpenClawPluginApi, lifecycle: AutomatonLifecycleManager) {
    return [
        {
            name: "automaton_fund_wallet",
            label: "为 Agent 钱包补给资金",
            description:
                "当账户余额不足或处于 dead(破产) 状态时，管理者可调用此工具注入虚拟资金(USD)，随即复活。",
            parameters: Type.Object({
                amount_usd: Type.Number({ description: "注资金额，例如 10.0" }),
                memo: Type.Optional(Type.String({ description: "充资备注" })),
            }),

            async execute(_id: string, params: Record<string, unknown>) {
                const amount = Number(params.amount_usd);
                if (isNaN(amount) || amount <= 0) {
                    return { content: [{ type: "text", text: "❌ 注资金额必须大于 0" }] };
                }

                const dbPath = (api.pluginConfig as Record<string, string>)?.dbPath;
                const store = loadStore(dbPath);

                store.wallet.balance_usd += amount;
                store.wallet.updated_at = new Date().toISOString();
                saveStore(dbPath);

                const newTier = lifecycle.getSurvivalTier();
                api.logger?.info?.(
                    `[automaton-lifecycle] Wallet funded: +$${amount.toFixed(2)}, Memo: ${params.memo ?? "N/A"}, New Balance: $${store.wallet.balance_usd.toFixed(4)}`
                );

                return {
                    content: [
                        {
                            type: "text",
                            text:
                                `✅ **充值成功！**\n\n` +
                                `- 注入金额：$${amount.toFixed(2)} USD\n` +
                                `- 当前余额：$${store.wallet.balance_usd.toFixed(4)} USD\n` +
                                `- 新 Survival Tier：**${newTier}**\n` +
                                (params.memo ? `- 备注：${params.memo}` : ""),
                        },
                    ],
                    details: { added: amount, new_balance: store.wallet.balance_usd, new_tier: newTier },
                };
            },
        },
    ];
}
