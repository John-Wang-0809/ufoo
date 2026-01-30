---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0011: Add `doctor` Checks and `skills.sh` Skill Management Script

Date: 2026-01-28
Author: Human / AI

## Context

为了让协议对外开放使用更顺畅，需要：

- 在“结构校验（lint）”之外，提供更面向用户的快速诊断（doctor）能力。
- 用一个脚本来管理/分发 `SKILLS/`（`skills.sh`），减少手工复制并统一入口。

同时澄清概念：

- “skill” 指 `SKILLS/<name>/SKILL.md` 这种给 AI 工具读取的说明文件。
- `skills.sh` 是 **辅助工具脚本**（安装/同步 skill 文件到目标目录），它不是一个 skill。

## Decision

1. 保留 `scripts/ai-context-lint.sh` 作为严格结构校验（适合 CI）。
2. 新增 `scripts/ai-context-doctor.sh` 作为快速排障入口（面向人类/本地操作）。
3. 新增 `scripts/skills.sh` 作为 skill 管理脚本：list/install 到 `--codex` / `--agents` / `--target`。

## Implications

- 文档中需要说明 `lint` vs `doctor` 的定位差异。
- `skills.sh` 作为分发工具存在，但不改变 skill 的定义与来源（仍以 `SKILLS/` 为源）。

