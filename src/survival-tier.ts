/**
 * Survival Tier — 生存层级计算器
 *
 * 在计费方案 A 中，生存层级基于钱包**绝对余额**和日预算来估算健康状况：
 *
 *   high        — 余额充足 (余额 >= 预算*2)
 *   normal      — 余额处于正常浮动区间内
 *   low_compute — 余额较低 (余额 < 预算的某百分比)
 *   critical    — 余额告急 (余额 < 预算极小比例)
 *   dead        — 余额 <= 0，触发断电/功能熔断
 */

export type SurvivalTier = "high" | "normal" | "low_compute" | "critical" | "dead";

/** 
 * 根据余额与配置计算 Tier (计费方案 A 专属逻辑) 
 * 假定：
 * lowComputeThresholdPct = 这里作为警告剩余倍率 (如 1.0 = 剩余不足一倍日预算时降级)
 * criticalThresholdPct = 这里作为危急剩余倍率 (如 0.2 = 剩余不足 20% 日预算时报警)
 */
export function computeTier(params: {
    balanceUsd: number;
    dailyBudgetUsd: number;
    lowComputeThresholdPct: number;
    criticalThresholdPct: number;
}): SurvivalTier {
    const { balanceUsd, dailyBudgetUsd } = params;

    // 虚拟钱包如果见底，直接抛出死亡状态
    if (balanceUsd <= 0.0) return "dead";

    // 如果未设置预算，只要有钱就是 high
    if (dailyBudgetUsd <= 0) return "high";

    // 可以支撑多少天的消耗
    const daysLeft = balanceUsd / dailyBudgetUsd;

    // TODO: 现有的 lowCompute/Critical 参数原始是从花费比例来的（比如 80、95）
    // 为了平滑过渡，如果用户配置的参数 >= 10 (原百分比)，我们进行简单的心智映射：
    // 例如：原始配置 lowCompute = 80%，意味剩余 20% (0.2 天) 降级
    const lowDays = params.lowComputeThresholdPct > 10 ? (100 - params.lowComputeThresholdPct) / 100 : params.lowComputeThresholdPct;
    const criticalDays = params.criticalThresholdPct > 10 ? (100 - params.criticalThresholdPct) / 100 : params.criticalThresholdPct;

    if (daysLeft <= criticalDays) return "critical";
    if (daysLeft <= lowDays) return "low_compute";
    if (daysLeft < 2.0) return "normal";
    return "high";
}

/** Tier 对应的中文描述 */
export const TIER_LABELS: Record<SurvivalTier, string> = {
    high: "充裕 (high) — 账户资金雄厚，使用最强模型自由探索",
    normal: "正常 (normal) — 账户资金平稳运行",
    low_compute: "低算力 (low_compute) — 资金吃紧，已切换到短序列或便宜模型",
    critical: "危急 (critical) — 濒临破产！随时可能断电，请请求管理员打钱！",
    dead: "破产 (dead) — 钱包为零，断开主要运算功能，禁止外发交互。",
};

/** Tier 数字权重（数值越低越危险） */
export const TIER_RANK: Record<SurvivalTier, number> = {
    dead: -1,
    critical: 0,
    low_compute: 1,
    normal: 2,
    high: 3,
};
