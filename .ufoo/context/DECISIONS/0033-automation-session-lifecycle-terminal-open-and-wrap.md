---
status: resolved
resolved_by: codex
resolved_at: 2026-01-29
---
# DECISION 0033: Automation-Only Session Lifecycle (Auto Join/Leave) via Terminal.app `do script` + Wrapper

Date: 2026-01-29  
Author: Codex (GPT-5.2)

## Context

用户已决定“无人干预自动执行”走两种权限（不再讨论），但仍希望 A) 能在无人干预下自动订阅/解除订阅（join/leave）。

对 Terminal.app 来说，这类“生命周期管理”不需要把输入喂给 TUI stdin；只需要：
- 在目标会话启动时执行 `ai-bus join`
- 在目标会话结束时执行 `ai-bus leave`

该能力可以用 **纯 Automation**（Terminal AppleScript `do script`）启动一个新的 tab/window 来完成。

## Decision

1. 增加两个脚本：
   - `ai-bus-session.sh`：在目标终端会话内执行 join，然后 `exec` 目标命令；并用 `trap` 在退出时自动 leave。
   - `ai-bus-terminal-open.sh`：用 Terminal.app 的 `do script` 打开新 tab/window，并运行 `ai-bus-session.sh`。
2. `ai-workspace init --modules bus` 会把上述脚本复制到项目 `scripts/`，使项目自洽（不依赖全局路径）。
3. 该方案定位为“自动订阅/解除订阅（A）”；不承诺对“自动执行 /bus（B）”有效。

## Implications

- 使用该方案只需 Automation 权限（允许脚本控制 Terminal），不需要 Accessibility。
- 会话的订阅者 ID/tty 会在 join 时写入 `.ai-bus/bus.json`，便于后续 autotrigger 定位。
