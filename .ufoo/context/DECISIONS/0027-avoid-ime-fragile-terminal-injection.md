---
status: resolved
resolved_by: codex
resolved_at: 2026-01-29
---
# DECISION 0027: Prefer Agent-Side Polling / tmux Send-Keys Over macOS IME Switching for “Notify Other Terminals”

Date: 2026-01-29  
Author: Codex (GPT-5.2)

## Context

用户当前用 `osascript` 对其他终端窗口进行“输入 `/bus` + Enter”的注入，以便通知其他终端/AI coding agent。

主要痛点：在中文输入法（IME）下，Enter 可能被用于“选词/提交组合”，导致 `/bus` 无法被正确执行；因此引入“切换到 ABC 英文输入法”的步骤，但该步骤脆弱、权限重、且与终端实现高度耦合。

## Decision

1. 该“注入键盘事件”方案可以保留为实验性的 fallback，但不作为主路径依赖。
2. 主路径优先选择两类替代方案（从稳健到激进）：
   - **Agent-side polling / listener**：每个 agent 会话自己监听 `.ai-bus/queues/*` 并在收到消息时提示/执行（无需跨窗口输入）。
   - **tmux/screen send-keys**：如果需要“推送式触发”，优先通过 `tmux send-keys` / `screen -X stuff` 发送到目标 pane/session，绕开 OS 级 IME 与窗口定位。
3. 若仍必须走 macOS 级注入：
   - 优先尝试“取消组合态”而非“切换输入法”（例如先发送 Escape），以及使用 `key code 36`（Return）而不是依赖文本输入法语义；并用剪贴板粘贴降低字符输入的不确定性。

## Implications

- 后续若实现 daemon，应优先实现 “listener/polling” 或 “tmux/screen” 的可选后端，再考虑 `osascript` 注入。
- “跨窗口键盘注入 + 输入法切换” 属于高权限/高碎片化方案，需要明确验收标准与支持范围后再投入工程化。
