# Development Records

本文件用于集中索引开发过程记录，保证“需求 -> 设计 -> 实现 -> 验证 -> 发布”全链路可追溯。

## 记录原则（强制）

1. 每次非 trivial 变更都要新增一条开发记录（`docs/dev-records/`）
2. 记录必须包含：背景、方案、改动文件、验证结果、风险与回滚点
3. PR 必须引用对应记录文件路径
4. 不允许删除历史记录；如有修订，新增“勘误/补充”条目

## 目录

- `docs/dev-records/`：按日期和主题存放详细记录

## 索引

- 2026-03-08: 仓库迁移到组织 + README 与 agent-hub 关联说明
- 2026-03-08: 统一版本策略落地（`VERSIONING.md` / `CHANGELOG.md` / `release.yml`）
- 2026-03-08: 新增项目全景与移交手册（`PROJECT_OVERVIEW.md` / `HANDOFF_RUNBOOK.md`）
- 2026-03-13: 文档整理 + 事件驱动开发起步（`docs/dev-records/2026-03-13-docs-index-and-event-hook-bridge.md`）
