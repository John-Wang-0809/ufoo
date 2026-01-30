---
status: wontfix
resolved_by: codex
resolved_at: 2026-01-28
---
# DECISION 0022: Single Project Instructions File — `AGENTS.md` Canonical, `CLAUDE.md` Symlinks to It

Date: 2026-01-28
Author: Codex (GPT-5.2)

## Context

`ai-workspace init` 会向项目写入（或更新）`AGENTS.md`（Codex）与 `CLAUDE.md`（Claude Code）的说明块。

维护两份内容会导致漂移与重复维护成本。用户要求让它们共享同一份内容：将 `CLAUDE.md` 做成 `AGENTS.md` 的链接。

## Decision

1. **单一真相文件**：项目指令以 `AGENTS.md` 为 canonical（源文件）。
2. **共享方式**：`CLAUDE.md` 使用符号链接（symlink）指向 `AGENTS.md`（同目录相对链接 `AGENTS.md`）。
3. `ai-workspace init` 的行为：
   - 始终把 ai-context 协议块写入/更新到 `AGENTS.md`。
   - 若 `CLAUDE.md` 不存在，则创建 symlink。
   - 若 `CLAUDE.md` 已存在且不是 symlink：仅在与 `AGENTS.md` 内容一致时替换为 symlink；否则保留并给出提示，避免意外覆盖用户自定义内容。

## Implications

- 文档需要明确：用户应编辑 `AGENTS.md`，不要直接编辑 `CLAUDE.md`（它是链接）。
- 需要更新 `ai-workspace` README 与 `ai-workspace init` 实现。
