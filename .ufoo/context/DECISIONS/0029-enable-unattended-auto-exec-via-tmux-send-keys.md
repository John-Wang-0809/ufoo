---
status: resolved
resolved_by: codex
resolved_at: 2026-01-29
---
# DECISION 0029: Unattended Auto-Execution Requires Input Injection; Prefer tmux `send-keys` Backend Over IME/Accessibility Keystrokes

Date: 2026-01-29  
Author: Codex (GPT-5.2)

## Context

用户明确需要在无人干预下：
- Claude A 通知 Claude B / Codex C
- 且被通知方需要 **自动执行**（例如自动触发 `/bus` 处理消息）

此前的 agent-side `alert/listen` 方案只做“提醒”，不向正在运行的 TUI/CLI（Codex/Claude）注入输入，因此无法实现“自动执行”。

## Decision

1. 要实现“自动执行”，必须把输入送进目标会话（stdin/PTY）。不可靠的 OS 级方案是 `osascript` + 输入法切换（IME/权限/窗口定位脆弱）。
2. 主推一个更稳的后端：**tmux `send-keys`**：
   - 被自动执行的 Codex/Claude 会话运行在 tmux pane 内；
   - `ai-bus` 在 `join` 时记录该 subscriber 的 `TMUX_PANE`；
   - `ai-bus-autotrigger` 监控该 subscriber 的 queue 变化后对 pane 执行 `tmux send-keys "/bus" Enter`。
3. 保留 `alert/listen` 作为不需要自动执行时的低权限方案；tmux autotrigger 作为“无人干预自动执行”的推荐实现。

## Implications

- “自动执行”将对运行环境提出约束：需要 tmux（或未来扩展 screen）。
- 不再把“IME 切换 + Return”作为默认主线方案；降低 macOS 辅助功能权限依赖与碎片化风险。
