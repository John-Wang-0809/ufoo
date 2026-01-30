---
status: resolved
resolved_by: codex
resolved_at: 2026-01-29
---
# DECISION 0030: Add Terminal.app Auto-Execute Backend Using `tty` + `do script` (Avoid IME and Accessibility)

Date: 2026-01-29  
Author: Codex (GPT-5.2)

## Context

用户需要无人干预自动执行，但本环境缺少 tmux（且用户不一定愿意强制依赖 tmux）。

macOS 上如果能将文本注入到目标终端会话的 stdin，就能触发 Codex/Claude 的 `/bus` 等命令；此前用 `System Events` keystroke 会受 IME/Enter 行为影响，并且依赖“辅助功能”权限。

`ai-bus` 在 join 时已记录 subscriber 的 `tty`（如 `/dev/ttys003`），Terminal.app 的 AppleScript API 可以枚举 tabs 并读取其 `tty`，进而对指定 tab 执行 `do script`（注入并执行一行文本）。

## Decision

1. `ai-bus-autotrigger` 增加 `terminal` 后端：
   - 通过 `bus.json` 中记录的 `tty` 定位 Terminal.app 的 tab；
   - 用 AppleScript `do script "<cmd>" in <tab>` 注入 `/bus` 等命令。
2. 该方案避免 IME/Enter 语义问题，且不需要“辅助功能”（Accessibility）权限；但需要 macOS “Automation” 允许脚本控制 Terminal。
3. tmux 后端继续保留为更通用/可移植的输入注入方式（若安装）。

## Implications

- “无人干预自动执行”的主线实现从“IME 切换 + keystroke”迁移到 “Terminal do script（按 tty 定位）/tmux send-keys”。
- 需要在文档与 skills 中说明：Terminal 后端需要一次性授权 Automation（控制 Terminal）。
