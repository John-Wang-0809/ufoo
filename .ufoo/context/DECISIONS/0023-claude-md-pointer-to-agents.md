---
status: resolved
resolved_by: codex
resolved_at: 2026-01-28
---
# DECISION 0023: `CLAUDE.md` Is a Pointer File to `AGENTS.md` (Not a Symlink)

Date: 2026-01-28
Author: Codex (GPT-5.2)

## Context

用户提供参考实现（vercel-labs/agent-skills），其做法是在 `CLAUDE.md` 内仅写一行 `AGENTS.md`，用于指向 canonical 指令文件，从而避免维护两份内容。

此前 DECISION 0022 采用了 symlink（`CLAUDE.md -> AGENTS.md`）。但 symlink 在 Git/跨平台/部分工具与 UI 中的可见性与兼容性更差；而“指针文件”在 GitHub diff、代码搜索、Windows 与多数工具中更稳定。

## Decision

1. `AGENTS.md` 是项目指令的单一真相文件（canonical）。
2. `CLAUDE.md` 不使用 symlink，而是一个普通文件，内容固定为：
   - `AGENTS.md`
3. `ai-workspace init`：
   - 始终把 ai-context 协议块写入/更新到 `AGENTS.md`
   - 始终生成/覆盖 `CLAUDE.md` 为上述指针文件（不再尝试 symlink）

## Implications

- 文档需要统一表述为 “`CLAUDE.md` 指向 `AGENTS.md`”，而不是 “symlink”。
- DECISION 0022 作为方案被替换，应标记为 `wontfix`。
