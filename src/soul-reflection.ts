/**
 * Soul Reflection — SOUL.md 自省任务
 *
 * 在心跳空闲期触发一次轻量 LLM 调用，分析近期情节事件，
 * 提出 SOUL.md 的更新建议，并在用户同意后写入文件（带版本历史）。
 *
 * Tool: automaton_soul_reflect
 *   - 主动触发一次 SOUL.md 自省
 *   - 返回建议的 SOUL.md 补充/修改内容，由 Agent 决定是否采纳
 *
 * Tool: automaton_soul_update
 *   - 将新内容追加/替换写入 ~/.openclaw/workspace/SOUL.md
 *   - 同时保存版本历史到 SQLite
 */
import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/llm-task";
import { getDb } from "./db.js";
import type { AutomatonLifecycleManager } from "./lifecycle-manager.js";

function getSoulPath(api: OpenClawPluginApi): string {
    const workspace =
        (api.config?.agents?.defaults as Record<string, string> | undefined)?.workspace ??
        path.join(os.homedir(), ".openclaw", "workspace");
    return path.join(workspace.replace(/^~/, os.homedir()), "SOUL.md");
}

async function readSoul(soulPath: string): Promise<string> {
    try {
        return await fs.readFile(soulPath, "utf-8");
    } catch {
        return "";
    }
}

function hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function createSoulReflectionTool(
    api: OpenClawPluginApi,
    lifecycle: AutomatonLifecycleManager,
) {
    const dbPath = (api.pluginConfig as Record<string, string>)?.dbPath;

    // ─── Tool 1: automaton_soul_reflect (分析并给出建议) ──────────────────────
    const reflectTool = {
        name: "automaton_soul_reflect",
        label: "触发 SOUL.md 自省分析",
        description:
            "读取当前 SOUL.md 内容与近期重要情节事件，生成关于身份/价值观/能力的反思摘要，" +
            "以及建议新增或修改的 SOUL.md 内容。你可以选择性地采纳建议，" +
            "然后用 automaton_soul_update 工具应用更改。",
        parameters: Type.Object({
            recent_events_count: Type.Optional(
                Type.Number({
                    description: "纳入分析的近期情节事件数量（默认 10）",
                }),
            ),
        }),

        async execute(_id: string, params: Record<string, unknown>) {
            if (!lifecycle.getConfig().enableSoulReflection) {
                return { content: [{ type: "text", text: "Soul 自省功能已禁用（enableSoulReflection: false）" }] };
            }

            const soulPath = getSoulPath(api);
            const currentSoul = await readSoul(soulPath);

            const limit = typeof params.recent_events_count === "number" ? params.recent_events_count : 10;
            const db = getDb(dbPath);
            const events = db.prepare(`
        SELECT category, importance, summary, created_at
        FROM episodic_events
        ORDER BY importance DESC, created_at DESC
        LIMIT ?
      `).all(limit) as Array<{ category: string; importance: number; summary: string; created_at: string }>;

            const eventsText =
                events.length > 0
                    ? events
                        .map((e) => `- [${e.category} ★${e.importance}] ${e.summary} (${e.created_at.slice(0, 10)})`)
                        .join("\n")
                    : "（暂无情节记忆记录）";

            // 返回自省上下文供 Agent 分析，不直接调用 LLM（由 Agent 自己推理）
            return {
                content: [
                    {
                        type: "text",
                        text:
                            `🪞 **SOUL.md 自省上下文**\n\n` +
                            `**当前 SOUL.md 内容：**\n\`\`\`\n${currentSoul || "（文件为空或不存在）"}\n\`\`\`\n\n` +
                            `**近期 ${events.length} 条重要情节事件：**\n${eventsText}\n\n` +
                            `---\n` +
                            `请根据以上信息，分析你的成长与变化，` +
                            `提出对 SOUL.md 的具体补充或修改建议（格式：直接给出修改后的 Markdown 内容即可）。` +
                            `确认后可调用 \`automaton_soul_update\` 工具应用更改。`,
                    },
                ],
                details: { soulPath, eventCount: events.length, hasSoul: currentSoul.length > 0 },
            };
        },
    };

    // ─── Tool 2: automaton_soul_update (写入 SOUL.md + 保存历史) ─────────────
    const updateTool = {
        name: "automaton_soul_update",
        label: "更新 SOUL.md",
        description:
            "将新的 SOUL.md 内容写入文件，并在数据库中保存当前版本的历史快照，" +
            "确保每次更改都有完整的版本记录可供回溯。",
        parameters: Type.Object({
            new_content: Type.String({
                description: "完整的新 SOUL.md 内容（Markdown 格式，将完整替换原有文件）",
            }),
            source: Type.Optional(
                Type.String({ description: "更改来源标注（默认 reflection）" }),
            ),
        }),

        async execute(_id: string, params: Record<string, unknown>) {
            const newContent = String(params.new_content ?? "").trim();
            if (!newContent) throw new Error("new_content 不能为空");

            const soulPath = getSoulPath(api);
            const contentHash = hashContent(newContent);
            const source = String(params.source ?? "reflection");

            // 检查是否与现有内容相同（避免无意义的写入）
            const currentContent = await readSoul(soulPath);
            if (hashContent(currentContent) === contentHash) {
                return {
                    content: [{ type: "text", text: "ℹ️ SOUL.md 内容与当前版本相同，无需更新。" }],
                };
            }

            // 写入文件
            await fs.mkdir(path.dirname(soulPath), { recursive: true });
            await fs.writeFile(soulPath, newContent, "utf-8");

            // 保存历史快照
            const db = getDb(dbPath);
            db.prepare(`
        INSERT INTO soul_history (content, content_hash, source)
        VALUES (?, ?, ?)
      `).run(newContent, contentHash, source);

            return {
                content: [
                    {
                        type: "text",
                        text:
                            `✅ SOUL.md 已更新并保存版本历史\n` +
                            `文件路径：${soulPath}\n` +
                            `内容长度：${newContent.length} 字符\n` +
                            `版本 Hash：${contentHash}`,
                    },
                ],
                details: { soulPath, contentHash, source },
            };
        },
    };

    return {
        execute: reflectTool.execute.bind(reflectTool),
        ...(reflectTool as object),
        // 返回一个有 name 的工具对象给 index.ts 用
        reflectTool,
        updateTool,
    };
}
