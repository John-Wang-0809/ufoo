---
status: resolved
resolved_by: codex
resolved_at: 2026-01-29
---
# DECISION 0025: `PLAN.md` Is a Roadmap; Must Align With Monorepo `modules/*` and Avoid Destructive Moves

Date: 2026-01-29  
Author: Codex (GPT-5.2)

## Context

当前 `PLAN.md` 描述了把 `ai-workspace` 做成 **npm 全局安装包**（Node CLI + daemon + skills）的 8 天实施计划，并在 Phase 7 提出把 `modules/ai-context` “移动到 `protocol/`”、把模板移动到 `templates/`、并“删除旧的 `modules/` 目录”。

但仓库已通过 DECISION 0021 / 0024 确认 **monorepo 为 canonical**，且模块目录固定为 `modules/*`；当前实现也已经以 Bash 脚本方式提供 `bin/ai-workspace`、`init`、`skills` 等能力。

## Decision

1. `PLAN.md` 作为**愿景/路线图**保留，但不得被视为可直接照抄执行的“施工脚本”。
2. `modules/*` 是 monorepo 的稳定边界与唯一模块来源；任何 “删除 `modules/`” 或 “把模块内容搬出 `modules/`” 的步骤都视为 **与 DECISION 0021 冲突**，除非先写新的 decision 并明确迁移策略。
3. 若未来要发布 npm 包：
   - 允许在 npm 包内 **复制/打包** 协议文档与模板（用于安装或离线阅读），但源文件仍以 `modules/*` 为准（避免双源漂移）。
4. daemon + osascript 注入属于高复杂度/高权限风险项，必须在单独 decision 中明确“是否要做/做到什么程度/支持哪些终端”，再进入实现阶段。

## Implications

- `PLAN.md` 的 Phase 7（move + delete modules）需要后续更新为 “package/copy” 语义，并与 monorepo 现实保持一致。
- `PLAN.md` 中 skills 安装路径（`~/.claude/skills`）与当前实现（`~/.agents/skills`、`~/.codex/skills`）存在偏差，需在更新计划时统一口径。
- 后续所有对 “分发方式（npm vs clone）/daemon 注入/跨平台支持” 的取舍都属于 Must record 的架构决策。
