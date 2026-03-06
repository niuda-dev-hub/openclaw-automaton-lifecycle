/**
 * Memory Journal — 结构化记忆日志工具（JSON 文件版）
 *
 * 提供 4 个 Agent 工具：
 *  automaton_remember_event   — 保存一条重要情节事件
 *  automaton_recall_events    — 检索历史情节事件
 *  automaton_save_sop         — 保存/更新 SOP 操作规程
 *  automaton_recall_sop       — 按名称检索 SOP
 */
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import { loadStore, saveStore, type EpisodicEvent, type SopRecord } from "./db.js";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";

export function createMemoryJournalTools(api: OpenClawPluginApi, lifecycle: AutomatonLifecycleManager) {
    const dbPath = (api.pluginConfig as Record<string, string>)?.dbPath;

    // ─── Tool 1: automaton_remember_event ────────────────────────────────────
    const rememberEventTool = {
        name: "automaton_remember_event",
        label: "记录重要情节事件",
        description:
            "将一条值得长期记住的重要事件或信息保存到结构化记忆日志中。" +
            "适合保存：用户偏好、任务成功案例、失败教训、学到的新技能等。",
        parameters: Type.Object({
            summary: Type.String({ description: "事件简短摘要（1-2 句话）" }),
            detail: Type.Optional(Type.String({ description: "详细内容（可选）" })),
            importance: Type.Optional(Type.Number({ description: "重要程度 1-5（默认 3）", minimum: 1, maximum: 5 })),
            category: Type.Optional(Type.String({ description: "分类（如 user_preference / task_result / finance）" })),
            tags: Type.Optional(Type.Array(Type.String(), { description: "关键词标签数组" })),
        }),

        async execute(_id: string, params: Record<string, unknown>) {
            if (!lifecycle.getConfig().enableMemoryJournal) {
                return { content: [{ type: "text", text: "记忆日志功能已禁用" }] };
            }

            const store = loadStore(dbPath);
            const summary = String(params.summary ?? "").trim();
            if (!summary) throw new Error("summary 不能为空");

            const newEvent: EpisodicEvent = {
                id: Date.now(),
                session_id: (api as any).sessionId?.toString() ?? `session-${Date.now()}`,
                importance: typeof params.importance === "number" ? params.importance : 3,
                category: String(params.category ?? "general").trim(),
                summary,
                detail: typeof params.detail === "string" ? params.detail : undefined,
                tags: Array.isArray(params.tags) ? params.tags : undefined,
                created_at: new Date().toISOString(),
            };

            store.episodic_events.push(newEvent);
            saveStore(dbPath);

            return {
                content: [{ type: "text", text: `✅ 已记录到记忆日志（ID: ${newEvent.id}）\n分类：${newEvent.category} | 重要度：${newEvent.importance}/5` }],
                details: newEvent,
            };
        },
    };

    // ─── Tool 2: automaton_recall_events ─────────────────────────────────────
    const recallEventsTool = {
        name: "automaton_recall_events",
        label: "检索历史记忆事件",
        description: "从记忆日志中检索历史情节事件，可按分类、关键词过滤，或取最近 N 条。",
        parameters: Type.Object({
            category: Type.Optional(Type.String({ description: "按分类过滤" })),
            query: Type.Optional(Type.String({ description: "关键词模糊搜索" })),
            min_importance: Type.Optional(Type.Number({ description: "最低重要度（默认 1）", minimum: 1, maximum: 5 })),
            limit: Type.Optional(Type.Number({ description: "返回条数（默认 10，最大 30）" })),
        }),

        async execute(_id: string, params: Record<string, unknown>) {
            if (!lifecycle.getConfig().enableMemoryJournal) {
                return { content: [{ type: "text", text: "记忆日志功能已禁用" }] };
            }

            const store = loadStore(dbPath);
            const limit = Math.min(typeof params.limit === "number" ? params.limit : 10, 30);
            const minImportance = typeof params.min_importance === "number" ? params.min_importance : 1;

            let rows = store.episodic_events.filter((e: EpisodicEvent) => e.importance >= minImportance);
            if (params.category) rows = rows.filter((e: EpisodicEvent) => e.category === params.category);
            if (params.query) {
                const q = String(params.query).toLowerCase();
                rows = rows.filter((e: EpisodicEvent) =>
                    e.summary.toLowerCase().includes(q) ||
                    (e.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
                );
            }

            rows = rows.sort((a: EpisodicEvent, b: EpisodicEvent) => b.importance - a.importance).slice(0, limit);

            if (rows.length === 0) {
                return { content: [{ type: "text", text: "📭 没有找到匹配的记忆记录。" }] };
            }

            const text =
                `🧠 **找到 ${rows.length} 条记忆记录：**\n\n` +
                rows.map((r: EpisodicEvent, i: number) =>
                    `**${i + 1}. [${r.category}] ★${r.importance}** (${r.created_at.slice(0, 10)})\n${r.summary}` +
                    (r.detail ? `\n> ${r.detail.slice(0, 100)}${r.detail.length > 100 ? "…" : ""}` : "")
                ).join("\n\n");

            return { content: [{ type: "text", text }], details: { count: rows.length, rows } };
        },
    };

    // ─── Tool 3: automaton_save_sop ──────────────────────────────────────────
    const saveSopTool = {
        name: "automaton_save_sop",
        label: "保存标准操作规程 (SOP)",
        description: "将一套行之有效的操作步骤保存为 SOP，下次遇到同类问题时直接检索执行。",
        parameters: Type.Object({
            name: Type.String({ description: "SOP 唯一名称" }),
            description: Type.String({ description: "SOP 适用场景描述" }),
            steps: Type.Array(Type.String(), { description: "操作步骤数组" }),
        }),

        async execute(_id: string, params: Record<string, unknown>) {
            const store = loadStore(dbPath);
            const name = String(params.name ?? "").trim();
            const desc = String(params.description ?? "").trim();
            const steps = Array.isArray(params.steps) ? params.steps as string[] : [];

            if (!name || !desc || steps.length === 0) throw new Error("name、description 和 steps 不能为空");

            const existing = store.procedural_sop.find((s: SopRecord) => s.name === name);
            if (existing) {
                existing.description = desc;
                existing.steps = steps;
                existing.updated_at = new Date().toISOString();
            } else {
                store.procedural_sop.push({ name, description: desc, steps, success_count: 0, fail_count: 0, updated_at: new Date().toISOString() });
            }
            saveStore(dbPath);

            return { content: [{ type: "text", text: `📋 SOP 已保存: **${name}**（${steps.length} 步）` }] };
        },
    };

    // ─── Tool 4: automaton_recall_sop ────────────────────────────────────────
    const recallSopTool = {
        name: "automaton_recall_sop",
        label: "检索标准操作规程 (SOP)",
        description: "按名称或关键词检索已保存的 SOP，直接复用经验。",
        parameters: Type.Object({
            query: Type.String({ description: "SOP 名称或关键词" }),
        }),

        async execute(_id: string, params: Record<string, unknown>) {
            const store = loadStore(dbPath);
            const q = String(params.query ?? "").toLowerCase().trim();
            const rows = store.procedural_sop.filter((s: SopRecord) =>
                s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
            ).sort((a: SopRecord, b: SopRecord) => b.success_count - a.success_count).slice(0, 5);

            if (rows.length === 0) {
                return { content: [{ type: "text", text: `📭 未找到匹配"${params.query}"的 SOP。` }] };
            }

            const text = rows.map((r: SopRecord) =>
                `📋 **${r.name}**（成功 ${r.success_count} / 失败 ${r.fail_count}）\n场景：${r.description}\n` +
                r.steps.map((s: string, i: number) => `  ${i + 1}. ${s}`).join("\n")
            ).join("\n\n---\n\n");

            return { content: [{ type: "text", text }], details: { rows } };
        },
    };

    return [rememberEventTool, recallEventsTool, saveSopTool, recallSopTool];
}
