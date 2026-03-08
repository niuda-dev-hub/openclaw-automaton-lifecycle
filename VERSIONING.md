# Versioning Policy

本仓库与 `openclaw-agent-hub` 统一采用 **SemVer + Git Tag + CHANGELOG** 策略。

## 1. 版本语义（SemVer）

- `MAJOR`：不兼容变更（破坏 API/插件契约）
- `MINOR`：向后兼容的新功能
- `PATCH`：向后兼容的问题修复

Tag 格式固定：`vX.Y.Z`

## 2. 单一版本源

- 版本以 `package.json` 的 `version` 字段为准
- 发布 Tag 必须与版本一致（如 `v0.2.1`）

## 3. 提交规范

建议使用 Conventional Commits：

- `feat:` 新功能（通常触发 MINOR）
- `fix:` 修复（通常触发 PATCH）
- `docs:` 文档
- `chore:` 杂项/构建
- 带 `!` 或 `BREAKING CHANGE` 触发 MAJOR

## 4. 发版流程

1. 更新代码并通过验证
2. 更新 `CHANGELOG.md`（整理出目标版本小节）
3. 更新 `package.json` 版本号
4. 合并到 `main`
5. 打 tag：`vX.Y.Z` 并 push
6. GitHub Actions 自动创建 Release

## 5. 兼容性约束

- 若与 `openclaw-agent-hub` 的接口契约有变更，必须在 Changelog 标注
- 若存在不兼容改动，必须提升 MAJOR 或在 `v0.x` 阶段明确标注 Breaking Changes
