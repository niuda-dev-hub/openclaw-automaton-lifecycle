type BudgetAlertPayload = { spent: number; budget: number; pct: number };
type HeartbeatAnomalyPayload = { idleCount: number; intervalMs: number; reason?: string };
type SoulUpdatePayload = { hash: string; source: string };
type AgentEndPayload = { durationMs?: number; replies?: number };

type ProgressTaskDonePayload = {
  kind: "task" | "cron";
  userText: string;
  assistantText: string;
};

type ProgressSlowReplyPayload = { durationMs: number; thresholdMs: number };
type ProgressNoReplyPayload = { replies: number };
type ProgressAiNotifyPayload = { group: string; title: string; message: string };

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function ts(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export function buildNotificationMessage(event: string, data: unknown): string {
  const at = ts();

  switch (event) {
    case "budget:alert":
      return buildBudgetAlert(data as BudgetAlertPayload, at);
    case "heartbeat:anomaly":
      return buildHeartbeatAnomaly(data as HeartbeatAnomalyPayload, at);
    case "soul:update":
      return buildSoulUpdate(data as SoulUpdatePayload, at);
    case "agent:end":
      return buildAgentEnd(data as AgentEndPayload, at);
    case "progress:task_done":
      return buildProgressTaskDone(data as ProgressTaskDonePayload, at);
    case "progress:slow_reply":
      return buildProgressSlowReply(data as ProgressSlowReplyPayload, at);
    case "progress:no_reply":
      return buildProgressNoReply(data as ProgressNoReplyPayload, at);
    case "progress:ai_notify":
      return buildProgressAiNotify(data as ProgressAiNotifyPayload, at);
    default:
      return `Event: ${event}\nTime: ${at}\n\n${safeJson(data)}`;
  }
}

function buildBudgetAlert(data: BudgetAlertPayload, at: string): string {
  return [
    "⚠️ Budget Alert",
    `Spent: $${data.spent.toFixed(4)} / $${data.budget.toFixed(2)} (${data.pct.toFixed(1)}%)`,
    `Time: ${at}`,
  ].join("\n");
}

function buildHeartbeatAnomaly(data: HeartbeatAnomalyPayload, at: string): string {
  const intervalMin = Math.round(data.intervalMs / 60000);
  const reason = data.reason ? `Reason: ${data.reason}` : "";
  return [
    "💓 Heartbeat Anomaly",
    `Idle ticks: ${data.idleCount}`,
    `Interval: ${intervalMin} min`,
    reason,
    `Time: ${at}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSoulUpdate(data: SoulUpdatePayload, at: string): string {
  return [
    "🪞 SOUL Updated",
    `Version: ${data.hash}`,
    `Source: ${data.source}`,
    `Time: ${at}`,
  ].join("\n");
}

function buildAgentEnd(data: AgentEndPayload, at: string): string {
  const duration = typeof data.durationMs === "number" ? `${Math.round(data.durationMs)}ms` : "(unknown)";
  const replies = typeof data.replies === "number" ? String(data.replies) : "(unknown)";
  return ["✅ Agent End", `Duration: ${duration}`, `Replies: ${replies}`, `Time: ${at}`].join("\n");
}

function clamp(s: string, max: number): string {
  const t = (s ?? "").toString().trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, Math.max(0, max - 1)) + "…";
}

function buildProgressTaskDone(data: ProgressTaskDonePayload, at: string): string {
  const head = data.kind === "cron" ? "⏰ 定时任务到点" : "✅ 任务完成";
  const user = clamp(data.userText, 120) || "(无)";
  const assistant = clamp(data.assistantText, 160) || "(无)";
  return [head + "：" + user, assistant, `Time: ${at}`].join("\n");
}

function buildProgressSlowReply(data: ProgressSlowReplyPayload, at: string): string {
  return [
    "⚠️ 回复延迟偏高",
    `Duration: ${(data.durationMs / 1000).toFixed(1)}s (threshold ${(data.thresholdMs / 1000).toFixed(0)}s)`,
    `Time: ${at}`,
  ].join("\n");
}

function buildProgressNoReply(data: ProgressNoReplyPayload, at: string): string {
  return [
    "⚠️ 收到消息但未回复",
    `replies=${data.replies}`,
    "Hint: If users report 'no reply', search logs for replies=0.",
    `Time: ${at}`,
  ].join("\n");
}

function buildProgressAiNotify(data: ProgressAiNotifyPayload, at: string): string {
  return [
    `📋 ${data.group}`,
    "",
    data.title,
    data.message,
    "",
    `Time: ${at}`,
  ].join("\n");
}
