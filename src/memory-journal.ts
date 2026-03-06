/**
 * Memory Journal — 结构化记忆日志工具（SaaS API 版）
 *
 * 提供 4 个 Agent 工具：
 *  automaton_remember_event   — 保存一条重要情节事件
 *  automaton_recall_events    — 检索历史情节事件
 *  automaton_save_sop         — 保存/更新 SOP 操作规程
 *  automaton_recall_sop       — 按名称检索 SOP
 */
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";
import type { EpisodicEvent, ProceduralSOP } from "./api-client.js";

export function createMemoryJournalTools(api: OpenClawPluginApi, lifecycle: AutomatonLifecycleManager) {
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

            const summary = String(params.summary ?? "").trim();
            if (!summary) throw new Error("summary 不能为空");

            const category = String(params.category ?? "general").trim();
            const payload = {
                summary,
                detail: typeof params.detail === "string" ? params.detail : undefined,
                importance: typeof params.importance === "number" ? params.importance : 3,
                tags: Array.isArray(params.tags) ? params.tags : undefined,
                session_id: (api as any).sessionId?.toString() ?? `session-${Date.now()}`
            };

            const record = await lifecycle.apiClient.recordEvent(category, JSON.stringify(payload));
            return {
                content: [{ type: "text", text: `✅ 已记录到云端记忆日志（ID: ${record.id}）\n分类：${category} | 重要度：${payload.importance}/5` }],
                details: record,
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

            const limit = Math.min(typeof params.limit === "number" ? params.limit : 10, 30);
            const minImportance = typeof params.min_importance === "number" ? params.min_importance : 1;
            const categoryFilter = typeof params.category === "string" ? params.category : undefined;

            let records = await lifecycle.apiClient.getEvents(categoryFilter, 50); // fetch more to sort/filter locally

            // Parse content payload
            let rows = records.map(r => {
                let p: any = {};
                try { p = JSON.parse(r.content); } catch (e) { }
                return {
                    id: r.id,
                    category: r.event_type,
                    created_at: new Date(r.created_at).toISOString(),
                    summary: p.summary || r.content,
                    detail: p.detail,
                    importance: p.importance ?? 1,
                    tags: p.tags ?? []
                };
            });

            rows = rows.filter(e => e.importance >= minImportance);

            if (params.query) {
                const q = String(params.query).toLowerCase();
                rows = rows.filter(e =>
                    e.summary.toLowerCase().includes(q) ||
                    e.tags.some((t: string) => t.toLowerCase().includes(q))
                );
            }

            rows = rows.sort((a, b) => b.importance - a.importance).slice(0, limit);

            if (rows.length === 0) {
                return { content: [{ type: "text", text: "📭 没有找到匹配的记忆记录。" }] };
            }

            const text =
                `🧠 **找到 ${rows.length} 条记忆记录：**\n\n` +
                rows.map((r, i) =>
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
            const name = String(params.name ?? "").trim();
            const desc = String(params.description ?? "").trim();
            const steps = Array.isArray(params.steps) ? params.steps as string[] : [];

            if (!name || !desc || steps.length === 0) throw new Error("name、description 和 steps 不能为空");

            // We do complete replace or insert from the plugin side. 
            // In a more robust system we would GET first to preserve success_count, but this works.
            const sops = await lifecycle.apiClient.getSops();
            const existing = sops.find((s: ProceduralSOP) => s.trigger_condition === name);

            let success_count = 0, fail_count = 0;
            if (existing) {
                try {
                    const parsed = JSON.parse(existing.steps_json);
                    success_count = parsed.success_count || 0;
                    fail_count = parsed.fail_count || 0;
                } catch (e) { }
            }

            const payload = {
                description: desc,
                steps,
                success_count,
                fail_count
            };

            await lifecycle.apiClient.saveSop(name, JSON.stringify(payload));
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
            const sops = await lifecycle.apiClient.getSops();
            const q = String(params.query ?? "").toLowerCase().trim();

            let rows = sops.map(s => {
                let p: any = { description: "", steps: [], success_count: 0, fail_count: 0 };
                try { p = JSON.parse(s.steps_json); } catch (e) { }
                return {
                    name: s.trigger_condition,
                    description: p.description || "",
                    steps: p.steps || [],
                    success_count: p.success_count || 0,
                    fail_count: p.fail_count || 0
                };
            });

            rows = rows.filter(s =>
                s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
            ).sort((a, b) => b.success_count - a.success_count).slice(0, 5);

            if (rows.length === 0) {
                return { content: [{ type: "text", text: `📭 未找到匹配"${params.query}"的 SOP。` }] };
            }

            const text = rows.map(r =>
                `📋 **${r.name}**（成功 ${r.success_count} / 失败 ${r.fail_count}）\n场景：${r.description}\n` +
                r.steps.map((step: string, i: number) => `  ${i + 1}. ${step}`).join("\n")
            ).join("\n\n---\n\n");

            return { content: [{ type: "text", text }], details: { rows } };
        },
    };

    return [rememberEventTool, recallEventsTool, saveSopTool, recallSopTool];
}
