# Project Overview (Handoff-Ready)

## 1. 项目定位

`openclaw-automaton-lifecycle` 是 OpenClaw 侧插件 thin client，负责：

- 注册自动化生命周期工具
- 调用 `openclaw-agent-hub` API
- 驱动预算感知、心跳节流、记忆与自省流程

## 2. 系统边界

- 配套后端仓库：`openclaw-agent-hub`
- 本仓库不承载中心状态，中心状态在 Hub 侧持久化

## 3. 关键目录

- `index.ts`：插件入口与工具注册
- `src/`：生命周期与 API 客户端核心逻辑
- `scripts/`：安装/卸载管理脚本

## 4. 运行与配置

- 关键环境：`AGENT_HUB_URL`、`AGENT_ID` 等（见 README）
- 安装入口：`node scripts/manage.js`

## 5. 版本与发布

- 版本策略：`VERSIONING.md`
- 变更日志：`CHANGELOG.md`
- Tag 发布：`.github/workflows/release.yml`

## 6. 可移交要求

任何功能改动必须同时更新：

1. README 对接说明
2. `DEVELOPMENT_RECORDS.md` 索引
3. `docs/dev-records/` 详细记录
