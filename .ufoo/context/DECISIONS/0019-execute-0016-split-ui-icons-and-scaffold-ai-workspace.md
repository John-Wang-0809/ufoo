---
status: resolved
---
# DECISION 0019: Execute 0016 — Split `ai-resources`, Remove `UI/` + `ICONS/` from `ai-context`, Scaffold `ai-workspace`

Date: 2026-01-28
Author: Codex (GPT-5.2)

## Context

DECISION 0016 / 0018 已确定：采用 `ai-workspace` umbrella + `ai-context` / `ai-resources` 模块化；并按最佳实践落地（不做兼容）。

因此需要开始执行拆分：
- `ai-context` 仓库聚焦协议与脚本（多 agent 共享上下文/决策同步），不包含 UI/ICONS 资源。
- `ai-resources` 仓库承载 UI/ICONS 等资源（可选安装）。
- `ai-workspace` 仓库提供全局安装与项目初始化入口（生成项目 `.ai-context/`，注入 `CLAUDE.md`/`AGENTS.md`）。

## Decision

1. 从 `ai-context` 中移除 `UI/` 与 `ICONS/`（以及相关“canonical/必需”的约束与 lint 检查）。
2. 在本地创建 `ai-resources` 仓库骨架，并把当前 `UI/` 与 `ICONS/` 内容迁移进去（后续由用户推送到远端）。
3. 在本地创建 `ai-workspace` 仓库骨架，提供 `install/update/init/doctor/skills` 的统一 CLI（后续逐步补齐实现）。
4. 所有对外文档与示例应围绕 `ai-workspace` 作为唯一入口进行重写（不保留 legacy 兼容路径）。

## Implications

- `scripts/ai-context-lint.sh`、`SYSTEM.md`、`RULES.md`、`CONSTRAINTS.md`、`README.md` 需要更新以反映“ai-context 不包含资源”的新事实。
- 新仓库创建与文件迁移属于结构性变更，后续每一步大改（例如 CLI 命令面最终定稿）需继续记录 decisions。

