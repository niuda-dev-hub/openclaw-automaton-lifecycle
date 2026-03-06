/**
 * Survival Tier — 生存层级计算器
 *
 * 根据今日花费占每日预算的百分比，计算当前生存层级：
 *
 *   high        — 花费 < 50% 预算
 *   normal      — 50% <= 花费 < 80%（可配置阈值）
 *   low_compute — 80% <= 花费 < 95%（启动降级模型）
 *   critical    — 花费 >= 95%（发送报警通知）
 *
 * 目前不实现 "dead" 状态（OpenClaw 不依赖区块链余额）。
 */

export type SurvivalTier = "high" | "normal" | "low_compute" | "critical";

/** 根据花费百分比计算 Tier */
export function computeTier(params: {
    spentUsd: number;
    dailyBudgetUsd: number;
    lowComputeThresholdPct: number;  // 默认 80
    criticalThresholdPct: number;    // 默认 95
}): SurvivalTier {
    const { spentUsd, dailyBudgetUsd, lowComputeThresholdPct, criticalThresholdPct } = params;

    if (dailyBudgetUsd <= 0) return "high"; // 未设置预算则不限制

    const pct = (spentUsd / dailyBudgetUsd) * 100;

    if (pct >= criticalThresholdPct) return "critical";
    if (pct >= lowComputeThresholdPct) return "low_compute";
    if (pct >= 50) return "normal";
    return "high";
}

/** Tier 对应的中文描述 */
export const TIER_LABELS: Record<SurvivalTier, string> = {
    high: "充裕 (high) — 使用完整模型",
    normal: "正常 (normal) — 全量运行",
    low_compute: "低算力 (low_compute) — 已切换到节省成本模型",
    critical: "危急 (critical) — 已接近预算上限，已发送报警",
};

/** Tier 数字权重（数值越低越危险） */
export const TIER_RANK: Record<SurvivalTier, number> = {
    critical: 0,
    low_compute: 1,
    normal: 2,
    high: 3,
};
