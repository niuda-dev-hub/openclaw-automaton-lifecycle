/**
 * Telegram Client
 * 
 * Simple wrapper for Telegram Bot API with silent mode support.
 */
import { fetch } from "undici";

export interface TelegramConfig {
    botToken: string;
    chatId: string;
    parseMode?: "MarkdownV2" | "HTML";
    silentMode?: {
        enabled: boolean;
        timezone: string;
        nightStart: number;
        nightEnd: number;
    };
}

interface TelegramResponse {
    ok: boolean;
    description?: string;
    result?: unknown;
}

export class TelegramClient {
    private config: TelegramConfig;
    private baseUrl = "https://api.telegram.org/bot";

    constructor(config: TelegramConfig) {
        this.config = config;
    }

    /**
     * Check if currently in silent period
     */
    private isSilentPeriod(): boolean {
        if (!this.config.silentMode?.enabled) return false;
        
        const now = new Date();
        const tz = this.config.silentMode.timezone;
        
        // Get hour in specified timezone
        const hourStr = now.toLocaleString("en-US", { 
            timeZone: tz, 
            hour12: false, 
            hour: "numeric" 
        });
        const hour = parseInt(hourStr, 10);
        
        const { nightStart, nightEnd } = this.config.silentMode;
        
        if (nightStart > nightEnd) {
            // Spans midnight (e.g., 22:00 - 06:00)
            return hour >= nightStart || hour < nightEnd;
        } else {
            // Same day (e.g., 01:00 - 05:00)
            return hour >= nightStart && hour < nightEnd;
        }
    }

    /**
     * Send message to Telegram
     * 
     * @param message - Pre-formatted message (MarkdownV2 escaped)
     * @param forceSound - Override silent mode
     */
    async sendMessage(message: string, forceSound = false): Promise<boolean> {
        const url = `${this.baseUrl}${this.config.botToken}/sendMessage`;
        
        const body = {
            chat_id: this.config.chatId,
            text: message,
            parse_mode: this.config.parseMode,
            disable_notification: !forceSound && this.isSilentPeriod(),
        };

        if (!body.parse_mode) {
            delete (body as { parse_mode?: string }).parse_mode;
        }

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            const result = await response.json() as TelegramResponse;
            
            if (!result.ok) {
                throw new Error(`Telegram API error: ${result.description ?? "Unknown error"}`);
            }

            return true;
        } catch (error: any) {
            console.error("[telegram-client] Send failed:", error.message);
            return false;
        }
    }
}
