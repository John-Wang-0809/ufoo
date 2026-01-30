---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0005: Auto Decision Check on Session Start

Date: 2026-01-28
Author: Human / AI

## Context

用户希望每次打开 Claude Code 时自动检查最新决策，而不需要手动运行 `ai context init` 或询问。

问题：
- 决策是项目的关键上下文，但容易被遗忘
- 手动检查增加认知负担
- 新会话可能错过重要决策更新

## Decision

1. `ai-context-init` skill 新增 **Step 3**：自动配置 CLAUDE.md（和 AGENTS.md）
2. 使用 `<!-- ai-context -->` 和 `<!-- /ai-context -->` 标记块，避免重复追加
3. 配置内容包括：
   - 会话启动时自动运行 `scripts/ai-context-decisions.sh`
   - 列出所有决策标题
   - 显示最新决策内容
4. 新增 `scripts/ai-context-decisions.sh` 脚本，支持：
   - `-l` 列出所有决策标题
   - `-n <num>` 显示最新 N 条
   - `-a` 显示全部内容

## Implications

- 任何项目执行 `ai context init` 后，CLAUDE.md 会包含自动检查指令
- Claude Code 每次打开项目时读取 CLAUDE.md，自动执行决策检查
- 减少手动操作，确保决策上下文始终可见
- 脚本需兼容 macOS bash 3.x（避免使用 `mapfile`）
