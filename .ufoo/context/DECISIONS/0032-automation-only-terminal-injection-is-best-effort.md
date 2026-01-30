---
status: resolved
resolved_by: codex
resolved_at: 2026-01-29
---
# DECISION 0032: “Automation Only” Terminal.app Injection Is Best-Effort; Default to tmux or Accessibility for Guaranteed Unattended Auto-Exec

Date: 2026-01-29  
Author: Codex (GPT-5.2)

## Context

用户希望“无人干预自动执行”，并询问是否存在“单纯依赖 Automation”的方案（不使用 Accessibility / System Events）。

在 macOS Terminal.app 上，Automation（AppleScript）提供 `do script`，但其语义更像“让 Terminal 执行一行命令”，并不保证能够把输入送进正在运行的 TUI（Codex/Claude）stdin/PTY。

## Decision

1. `Terminal.app do script` 作为 **Automation-only** 后端保留，但定位为 **best-effort**（不保证对 Codex/Claude TUI 生效）。
2. 需要“保证无人干预自动执行”的默认路线：
   - 优先 tmux `send-keys`（若可用）
   - 否则在 Terminal.app 使用 Accessibility（System Events），并用 **Escape + paste + Return** 避免 IME/Enter 问题（不切换输入法）
3. `autotrigger` backend 顺序（`auto`）维持：`tmux` → `terminal(do script)` → `accessibility(System Events)`

## Implications

- 若用户坚持“只用 Automation 且必须保证执行”，需要更换终端/宿主能力（例如 iTerm2 的 `write text`）或接受无法保证的限制。
