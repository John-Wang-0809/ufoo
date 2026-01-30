---
status: resolved
resolved_by: codex
resolved_at: 2026-01-28
---
# DECISION 0021: Adopt Monorepo — `ai-workspace` as Root, Modules Under `modules/`

Date: 2026-01-28
Author: Human / AI (Codex)

## Context

用户确认选择 **monorepo**：希望 `ai-context` 与 `ai-resources` 作为 `ai-workspace` 的子目录（而不是独立 GitHub 仓库）。

这会影响：
- GitHub 托管形态（单仓库包含所有模块）
- 本地全局安装方式（`~/.ai-workspace` 直接 clone 该 monorepo）
- `ai-workspace init` 如何从模块目录复制脚本/模板到项目内

## Decision

1. 采用 monorepo：`ai-workspace` 为唯一 Git 仓库与唯一入口。
2. 模块目录固定为：
   - `ai-workspace/modules/ai-context`
   - `ai-workspace/modules/ai-resources`
3. 全局安装位置为 `~/.ai-workspace`（即该 monorepo 的 working copy）。
4. `ai-workspace` 提供统一 CLI：install/update/init/doctor/skills；其中 `init` 会把 `ai-context` 模块的脚本/模板复制进项目仓库（项目自洽，不依赖全局绝对路径）。

## Implications

- 0016/0019 中关于“多仓库/模块仓库”的表述在实施层面由本 decision 覆盖（umbrella 思想保留，托管形态改为 monorepo）。
- 需要将当前已拆分出的 `UI/`/`ICONS/`（已复制到 `ai-resources`）迁移到 `ai-workspace/modules/ai-resources/`。
- 需要将当前 `ai-context` 仓库内容迁移到 `ai-workspace/modules/ai-context/`，并以 `ai-workspace` 根目录作为后续开发主工作区。
