# OpenClaw event-driven progress monitor + notifier plan

## Goal
Upgrade an OpenClaw plugin that currently relies mostly on `agent_end` to a robust event-driven design using official `api.on(...)` hooks, with:

- low noise (dedupe/cooldowns)
- strong observability (tool/subagent granularity)
- safety (no JSON/secrets leaks)
- predictable delivery (silent/night mode without dropping critical alerts)

## Ground truth: official hook set
Source of truth is `openclaw/openclaw/src/plugins/types.ts` (`PluginHookName`).
Prefer hooks that are already used by bundled extensions for proven patterns.

## Reference patterns from official repo

### message_received + message_sending
Example: `extensions/thread-ownership/index.ts`
- `message_received`: track context (mentions) in memory with TTL.
- `message_sending`: optionally return `{ cancel: true }` to block sends.
- Failure mode: fail-open on network errors; do not block delivery.

### agent_end for post-run analysis
Example: `extensions/memory-lancedb/index.ts`
- `before_agent_start`: inject context (auto-recall).
- `agent_end`: post-run capture.
- Important: only capture *user* messages to avoid self-poisoning.

### subagent_* for routing + cleanup
Example: `extensions/discord/src/subagent-hooks.ts`
- `subagent_spawning`: validate config and block if unsupported (return `{status:"error"}`)
- `subagent_delivery_target`: route completion messages back to originating thread
- `subagent_ended`: cleanup bindings

### outbound delivery robustness
Example: `src/infra/outbound/deliver.ts`
- `message_sending` may modify or cancel, but delivery must continue on hook failure.
- `message_sent` is emitted via a fire-and-forget helper; hook failure must not crash delivery.

## Proposed architecture (recommended)

### Components
1) **HookTap**: a small module that only registers `api.on(...)` hooks and emits internal events.
2) **EventAggregator**: coalesces events into “human notifications” with dedupe, cooldowns, and severity.
3) **Notifier**: sends notifications to a channel (Telegram) with silent mode.
4) **Sanitizers**: ensure no sensitive or raw JSON payloads are emitted.

### Data flow
`api.on(hook)` → HookTap emits `monitor:*` events → Aggregator decides → Notifier sends.

### Hooks to use (MVP)
1) `after_tool_call`
   - Create tool-level progress and latency alerts.
   - Emit `monitor:tool_slow` when `durationMs >= threshold`.
2) `subagent_spawned` / `subagent_ended`
   - Emit `monitor:subagent_started` / `monitor:subagent_ended`.
3) `agent_end`
   - Emit `monitor:run_finished` summary.
4) `message_sent`
   - Emit `monitor:delivery_failed` when `success=false` (if desired).

### Hooks to add later (Phase 2)
5) `tool_result_persist` + `before_message_write`
   - Centralized transcript sanitization (trim large details, redact secrets).
6) `llm_output`
   - Budget/cost alerts based on `usage` and provider/model.
7) `gateway_start` / `gateway_stop`
   - Gateway lifecycle notifications.

## Dedupe + rate limiting policy
- Key by `(sessionId, runId, toolName)` when available.
- Cooldowns per event type:
  - tool_slow: 2–5 min
  - run_finished: 2 min
  - no_reply-like anomalies: 10 min
- Group events within a short window (e.g. 3–10s) into a single message.

## Silent mode policy
- Silent mode should not drop messages. Prefer sending with `disable_notification=true` at night.
- Only drop low-severity events if explicitly configured.

## Privacy / content policy
- Default notification format is plain text, avoid Markdown parsing by default.
- Never embed raw structured objects; only include:
  - event name
  - toolName
  - duration
  - short summary (clamped)
- Redact common secret patterns (API keys, tokens) before sending.

## Failure isolation
- Hook handlers must never throw (wrap in try/catch and log).
- Notifier failures must not affect the agent run.

## Rollout plan
1) Phase 0: Add HookTap + Aggregator but keep notifier disabled by default.
2) Phase 1: Enable only `agent_end` + `after_tool_call` summaries.
3) Phase 2: Add `subagent_*`.
4) Phase 3: Add sanitizers (`tool_result_persist` / `before_message_write`) + LLM usage alerts.

## QA checklist
- Simulate events and ensure dedupe works.
- Validate notification payload never contains JSON dump of internal structures.
- Ensure failures in notifier do not crash OpenClaw.
