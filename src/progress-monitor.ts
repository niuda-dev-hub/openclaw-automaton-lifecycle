import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";

type ResolvedCfg = {
  enabled: boolean;
  useAi: boolean;
  aiUrl: string;
  aiKey: string;
  aiModel: string;
  notifyOnAiError: boolean;
  cooldownMs: number;
  monitorNoReply: boolean;
  monitorSlowReply: boolean;
  slowReplyThresholdMs: number;
  noReplyCooldownMs: number;
};

function readBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(s)) return true;
    if (["0", "false", "no", "n", "off"].includes(s)) return false;
  }
  return fallback;
}

function readNum(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function normalizeContentToText(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    const pieces = content
      .filter(
        (p: unknown) =>
          !!p &&
          typeof p === "object" &&
          (p as { type?: unknown }).type === "text" &&
          typeof (p as { text?: unknown }).text === "string",
      )
      .map((p: unknown) => (p as { text: string }).text.trim())
      .filter(Boolean);
    if (pieces.length) return pieces.join("\n\n");
  }

  if (content && typeof content === "object" && typeof (content as { text?: unknown }).text === "string") {
    return (content as { text: string }).text;
  }

  return "";
}

function pickLastTextByRole(messages: unknown[], role: "user" | "assistant"): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: unknown; content?: unknown };
    if (m?.role !== role) continue;
    const txt = normalizeContentToText(m?.content);
    if (txt) return txt;
  }
  return "";
}

function clamp(s: string, max = 120): string {
  const t = (s ?? "").toString().trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, Math.max(0, max - 1)) + "…";
}

function resolveCfg(api: OpenClawPluginApi): ResolvedCfg {
  const raw = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const pm = (raw.progressMonitor ?? {}) as Record<string, unknown>;

  const enabled = readBool(process.env.PROGRESS_MONITOR_ENABLED ?? pm.enabled, false);
  const useAi = readBool(process.env.PROGRESS_MONITOR_USE_AI ?? pm.useAi, false);
  const aiUrl =
    (process.env.PROGRESS_MONITOR_AI_URL || process.env.OPENAI_BASE_URL || (pm.aiUrl as string) || "").trim();
  const aiKey =
    (process.env.PROGRESS_MONITOR_AI_KEY || process.env.OPENAI_API_KEY || (pm.aiKey as string) || "").trim();
  const aiModel =
    (process.env.PROGRESS_MONITOR_AI_MODEL || (pm.aiModel as string) || "minimax-m2.5").trim();
  const notifyOnAiError = readBool(
    process.env.PROGRESS_MONITOR_NOTIFY_ON_AI_ERROR ?? pm.notifyOnAiError,
    false,
  );
  const cooldownMs = readNum(process.env.PROGRESS_MONITOR_COOLDOWN ?? pm.cooldownMs, 120000);
  const monitorNoReply = readBool(process.env.PROGRESS_MONITOR_MONITOR_NO_REPLY ?? pm.monitorNoReply, true);
  const monitorSlowReply = readBool(process.env.PROGRESS_MONITOR_MONITOR_SLOW_REPLY ?? pm.monitorSlowReply, true);
  const slowReplyThresholdMs = readNum(
    process.env.PROGRESS_MONITOR_SLOW_REPLY_THRESHOLD ?? pm.slowReplyThresholdMs,
    30000,
  );
  const noReplyCooldownMs = readNum(
    process.env.PROGRESS_MONITOR_NO_REPLY_COOLDOWN ?? pm.noReplyCooldownMs,
    600000,
  );

  return {
    enabled,
    useAi,
    aiUrl,
    aiKey,
    aiModel,
    notifyOnAiError,
    cooldownMs,
    monitorNoReply,
    monitorSlowReply,
    slowReplyThresholdMs,
    noReplyCooldownMs,
  };
}

async function analyzeConversation(cfg: ResolvedCfg, messages: unknown[], api: OpenClawPluginApi): Promise<unknown> {
  if (!cfg.aiUrl || !cfg.aiKey) {
    return { shouldNotify: false, reason: "missing_ai_config" };
  }

  const recent = messages.slice(-10) as Array<{ role?: unknown; content?: unknown }>;
  const text = recent
    .map((m) => {
      const role = m.role === "assistant" ? "助手" : "用户";
      const content = clamp(normalizeContentToText(m.content) || "[non-text]", 500);
      return `${role}: ${content}`;
    })
    .join("\n\n");

  const prompt = `你是一个监督代理，判断助手是否需要通过 Telegram 通知用户。\n\n对话内容：\n${text}\n\n请输出 JSON（无代码块）：\n{"shouldNotify":false,"reason":"原因"} 或 {"shouldNotify":true,"title":"标题","message":"内容","group":"分类"}`;

  const res = await fetch(cfg.aiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.aiKey}`,
    },
    body: JSON.stringify({
      model: cfg.aiModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    const detail = (raw || "").slice(0, 1200);
    api.logger?.error?.(`[progress-monitor] AI API error: ${res.status} detail=${detail}`);

    if (cfg.notifyOnAiError) {
      return {
        shouldNotify: true,
        group: "系统警告",
        title: "progress-monitor 模型调用失败",
        message: `HTTP ${res.status}\nmodel=${cfg.aiModel}\nurl=${cfg.aiUrl}\n\n${detail}`,
      };
    }

    return { shouldNotify: false, reason: `api:${res.status}` };
  }

  const data = (await res.json().catch(() => ({}))) as any;
  const out = (data?.choices?.[0]?.message?.content || "").toString();
  const clean = out.replace(/```json\n?|\n?```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    api.logger?.error?.(`[progress-monitor] Failed to parse AI response: ${out.slice(0, 800)}`);
    return { shouldNotify: false, reason: "parse_error" };
  }
}

export function initProgressMonitor(api: OpenClawPluginApi, lifecycle: AutomatonLifecycleManager): void {
  const cfg = resolveCfg(api);
  if (!cfg.enabled) {
    api.logger?.info?.("[progress-monitor] Disabled (progressMonitor.enabled=false)");
    return;
  }

  const supportsEvents = typeof (api as any).on === "function";
  if (!supportsEvents) {
    api.logger?.warn?.("[progress-monitor] OpenClawPluginApi.on not available; progress monitor not attached");
    return;
  }

  let lastNotifyTime = 0;
  let lastNoReplyNotifyTime = 0;

  (api as any).on("after_tool_call", (event: any, ctx: any) => {
    try {
      const toolName = typeof event?.toolName === "string" ? event.toolName : "";
      const durationMs = typeof event?.durationMs === "number" ? event.durationMs : undefined;
      const error = typeof event?.error === "string" ? event.error : undefined;
      const runId = typeof event?.runId === "string" ? event.runId : undefined;
      const sessionId = typeof ctx?.sessionId === "string" ? ctx.sessionId : undefined;

      lifecycle.emitLifecycleEvent("openclaw:after_tool_call", {
        toolName,
        durationMs,
        error,
        runId,
        sessionId,
      });
    } catch (err) {
      api.logger?.warn?.(`[progress-monitor] after_tool_call hook handler failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  (api as any).on("agent_end", async (event: any) => {
    const now = Date.now();

    const durationMs = typeof event?.durationMs === "number" ? event.durationMs : event?.duration;
    const replies = typeof event?.replies === "number" ? event.replies : undefined;

    lifecycle.emitLifecycleEvent("agent:end", { durationMs, replies });

    if (cfg.monitorSlowReply && typeof durationMs === "number" && durationMs >= cfg.slowReplyThresholdMs) {
      if (now - lastNoReplyNotifyTime >= cfg.noReplyCooldownMs) {
        lifecycle.emitLifecycleEvent("progress:slow_reply", {
          durationMs,
          thresholdMs: cfg.slowReplyThresholdMs,
        });
        lastNoReplyNotifyTime = now;
      }
    }

    if (cfg.monitorNoReply && replies === 0) {
      if (now - lastNoReplyNotifyTime >= cfg.noReplyCooldownMs) {
        lifecycle.emitLifecycleEvent("progress:no_reply", { replies });
        lastNoReplyNotifyTime = now;
      }
    }

    if (now - lastNotifyTime < cfg.cooldownMs) return;

    const messages = (event?.messages || []) as unknown[];
    if (!Array.isArray(messages) || messages.length === 0) return;

    if (!cfg.useAi) {
      const userText = pickLastTextByRole(messages, "user");
      const assistantText = pickLastTextByRole(messages, "assistant");
      lifecycle.emitLifecycleEvent("progress:task_done", {
        kind: "task",
        userText,
        assistantText,
      });
      lastNotifyTime = now;
      return;
    }

    const result = (await analyzeConversation(cfg, messages, api)) as any;
    if (result?.shouldNotify && result?.title && result?.message) {
      lifecycle.emitLifecycleEvent("progress:ai_notify", {
        group: result.group || "重要消息",
        title: String(result.title),
        message: String(result.message),
      });
      lastNotifyTime = now;
    }
  });
}
