/**
 * Telegram Notification Module
 * 
 * Listens to lifecycle events and sends Telegram notifications.
 * Disabled by default (requires TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID).
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";
import { TelegramClient } from "./telegram/telegram-client.js";
import { buildNotificationMessage } from "./telegram/message-formatter.js";

export interface TelegramNotifierConfig {
    enabled: boolean;
    botToken?: string;
    chatId?: string;
    parseMode: "MarkdownV2" | "HTML";
    silentMode: {
        enabled: boolean;
        timezone: string;
        nightStart: number;
        nightEnd: number;
    };
    notifyOn: {
        budgetAlert: boolean;
        heartbeatAnomaly: boolean;
        soulUpdate: boolean;
        agentEnd: boolean;
    };
}

const DEFAULT_CONFIG: TelegramNotifierConfig = {
    enabled: false,  // Disabled by default
    botToken: undefined,
    chatId: undefined,
    parseMode: "MarkdownV2",
    silentMode: {
        enabled: false,
        timezone: "UTC",
        nightStart: 22,
        nightEnd: 8
    },
    notifyOn: {
        budgetAlert: true,
        heartbeatAnomaly: true,
        soulUpdate: false,
        agentEnd: false
    }
};

export class TelegramNotifier {
    private api: OpenClawPluginApi;
    private lifecycle: AutomatonLifecycleManager;
    private client?: TelegramClient;
    private config: TelegramNotifierConfig;

    constructor(api: OpenClawPluginApi, lifecycle: AutomatonLifecycleManager) {
        this.api = api;
        this.lifecycle = lifecycle;
        this.config = this.loadConfig();
        
        if (this.config.enabled && this.config.botToken && this.config.chatId) {
            this.client = new TelegramClient({
                botToken: this.config.botToken,
                chatId: this.config.chatId,
                parseMode: this.config.parseMode,
                silentMode: this.config.silentMode.enabled ? this.config.silentMode : undefined
            });
            this.registerEventListeners();
            this.api.logger?.info?.("[telegram-notifier] Initialized with Telegram client");
        } else {
            this.api.logger?.info?.("[telegram-notifier] Disabled (missing credentials or enabled: false)");
        }
    }

    private loadConfig(): TelegramNotifierConfig {
        const raw = (this.api.pluginConfig ?? {}) as Record<string, any>;
        const telegram = raw.telegram ?? {};
        
        return {
            enabled: telegram.enabled ?? process.env.TELEGRAM_ENABLED === "true",
            botToken: telegram.botToken ?? process.env.TELEGRAM_BOT_TOKEN,
            chatId: telegram.chatId ?? process.env.TELEGRAM_CHAT_ID,
            parseMode: telegram.parseMode ?? "MarkdownV2",
            silentMode: {
                enabled: telegram.silentMode?.enabled ?? process.env.TELEGRAM_SILENT_MODE === "true",
                timezone: telegram.silentMode?.timezone ?? process.env.TELEGRAM_TIMEZONE ?? "UTC",
                nightStart: telegram.silentMode?.nightStart ?? 22,
                nightEnd: telegram.silentMode?.nightEnd ?? 8
            },
            notifyOn: {
                budgetAlert: telegram.notifyOn?.budgetAlert ?? true,
                heartbeatAnomaly: telegram.notifyOn?.heartbeatAnomaly ?? true,
                soulUpdate: telegram.notifyOn?.soulUpdate ?? false,
                agentEnd: telegram.notifyOn?.agentEnd ?? false
            }
        };
    }

    private registerEventListeners(): void {
        // Budget alerts
        if (this.config.notifyOn.budgetAlert) {
            this.lifecycle.on("budget:alert", (data) => {
                this.sendNotification("budget:alert", data);
            });
        }

        // Heartbeat anomalies
        if (this.config.notifyOn.heartbeatAnomaly) {
            this.lifecycle.on("heartbeat:anomaly", (data) => {
                this.sendNotification("heartbeat:anomaly", data);
            });
        }

        // SOUL updates
        if (this.config.notifyOn.soulUpdate) {
            this.lifecycle.on("soul:update", (data) => {
                this.sendNotification("soul:update", data);
            });
        }

        // Agent task completion
        if (this.config.notifyOn.agentEnd) {
            this.lifecycle.on("agent:end", (data) => {
                this.sendNotification("agent:end", data);
            });
        }
    }

    private async sendNotification(event: string, data: any): Promise<void> {
        if (!this.client) return;

        const message = buildNotificationMessage(event, data);
        const success = await this.client.sendMessage(message);
        
        if (success) {
            this.api.logger?.info?.(`[telegram-notifier] Sent ${event} notification`);
        } else {
            this.api.logger?.warn?.(`[telegram-notifier] Failed to send ${event} notification`);
        }
    }

    /**
     * Manual notification method for external use
     */
    async notify(event: string, data: any, forceSound = false): Promise<void> {
        if (!this.client) {
            throw new Error("Telegram client not initialized (check config)");
        }
        
        const message = buildNotificationMessage(event, data);
        await this.client.sendMessage(message, forceSound);
    }

    /**
     * Check if telegram notifications are enabled
     */
    isEnabled(): boolean {
        return this.config.enabled && !!this.client;
    }
}

/**
 * Factory function to create and initialize Telegram notifier
 */
export function createTelegramNotifier(
    api: OpenClawPluginApi,
    lifecycle: AutomatonLifecycleManager
): TelegramNotifier {
    return new TelegramNotifier(api, lifecycle);
}
