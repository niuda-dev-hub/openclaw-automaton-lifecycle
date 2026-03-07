/**
 * Lifecycle Manager — 插件跨模块状态的核心管理器
 *
 * 职责：
 *  1. 持有插件配置（带默认值）
 *  2. 维护当前 Survival Tier（基于今日花费计算）
 *  3. 追踪连续空闲心跳次数，驱动 adaptive-heartbeat 逻辑
 *  4. 对外提供 getSurvivalTier() / getConfig() 等查询接口
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import { computeTier } from "./survival-tier.js";
import type { SurvivalTier } from "./survival-tier.js";
import { AutomatonApiClient } from "./api-client.js";

export interface LifecycleConfig {
    dailyBudgetUsd: number;
    lowComputeThresholdPct: number;
    criticalThresholdPct: number;
    lowComputeModel: string | undefined;
    idleHeartbeatMultiplier: number;
    idleTicksBeforeSlowdown: number;
    soulReflectionModel: string | undefined;
    enableMemoryJournal: boolean;
    enableSoulReflection: boolean;
    agentHubUrl: string;
    agentId: string;
}

const DEFAULTS: LifecycleConfig = {
    dailyBudgetUsd: 5.0,
    lowComputeThresholdPct: 80,
    criticalThresholdPct: 95,
    lowComputeModel: undefined,
    idleHeartbeatMultiplier: 2,
    idleTicksBeforeSlowdown: 3,
    soulReflectionModel: undefined,
    enableMemoryJournal: true,
    enableSoulReflection: true,
    agentHubUrl: "http://127.0.0.1:8000",
    agentId: "default-agent-id",
};

export class AutomatonLifecycleManager {
    private api: OpenClawPluginApi;
    private cfg: LifecycleConfig;
    public apiClient: AutomatonApiClient;

    /** 最近一次刷新出来的生存层级 */
    private _tier: SurvivalTier = "high";

    /** 连续空闲（HEARTBEAT_OK）的心跳次数 */
    private _idleTickCount = 0;

    constructor(api: OpenClawPluginApi) {
        this.api = api;

        // 合并用户配置（包括从 env 获取 URL 和 ID）
        const raw = (api.pluginConfig ?? {}) as Record<string, any>;
        const envHubUrl = process.env.AGENT_HUB_URL;
        const envAgentId = process.env.AGENT_ID;

        this.cfg = {
            dailyBudgetUsd: raw.dailyBudgetUsd ?? DEFAULTS.dailyBudgetUsd,
            lowComputeThresholdPct: raw.lowComputeThresholdPct ?? DEFAULTS.lowComputeThresholdPct,
            criticalThresholdPct: raw.criticalThresholdPct ?? DEFAULTS.criticalThresholdPct,
            lowComputeModel: raw.lowComputeModel ?? DEFAULTS.lowComputeModel,
            idleHeartbeatMultiplier: raw.idleHeartbeatMultiplier ?? DEFAULTS.idleHeartbeatMultiplier,
            idleTicksBeforeSlowdown: raw.idleTicksBeforeSlowdown ?? DEFAULTS.idleTicksBeforeSlowdown,
            soulReflectionModel: raw.soulReflectionModel ?? DEFAULTS.soulReflectionModel,
            enableMemoryJournal: raw.enableMemoryJournal ?? DEFAULTS.enableMemoryJournal,
            enableSoulReflection: raw.enableSoulReflection ?? DEFAULTS.enableSoulReflection,
            agentHubUrl: envHubUrl || raw.agentHubUrl || DEFAULTS.agentHubUrl,
            agentId: envAgentId || raw.agentId || DEFAULTS.agentId,
        };

        this.apiClient = new AutomatonApiClient(this.cfg.agentHubUrl, this.cfg.agentId);
    }

    getConfig(): LifecycleConfig {
        return this.cfg;
    }

    /**
     * 刷新并返回当前 Survival Tier。
     * 每次调用都重新通过 SaaS API 读取账户余额，保证实时性。
     */
    async getSurvivalTier(): Promise<SurvivalTier> {
        try {
            const state = await this.apiClient.getAutomatonState();
            // sync to cache 
            this._idleTickCount = state.consecutive_idles;

            this._tier = computeTier({
                balanceUsd: state.balance_usd,
                dailyBudgetUsd: this.cfg.dailyBudgetUsd,
                lowComputeThresholdPct: this.cfg.lowComputeThresholdPct,
                criticalThresholdPct: this.cfg.criticalThresholdPct,
            });
        } catch (err) {
            this.api.logger?.error?.("getSurvivalTier error: " + err);
        }
        return this._tier;
    }

    /** 获取上次缓存的 Tier（不重新进行网络请求） */
    getCachedTier(): SurvivalTier {
        return this._tier;
    }

    /** 心跳内容为 HEARTBEAT_OK 时调用，返回当前连续空闲次数 */
    async incrementIdleTick(): Promise<number> {
        this._idleTickCount++;
        try {
            await this.apiClient.updateAutomatonState({ consecutive_idles: this._idleTickCount });
        } catch (e) {
            // ignore network errors to keep automaton alive
        }
        return this._idleTickCount;
    }

    /** 代理产生了实质性动作时重置计数 */
    async resetIdleTick(): Promise<void> {
        this._idleTickCount = 0;
        try {
            await this.apiClient.updateAutomatonState({ consecutive_idles: 0 });
        } catch (e) { }
    }

    getIdleTickCount(): number {
        return this._idleTickCount;
    }

    /** 是否已达触发心跳放缓的门槛 */
    shouldSlowDownHeartbeat(): boolean {
        return this._idleTickCount >= this.cfg.idleTicksBeforeSlowdown;
    }

    async updateHeartbeatInterval(intervalMs: number): Promise<void> {
        try {
            await this.apiClient.updateAutomatonState({ heartbeat_interval_ms: intervalMs });
        } catch (e) { }
    }

    async pingHeartbeat(): Promise<void> {
        try {
            await this.apiClient.pingHeartbeat();
        } catch (e) {
            this.api.logger?.error?.("pingHeartbeat error: " + e);
        }
    }
}

