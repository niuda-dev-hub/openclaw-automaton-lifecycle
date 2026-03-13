# Verification

本文件定义“开发中”验证步骤，确保每次变更可重复验证。

## 必做命令

```bash
npm install
npm run typecheck
```

## 手工 QA（涉及通知/格式）

前置要求：本仓库使用 Node ESM + TypeScript（见 `package.json` 的 `type: module`）。下面的命令需要使用支持 TypeScript loader 的 Node 运行方式；如果你的环境无法直接 `node` 导入 `.ts`，请先用 `npm run typecheck` 确认类型正确，并在具备 TS loader 的环境中执行该段脚本。

1. 生成通知文本（不依赖 Telegram 真发）：

```bash
node - <<'NODE'
import { buildNotificationMessage } from './src/telegram/message-formatter.ts';

const samples = [
  ['budget:alert', { spent: 4.1234, budget: 5, pct: 82.468 }],
  ['heartbeat:anomaly', { idleCount: 3, intervalMs: 7200000, reason: 'deep_sleep_activated' }],
  ['soul:update', { hash: 'abcdef0123456789', source: 'reflection' }],
  ['agent:end', { durationMs: 12345, replies: 1 }],
  ['progress:task_done', { kind: 'task', userText: '请帮我修复bug', assistantText: '已经修复并通过测试' }],
  ['progress:ai_notify', { group: '重要消息', title: '发现异常', message: '{"foo": "bar"}' }],
];

for (const [evt, payload] of samples) {
  console.log('---', evt);
  console.log(buildNotificationMessage(evt, payload));
  console.log();
}
NODE
```

通过标准：输出为可读纯文本，不应出现“把整个对象 JSON dump 直接当通知正文”的情况。
