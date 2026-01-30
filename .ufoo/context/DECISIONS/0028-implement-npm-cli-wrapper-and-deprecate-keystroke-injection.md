---
status: resolved
resolved_by: codex
resolved_at: 2026-01-29
---
# DECISION 0028: Implement npm `ai-workspace` CLI (Wrapper-First) and Deprecate Keystroke Injection in Favor of Agent-Side Alerts

Date: 2026-01-29  
Author: Codex (GPT-5.2)

## Context

用户要求“按 `PLAN.md` 来实现”，并将“给其他终端输入 `/bus` + Enter（含输入法切换）”的方案改为更稳的替代方案。

当前仓库已有 Bash 版 `bin/ai-workspace`、`scripts/init.sh`、`scripts/skills.sh` 以及 `scripts/ai-bus.sh`，并已新增 agent-side 的 `ai-bus-listen.sh` / `ai-bus-alert.sh`（不需要辅助功能权限）。

## Decision

1. 按 `PLAN.md` 的方向推进 npm 化，但采用 **wrapper-first** 迁移策略：
   - 先提供 npm `ai-workspace` CLI（Node）作为统一入口；
   - 命令实现优先复用现有 Bash 脚本（减少重写风险），后续再逐步内聚到 Node。
2. “跨窗口键盘注入（osascript + 切换输入法 + Return）”不作为默认/推荐方案：
   - `watch/notify` 改为 **agent-side alert/listen**（标题 badge/铃声/通知中心/日志），由用户主动执行 `check/consume`；
   - 仅保留注入作为实验性脚本（如果保留）并在文档与 skills 中标注不推荐。
3. 更新 skills 与文档，默认引导使用 `ai-bus-alert.sh` / `ai-bus-listen.sh` 完成“通知另一个终端里的 Codex/agent”的体验。

## Implications

- `PLAN.md` 中 daemon/injector 的实现顺序需要后移或改写为可选后端；主线先交付可用的 npm CLI + init + bus/ctx。
- “通知效果”从“强制执行 `/bus`”转为“可靠提醒 + 人工/脚本消费”，避免 IME/权限/窗口定位的碎片化问题。
