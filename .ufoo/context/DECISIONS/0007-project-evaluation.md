---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0007: Project Evaluation (Protocol Repo Health)

Date: 2026-01-27
Author: Human / AI

## Context

用户请求“评估项目”。本次评估范围为本仓库（ai-context 协议仓库）本身的健康度、可用性、一致性与主要风险点。

## Decision

1. 当前仓库状态总体健康：协议级 lint（`bash scripts/ai-context-lint.sh`）与项目级 lint（`bash scripts/ai-context-lint.sh --project .ai-context`）均通过；决策自动检查脚本 `scripts/ai-context-decisions.sh` 工作正常。
2. 主要可用性缺口是“安装/引导说明漂移”：`SKILLS/ctx/SKILL.md` 仍包含机器绝对路径（`/Users/...`）且以本地拷贝作为默认安装方式，这与 DECISION 0003（避免绝对路径、优先 git clone/pull 安装）不一致。
3. 次要但高频的仓库卫生问题：存在被提交的 `.DS_Store` 文件，会造成 diff 噪音，建议纳入忽略策略并在后续清理。
4. 后续改进应优先“对齐既有决策与文档/技能实现”（尤其是安装方式），再扩展新的协议内容，以避免新用户踩坑与上下文不一致。

## Implications

- 对齐安装方式与文档：更新 `README.md` 与 `SKILLS/ctx/SKILL.md`，将默认安装/更新流程明确为 `~/.ai-context/protocol` 的 git working copy（`git clone` / `git pull --ff-only`），并提供可覆盖的来源（URL 或 env var）与离线/本地拷贝兜底。
- 仓库卫生：增加 `.gitignore` 忽略 `.DS_Store`，并在约定后移除已被跟踪的 `.DS_Store` 文件。
- 可选增强：考虑让 `scripts/ai-context-lint.sh` 在发现 `.DS_Store` 时给出提示（不必阻断），以在跨平台协作中减少噪音。

