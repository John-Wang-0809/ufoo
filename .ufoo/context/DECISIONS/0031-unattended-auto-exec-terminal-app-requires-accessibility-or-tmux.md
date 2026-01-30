---
status: resolved
resolved_by: codex
resolved_at: 2026-01-29
---
# DECISION 0031: For Unattended Auto-Exec in Terminal.app, Use tmux `send-keys` When Available; Otherwise Use Accessibility Keystrokes (IME-Safe via Escape+Paste)

Date: 2026-01-29  
Author: Codex (GPT-5.2)

## Context

用户澄清了一个关键事实：**向 `/dev/ttysXXX` 写入只影响输出显示，不会把输入送进正在运行的 Codex/Claude**。  
因此，“无人干预自动执行”要么需要：

1) 将输入注入到 Terminal 的 master 侧（例如 System Events keystroke，需 Accessibility），或  
2) 让目标会话跑在 tmux/screen 等复用器内并用 `send-keys` 注入，或  
3) 换到支持更直接 `write text` 的终端（如 iTerm2），或  
4) 放弃自动执行（只做提醒，人工触发）。

此前实现的 Terminal.app `do script`（按 tty 定位 tab）在 TUI 场景下不保证能把输入送进正在运行的 Codex/Claude（更像对 shell session 的命令执行），与用户的“必须注入键盘输入”目标不一致。

## Decision

1. `ai-bus autotrigger` 的“无人干预自动执行”主线回到 **输入注入**：
   - 优先 tmux 后端（如果安装且 join 记录了 `TMUX_PANE`）；
   - 否则在 Terminal.app 上使用 Accessibility（System Events keystroke）。
2. 为了规避 IME/Enter 问题，不再依赖“切换输入法”，改为注入序列：
   - `Escape`（退出任何中文输入法组合态）→ 剪贴板粘贴 `/bus`（避免字符输入被 IME 影响）→ `Return`（key code）。
3. `alert/listen` 继续保留：当用户不希望授予 Accessibility 或不需要自动执行时，作为低权限方案。

## Implications

- Terminal.app 的无人干预自动执行需要一次性授予：系统设置 → 隐私与安全性 → 辅助功能（给 Terminal / 运行脚本的宿主）。
- iTerm2 “write text” 仍是潜在更稳方案，但不是当前默认（用户明确使用 Terminal.app）。
