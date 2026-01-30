---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0008: `ctx` Skill Runs Decision Check on Invocation

Date: 2026-01-28
Author: Human / AI

## Context

用户希望在 Codex 中“直接输入 `ctx`”时也能立刻检查最新决策；但目前决策检查主要依赖会话启动时读取 `AGENTS.md`/`CLAUDE.md` 的自动流程，这在不同工具/会话场景下并不会在每次输入 `ctx` 时触发。

## Decision

1. `ctx` skill 的语义明确为 **Quick Check**：每次调用 `ctx` 时，必须执行决策检查（至少 `-l` 和 `-n 1`），并简要报告状态。
2. 初始化/引导能力（创建 `.ai-context/`、配置自动检查块等）由 `ai-context-init` skill 承担；`ctx` 不再作为初始化入口。

## Implications

- 任何工具中只要触发 `ctx` skill（包括 Codex），都应在该回合执行：
  - `bash scripts/ai-context-decisions.sh -l`
  - `bash scripts/ai-context-decisions.sh -n 1`
- `AGENTS.md`/`CLAUDE.md` 的 session-start 自动检查仍保留，作为兜底；但不应被视为 `ctx` 行为的一部分。

