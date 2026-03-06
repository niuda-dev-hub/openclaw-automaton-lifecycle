/**
 * Memory Journal — 结构化记忆日志工具
 *
 * 提供 4 个 Agent 工具：
 *
 *  automaton_remember_event   — 保存一条重要情节事件（带重要度、分类、标签）
 *  automaton_recall_events    — 检索历史情节事件（按分类/关键词/最近 N 条）
 *  automaton_save_sop         — 保存/更新一套标准操作规程（SOP）
 *  automaton_recall_sop       — 按名称检索 SOP
 */
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import { getDb } from "./db.js";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";

export function createMemoryJournalTools(
    api: OpenClawPluginApi,
    lifecycle: AutomatonLifecycleManager,
) {
    const dbPath = (api.pluginConfig as Record<string, string>)?.dbPath;

    // ─── Tool 1: automaton_remember_event ────────────────────────────────────
    const rememberEventTool = {
        name: "automaton_remember_event",
        label: "记录重要情节事件",
        description:
            "将一条值得长期记住的重要事件或信息保存到结构化记忆日志（SQLite）中，" +
            "下次相关话题出现时可通过 automaton_recall_events 检索。" +
            "适合保存：用户偏好的重要发现、任务成功案例、需注意的失败教训、学到的新技能等。",
        parameters: Type.Object({
            summary: Type.String({
                description: "事件简短摘要（1-2 句话，用于检索时快速浏览）",
            }),
            detail: Type.Optional(
                Type.String({ description: "详细内容（可选，用于后续完整回顾）" }),
            ),
            importance: Type.Optional(
                Type.Number({
                    description: "重要程度 1-5（默认 3，5 = 最重要的核心信息）",
                    minimum: 1,
                    maximum: 5,
                }),
            ),
            category: Type.Optional(
                Type.String({
                    description:
                        "分类标签（如：user_preference / task_result / tool_learning / environment / finance）",
                }),
            ),
            tags: Type.Optional(
                Type.Array(Type.String(), { description: "关键词标签数组，用于精准检索" }),
            ),
        }),

        async execute(_id: string, params: Record<string, unknown>) {
            if (!lifecycle.getConfig().enableMemoryJournal) {
                return { content: [{ type: "text", text: "记忆日志功能已禁用（enableMemoryJournal: false）" }] };
            }

            const db = getDb(dbPath);
            const summary = String(params.summary ?? "").trim();
            if (!summary) throw new Error("summary 不能为空");

            const importance = typeof params.importance === "number" ? params.importance : 3;
            const category = String(params.category ?? "general").trim();
            const detail = typeof params.detail === "string" ? params.detail : null;
            const tags = Array.isArray(params.tags) ? JSON.stringify(params.tags) : null;

            // 从 API context 中获取 sessionId（OpenClaw 注入到插件调用上下文中）
            const sessionId =
                (api as Record<string, unknown>).sessionId?.toString() ??
                `session-${Date.now()}`;

            const result = db.prepare(`
        INSERT INTO episodic_events (session_id, importance, category, summary, detail, tags)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sessionId, importance, category, summary, detail, tags);

            return {
                content: [
                    {
                        type: "text",
                        text:
                            `✅ 事件已记录到记忆日志（ID: ${result.lastInsertRowid}）\n` +
                            `摘要：${summary}\n` +
                            `分类：${category} | 重要度：${importance}/5`,
                    },
                ],
                details: { id: result.lastInsertRowid, category, importance },
            };
        },
    };

    // ─── Tool 2: automaton_recall_events ─────────────────────────────────────
    const recallEventsTool = {
        name: "automaton_recall_events",
        label: "检索历史记忆事件",
        description:
            "从结构化记忆日志中检索历史情节事件。" +
            "可按分类、关键词搜索，或直接取最近 N 条重要记录。",
        parameters: Type.Object({
            category: Type.Optional(
                Type.String({ description: "按分类过滤（如 user_preference / task_result 等）" }),
            ),
            query: Type.Optional(
                Type.String({ description: "关键词，对 summary 和 tags 进行模糊搜索" }),
            ),
            min_importance: Type.Optional(
                Type.Number({ description: "最低重要度过滤（默认 1，即返回全部）", minimum: 1, maximum: 5 }),
            ),
            limit: Type.Optional(
                Type.Number({ description: "返回条数限制（默认 10，最大 30）" }),
            ),
        }),

        async execute(_id: string, params: Record<string, unknown>) {
            if (!lifecycle.getConfig().enableMemoryJournal) {
                return { content: [{ type: "text", text: "记忆日志功能已禁用" }] };
            }

            const db = getDb(dbPath);
            const limit = Math.min(typeof params.limit === "number" ? params.limit : 10, 30);
            const minImportance = typeof params.min_importance === "number" ? params.min_importance : 1;

            let sql = `
        SELECT id, category, importance, summary, detail, tags, created_at
        FROM episodic_events
        WHERE importance >= ?
      `;
            const args: unknown[] = [minImportance];

            if (params.category) {
                sql += " AND category = ?";
                args.push(params.category);
            }

            if (params.query) {
                sql += " AND (summary LIKE ? OR tags LIKE ?)";
                const q = `%${params.query}%`;
                args.push(q, q);
            }

            sql += " ORDER BY importance DESC, created_at DESC LIMIT ?";
            args.push(limit);

            const rows = db.prepare(sql).all(...args) as Array<{
                id: number;
                category: string;
                importance: number;
                summary: string;
                detail: string | null;
                tags: string | null;
                created_at: string;
            }>;

            if (rows.length === 0) {
                return { content: [{ type: "text", text: "📭 没有找到匹配的记忆记录。" }] };
            }

            const text =
                `🧠 **找到 ${rows.length} 条记忆记录：**\n\n` +
                rows
                    .map(
                        (r, i) =>
                            `**${i + 1}. [${r.category}] ★${r.importance}** (${r.created_at.slice(0, 10)})\n` +
                            `${r.summary}` +
                            (r.detail ? `\n> ${r.detail.slice(0, 100)}${r.detail.length > 100 ? "…" : ""}` : ""),
                    )
                    .join("\n\n");

            return {
                content: [{ type: "text", text }],
                details: { count: rows.length, rows },
            };
        },
    };

    // ─── Tool 3: automaton_save_sop ──────────────────────────────────────────
    const saveSopTool = {
        name: "automaton_save_sop",
        label: "保存标准操作规程 (SOP)",
        description:
            "将一套行之有效的操作步骤保存为标准操作规程（SOP），" +
            "以便下次遇到同类问题时直接读取执行，无需重新推演。" +
            "例如：配置 SSH 免密登录的步骤、修复某类 bug 的流程等。",
        parameters: Type.Object({
            name: Type.String({ description: "SOP 唯一名称（英文或中文均可，用于检索）" }),
            description: Type.String({ description: "SOP 适用场景描述" }),
            steps: Type.Array(Type.String(), { description: "操作步骤数组，每条为一个步骤" }),
        }),

        async execute(_id: string, params: Record<string, unknown>) {
            const db = getDb(dbPath);
            const name = String(params.name ?? "").trim();
            const description = String(params.description ?? "").trim();
            const steps = Array.isArray(params.steps) ? params.steps : [];

            if (!name || !description || steps.length === 0) {
                throw new Error("name、description 和 steps 均不能为空");
            }

            db.prepare(`
        INSERT INTO procedural_sop (name, description, steps)
        VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
          description = excluded.description,
          steps = excluded.steps,
          updated_at = datetime('now')
      `).run(name, description, JSON.stringify(steps));

            return {
                content: [
                    {
                        type: "text",
                        text:
                            `📋 SOP 已保存：**${name}**\n` +
                            `适用场景：${description}\n` +
                            `步骤数：${steps.length}`,
                    },
                ],
            };
        },
    };

    // ─── Tool 4: automaton_recall_sop ────────────────────────────────────────
    const recallSopTool = {
        name: "automaton_recall_sop",
        label: "检索标准操作规程 (SOP)",
        description:
            "按名称或关键词检索已保存的标准操作规程（SOP），" +
            "检索后可直接按步骤执行，提升处理同类任务的效率。",
        parameters: Type.Object({
            query: Type.String({ description: "SOP 名称或关键词（模糊搜索）" }),
        }),

        async execute(_id: string, params: Record<string, unknown>) {
            const db = getDb(dbPath);
            const query = `%${String(params.query ?? "").trim()}%`;

            const rows = db.prepare(`
        SELECT name, description, steps, success_count, fail_count, updated_at
        FROM procedural_sop
        WHERE name LIKE ? OR description LIKE ?
        ORDER BY success_count DESC
        LIMIT 5
      `).all(query, query) as Array<{
                name: string;
                description: string;
                steps: string;
                success_count: number;
                fail_count: number;
                updated_at: string;
            }>;

            if (rows.length === 0) {
                return { content: [{ type: "text", text: `📭 未找到匹配"${params.query}"的 SOP。` }] };
            }

            const text = rows
                .map((r) => {
                    const steps: string[] = JSON.parse(r.steps);
                    return (
                        `📋 **${r.name}**（成功 ${r.success_count} 次 / 失败 ${r.fail_count} 次）\n` +
                        `场景：${r.description}\n` +
                        steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")
                    );
                })
                .join("\n\n---\n\n");

            return {
                content: [{ type: "text", text }],
                details: { count: rows.length, sops: rows },
            };
        },
    };

    return [rememberEventTool, recallEventsTool, saveSopTool, recallSopTool];
}
