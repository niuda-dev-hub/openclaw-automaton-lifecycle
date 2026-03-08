# Handoff Runbook

## A. 快速接手路径

阅读顺序：

1. `README.md`
2. `PROJECT_OVERVIEW.md`
3. `VERSIONING.md`
4. `DEVELOPMENT_RECORDS.md`

## B. 本地验证

- Node 依赖安装：`npm install`
- 构建/类型检查（如适用）：`npm run build`
- 插件管理：`node scripts/manage.js`

## C. 与 Hub 协作要点

- 先确认 `openclaw-agent-hub` 可用
- 确认 `AGENT_HUB_URL` 指向正确实例
- 所有核心状态以 Hub 返回为准

## D. 交付流程（强制）

1. 完成功能改动
2. 本地验证
3. 更新 `docs/dev-records/YYYY-MM-DD-*.md`
4. 更新 `DEVELOPMENT_RECORDS.md` 索引
5. 按 PR 模板提交
