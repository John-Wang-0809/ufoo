---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0010: Decisions Live in Project `.ai-context/DECISIONS/` (Including This Repo as a Project)

Date: 2026-01-28
Author: Human / AI

## Context

本仓库是 ai-context **协议本身**，需要对外开放给其他用户使用（作为 `~/.ai-context/protocol` 的来源）。

此前出现过一次偏差：把决策写到了仓库根目录 `DECISIONS/`。这不符合 ai-context 的核心规则：

- **Global context defines the law.**
- **Project context defines the truth.**
- 决策属于 “truth”（项目协作真相），必须写在项目的 `.ai-context/DECISIONS/` 中。

因此需要明确并修正：即使当前仓库是协议仓库，当我们把它当作一个项目来维护/演进时，它的决策也仍然属于该项目的 `.ai-context/DECISIONS/`。

## Decision

1. **决策唯一位置**：所有 decisions 都写到目标项目的 `.ai-context/DECISIONS/`。
2. 对本仓库（协议仓库）的维护同样遵循该规则：本仓库的 decisions 也写在 `.ai-context/DECISIONS/`，不在仓库根目录新增 `DECISIONS/`。
3. 工具与文档需要防止再次偏离：脚本默认读取/写入 `.ai-context/DECISIONS/`，并在协议仓库分发场景下优雅降级（例如目录不存在则提示但不 hard fail）。

## Implications

- `scripts/ai-context-decisions.sh` 默认目标为 `.ai-context/DECISIONS/`，并提供可选参数允许显式指定目录。
- `scripts/ai-context-lint.sh` 不再把根目录 `DECISIONS/` 作为协议仓库要求；并可对“错误目录存在”给出提示/失败以避免误用。
- 文档（如 `README.md`、`DECISION-PROTOCOL.md`）必须与上述规则保持一致。

