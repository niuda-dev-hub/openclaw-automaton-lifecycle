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
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { configDotenv } from "dotenv";

// 将 .env 文件从插件目录自动加载（如果存在）
const __pluginDir = path.dirname(fileURLToPath(import.meta.url));
const __pluginRoot = path.join(__pluginDir, "..");
configDotenv({ path: path.join(__pluginRoot, ".env") });

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

        // 合并配置优先级：.env 文件 → openclaw.json 插件配置 → 默认値
        const raw = (api.pluginConfig ?? {}) as Record<string, any>;

        // 从 .env 或环境变量读取配置
        const envHubUrl = process.env.AGENT_HUB_URL;
        const envAgentId = process.env.AGENT_ID;
        const envBudget = process.env.DAILY_BUDGET_USD ? parseFloat(process.env.DAILY_BUDGET_USD) : undefined;
        const envLowPct = process.env.LOW_COMPUTE_THRESHOLD_PCT ? parseInt(process.env.LOW_COMPUTE_THRESHOLD_PCT) : undefined;
        const envCritPct = process.env.CRITICAL_THRESHOLD_PCT ? parseInt(process.env.CRITICAL_THRESHOLD_PCT) : undefined;
        const envIdleTicks = process.env.IDLE_TICKS_BEFORE_SLOWDOWN ? parseInt(process.env.IDLE_TICKS_BEFORE_SLOWDOWN) : undefined;
        const envIdleMult = process.env.IDLE_HEARTBEAT_MULTIPLIER ? parseInt(process.env.IDLE_HEARTBEAT_MULTIPLIER) : undefined;
        const envLowModel = process.env.LOW_COMPUTE_MODEL || undefined;
        const envSoulModel = process.env.SOUL_REFLECTION_MODEL || undefined;
        const envEnableMem = process.env.ENABLE_MEMORY_JOURNAL !== undefined ? process.env.ENABLE_MEMORY_JOURNAL !== 'false' : undefined;
        const envEnableSoul = process.env.ENABLE_SOUL_REFLECTION !== undefined ? process.env.ENABLE_SOUL_REFLECTION !== 'false' : undefined;

        const idFromEnv = envAgentId || "";
        const idFromRaw = raw.agentId || "";
        this.cfg = {
            dailyBudgetUsd: envBudget ?? raw.dailyBudgetUsd ?? DEFAULTS.dailyBudgetUsd,
            lowComputeThresholdPct: envLowPct ?? raw.lowComputeThresholdPct ?? DEFAULTS.lowComputeThresholdPct,
            criticalThresholdPct: envCritPct ?? raw.criticalThresholdPct ?? DEFAULTS.criticalThresholdPct,
            lowComputeModel: envLowModel ?? raw.lowComputeModel ?? DEFAULTS.lowComputeModel,
            idleHeartbeatMultiplier: envIdleMult ?? raw.idleHeartbeatMultiplier ?? DEFAULTS.idleHeartbeatMultiplier,
            idleTicksBeforeSlowdown: envIdleTicks ?? raw.idleTicksBeforeSlowdown ?? DEFAULTS.idleTicksBeforeSlowdown,
            soulReflectionModel: envSoulModel ?? raw.soulReflectionModel ?? DEFAULTS.soulReflectionModel,
            enableMemoryJournal: envEnableMem ?? raw.enableMemoryJournal ?? DEFAULTS.enableMemoryJournal,
            enableSoulReflection: envEnableSoul ?? raw.enableSoulReflection ?? DEFAULTS.enableSoulReflection,
            agentHubUrl: envHubUrl || raw.agentHubUrl || DEFAULTS.agentHubUrl,
            agentId: idFromEnv || idFromRaw || "",
        };

        if (this.cfg.agentId) {
            const source = idFromEnv ? "Environment (AGENT_ID)" : "Plugin Config (openclaw.json)";
            this.api.logger?.info?.(`[automaton-lifecycle] Using existing agentId "${this.cfg.agentId}" from ${source}`);
        } else {
            this.api.logger?.info?.(`[automaton-lifecycle] No agentId provided. Will auto-register on first use.`);
        }

        // If explicitly provided via config/env, we use it directly. Otherwise it stays empty and triggers auto-register
        this.apiClient = new AutomatonApiClient(this.cfg.agentHubUrl, this.cfg.agentId);
    }

    private _registrationPromise: Promise<void> | null = null;

    /**
     * 懒加载身份：如果用户没有提供 agentId，检查本地 .automaton_identity 文件；
     * 如果文件也没有，则向远端 Agent Hub 申请注册并落盘。
     */
    async ensureRegistered(): Promise<void> {
        if (this.cfg.agentId) return; // 已经有明确配置的 ID

        if (!this._registrationPromise) {
            this._registrationPromise = this._doRegistration();
        }
        return this._registrationPromise;
    }

    private async _doRegistration(): Promise<void> {
        const workspaceDir = (this.api.config?.agents?.defaults as Record<string, string> | undefined)?.workspace ??
            path.join(os.homedir(), ".openclaw", "workspace");
        const identityFile = path.join(workspaceDir.replace(/^~/, os.homedir()), ".automaton_identity");

        try {
            // 尝试读取本地已有的身份 ID
            const content = await fs.readFile(identityFile, "utf-8");
            const savedId = content.trim();
            if (savedId) {
                this.cfg.agentId = savedId;
                this.apiClient.setAgentId(savedId);
                this.api.logger?.info?.(`[automaton-lifecycle] Loaded agent identity from ${identityFile}: ${savedId}`);
                return;
            }
        } catch (e) {
            // 文件不存在或无法读取，继续往下走去注册
        }

        // 本地没有身份证明，去远端注册！
        try {
            this.api.logger?.info?.(`[automaton-lifecycle] No identity found. Auto-registering to Hub ${this.cfg.agentHubUrl}...`);
            const hostname = os.hostname() || "Local";
            const res = await this.apiClient.registerAgent(`OpenClaw Agent (${hostname})`, "Auto-registered thin client via automaton-lifecycle");

            this.cfg.agentId = res.id;
            this.apiClient.setAgentId(res.id);

            // 写入本地保存
            await fs.mkdir(path.dirname(identityFile), { recursive: true });
            await fs.writeFile(identityFile, res.id, "utf-8");
            this.api.logger?.info?.(`[automaton-lifecycle] Successfully registered new identity: ${res.id}`);
        } catch (e) {
            this.api.logger?.error?.(`[automaton-lifecycle] Auto-registration failed! Fallback to default. Error: ${e}`);
            // 最后兜底
            this.cfg.agentId = "default-agent-id";
            this.apiClient.setAgentId("default-agent-id");
        }
    }

    getConfig(): LifecycleConfig {
        return this.cfg;
    }

    /**
     * 刷新并返回当前 Survival Tier。
     * 每次调用都重新通过 SaaS API 读取账户余额，保证实时性。
     */
    async getSurvivalTier(): Promise<SurvivalTier> {
        await this.ensureRegistered();
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
        } catch (err: any) {
            if (err.message?.includes("404")) {
                this.api.logger?.error?.(`[automaton-lifecycle] Agent Hub returned 404 for ID "${this.cfg.agentId}". ` +
                    `If this ID was provided via environment variables, please ensure it exists in the Hub or clear your environment variables to allow auto-registration.`);
            } else {
                this.api.logger?.error?.("getSurvivalTier error: " + err);
            }
        }
        return this._tier;
    }

    /** 获取上次缓存的 Tier（不重新进行网络请求） */
    getCachedTier(): SurvivalTier {
        return this._tier;
    }

    async incrementIdleTick(): Promise<number> {
        await this.ensureRegistered();
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
        await this.ensureRegistered();
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
        await this.ensureRegistered();
        try {
            await this.apiClient.updateAutomatonState({ heartbeat_interval_ms: intervalMs });
        } catch (e) { }
    }

    async pingHeartbeat(): Promise<void> {
        await this.ensureRegistered();
        try {
            await this.apiClient.pingHeartbeat();
        } catch (e) {
            this.api.logger?.error?.("pingHeartbeat error: " + e);
        }
    }
}

