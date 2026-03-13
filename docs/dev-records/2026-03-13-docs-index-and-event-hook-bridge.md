# 2026-03-13: 文档整理 + 事件驱动开发起步（after_tool_call bridge）

## 背景

本仓库处于开发中阶段，需要：

1) 将开发过程中的关键文档整理并在仓库首页给出明确入口
2) 在 README 中写清楚关键步骤与当前进度
3) 按“接下来按照步骤开始开发”的要求，落地一个最小可验证的开发动作

## 方案

### A. 文档组织

- 在 `docs/` 下补齐：架构、配置、hooks、模块说明、验证方式、规划方案
- `docs/README.md` 作为索引与推荐阅读顺序

### B. 最小开发动作（事件驱动）

在不改变现有架构边界的前提下，基于 OpenClaw 官方 hook：

- 使用 `api.on("after_tool_call", ...)` 捕获工具调用完成事件
- 将其桥接为内部事件：`openclaw:after_tool_call`
- 通过既有 `AutomatonLifecycleManager.emitLifecycleEvent(...)` 分发，保持 notifier/其他模块可复用

依据（OpenClaw 官方）

- `openclaw/openclaw/src/plugins/types.ts`：`PluginHookName` 列表包含 `after_tool_call`

## 改动概览

- `README.md`：增加开发关键步骤、当前进度、文档索引入口
- `docs/`：新增/补齐开发中重点文档与索引
- `src/progress-monitor.ts`：新增 `after_tool_call` hook 监听并 emit 内部事件
- `index.ts`：移除未使用变量（避免 LSP hint）

## 验证

- `openclaw.plugin.json`：JSON 解析通过
- `npm run typecheck`：通过
- `lsp_diagnostics(index.ts)`：无诊断

## 风险与回滚

- 风险：hook 运行在热路径，若 handler 做耗时操作会拖慢运行
  - 缓解：本次 handler 仅做字段提取 + emit，不 await 网络
- 回滚：删除 `after_tool_call` 监听即可，不影响现有 9 工具与 Hub 调用链
