# Codex Enter Key 注入问题研究

## 问题描述

在 Terminal.app 中使用 AppleScript 向 Codex 交互式会话注入输入时：
- ✅ `/ubus` 文本可以正常输入
- ❌ Enter 键无法触发提交

同样的脚本对 Claude Code 可以正常工作。

## 根本原因

### 1. Codex TUI 使用 crossterm 库

Codex 的 Rust TUI (`codex-rs/tui`) 使用 [crossterm](https://github.com/crossterm-rs/crossterm) 库处理键盘输入。

**已知问题**：crossterm 对 Enter 键的 modifier 检测有限制
- GitHub Issue: https://github.com/crossterm-rs/crossterm/issues/400
- 部分终端不能可靠地产生 Shift+Enter 或 Ctrl+Enter 事件

### 2. Codex TUI 输入 Bug

Codex 有已知的输入处理问题：
- GitHub Issue #7441: IME/粘贴的文本不显示，直到按下额外按键
- GitHub Issue #7215: 语音输入文本不插入，直到按 Enter
- 原因：TUI 在非第一轮对话时把 TTY 设置为 raw 模式

### 3. AppleScript keystroke vs 物理按键

AppleScript 的 `keystroke return` 发送的信号可能和物理键盘不完全一致，导致 crossterm 没有正确识别。

## 待测试的 Enter 键方法

### 方法 1: key code 36 (Return 键)
```applescript
key code 36
```

### 方法 2: keystroke return
```applescript
keystroke return
```

### 方法 3: ASCII 13 (Carriage Return)
```applescript
keystroke (ASCII character 13)
```

### 方法 4: Ctrl+J (ASCII 10, Line Feed)
```applescript
keystroke "j" using control down
```
注：Codex 使用 Ctrl+J 作为换行快捷键

### 方法 5: Ctrl+M (ASCII 13, Carriage Return)
```applescript
keystroke "m" using control down
```
注：在终端中 Ctrl+M 等同于 Enter

### 方法 6: key code 76 (小键盘 Enter)
```applescript
key code 76
```

## Codex TUI Bug Workaround

针对 #7441 的 workaround：在粘贴前后发送触发键
```applescript
-- 发送空格触发 TUI 刷新
keystroke " "
delay 0.1
key code 51 -- Backspace 删除

-- 粘贴命令
set the clipboard to "/ubus"
keystroke "v" using command down

-- 再次触发
keystroke " "
key code 51
delay 1.5  -- 等待 1.5 秒（参考 tmux-cli）

-- 发送 Enter
key code 36
```

## 替代方案

### 方案 A: 使用 iTerm2
iTerm2 支持 `write text` AppleScript 命令，直接写入文本（包含换行）：
```applescript
tell application "iTerm2"
    tell current session of current window
        write text "/ubus"
    end tell
end tell
```

### 方案 B: 使用 tmux
tmux 的 `send-keys` 可以分开发送文本和 Enter：
```bash
tmux send-keys -t session "/ubus"
sleep 1.5
tmux send-keys -t session Enter
```
参考：https://github.com/pchalasani/claude-code-tools

### 方案 C: 使用 codex exec 非交互模式
绕过交互式 TUI，直接执行：
```bash
codex exec "检查 ufoo bus check codex:xxx 并执行待处理消息"
```

### 方案 D: 使用 Codex SDK
程序化控制 Codex：
```typescript
import { Codex } from "@openai/codex-sdk";
const codex = new Codex();
const thread = codex.startThread();
await thread.run("检查事件总线消息");
```

## 参考资料

- Codex TUI 源码: https://github.com/openai/codex/tree/main/codex-rs/tui
- crossterm 库: https://github.com/crossterm-rs/crossterm
- iterm-mcp (iTerm2 自动化): https://github.com/ferrislucas/iterm-mcp
- claude-code-tools (tmux 自动化): https://github.com/pchalasani/claude-code-tools
- Codex SDK: https://developers.openai.com/codex/sdk/
