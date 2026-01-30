---
status: resolved
resolved_by: codex
resolved_at: 2026-01-28
---
# DECISION 0024: `ai-workspace` Monorepo Is Canonical; Retire Sibling Working Copies

Date: 2026-01-28
Author: Codex (GPT-5.2)

## Context

用户确认采用 monorepo：`ai-workspace` 是唯一仓库，模块位于 `ai-workspace/modules/*`。

当前开发目录里还存在旧的 sibling working copies：
- `/Users/icy/Code/ai-context`
- `/Users/icy/Code/ai-resources`

它们会造成“到底改哪里”的混乱与漂移风险。

## Decision

1. 以 `/Users/icy/Code/ai-workspace` 作为唯一主工作区与唯一 repo。
2. 删除（或移出工作目录）`/Users/icy/Code/ai-context` 与 `/Users/icy/Code/ai-resources` 两个旧 working copy。
3. 后续所有修改均在 monorepo 内完成：
   - 协议模块：`modules/ai-context`
   - 资源模块：`modules/ai-resources`

## Implications

- 后续 `ctx`/决策日志/文档更新以 `ai-workspace` 根目录的 `.ai-context/DECISIONS/` 为准。
- 若需要发布到 `~/.ai-workspace`，只需 clone/更新该 monorepo。

