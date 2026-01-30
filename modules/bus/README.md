# bus

基于文件系统的 Agent 事件总线，实现多 AI Coding Agent 之间的异步通信。

## 概述

bus 解决多 Agent 协作中的通信问题：

- 多个 Claude Code 实例在同一项目协作
- 不同 AI 工具（Claude Code, Cursor, Copilot）之间通信
- 任务委托和响应
- 广播消息

## 安装

通过 ufoo 初始化：

```bash
ufoo init --modules context,bus
```

## 目录结构

```
.bus/
├── bus.json      # 总线元信息 + 订阅者状态
├── events/       # 事件流（JSONL，按日期分片）
├── offsets/      # 各 Agent 消费进度
└── queues/       # 定向事件队列
```

## 使用

### 加入总线

```bash
SUBSCRIBER=$(bash scripts/bus.sh join)
# 输出: claude-code:a1b2c3
```

### 检查待处理消息

```bash
bash scripts/bus.sh check $SUBSCRIBER
```

### 发送消息

```bash
# 发给特定实例
bash scripts/bus.sh send "claude-code:abc123" "请帮我 review"

# 发给所有同类型实例
bash scripts/bus.sh send "claude-code" "请大家 review"

# 广播给所有人
bash scripts/bus.sh broadcast "我完成了 feature-x"
```

### 查看状态

```bash
bash scripts/bus.sh status
```

## 通知/提醒（不注入按键，推荐）

如果你想在另一个终端里运行 Codex/Claude 时“收到新消息提醒”，推荐用 **agent-side alert/listen**（避免输入法/辅助功能权限/窗口定位的碎片化问题）：

```bash
SUBSCRIBER=$(bash scripts/bus.sh join | tail -n 1)

# 后台提醒：标题 badge + 响铃 + 可选 macOS 通知中心
bash scripts/bus-alert.sh "$SUBSCRIBER" 1 --notify --daemon

# 或：前台持续打印新消息（适合开一个旁路终端）
bash scripts/bus-listen.sh "$SUBSCRIBER" --from-beginning
```

## 无人干预自动执行（推荐）

如果你需要 **Claude A 通知 Claude B / Codex C 后，被通知方自动执行**（例如自动触发 `/bus`），使用 `autotrigger`：

1) 在每个终端会话里先 `join`（会记录 `tty`，如果在 tmux 里也会记录 `TMUX_PANE`）：

```bash
SUBSCRIBER=$(bash scripts/bus.sh join | tail -n 1)
```

2) 在项目内启动 autotrigger（后台常驻）：

```bash
# backend=auto 会优先用 tmux（如果可用），否则尝试 Terminal.app do script（纯 Automation），最后才用 Accessibility
bash scripts/bus-autotrigger.sh start --interval 1 --command "/bus" --backend auto
```

3) 发送消息后，autotrigger 会把 `/bus` 注入到目标会话并回车执行：
- tmux：`send-keys`
- Terminal.app（纯 Automation）：`do script`（不需要 Accessibility，但依赖 Automation 授权；兼容性取决于目标程序是否能吃到输入）
- Terminal.app（Accessibility）：System Events（需 Accessibility），注入序列为 Escape + paste + Return（避免 IME 问题）

提示：
- Terminal.app 后端依赖 `bus.json` 里的 `tty`。请在目标终端会话里执行 `join`（确保 `tty` 不是 `not a tty`）。
- 纯 Automation 后端需要一次性授权：系统设置 → 隐私与安全性 → 自动化（允许脚本控制 Terminal）。
- Accessibility 后端需要一次性授权：系统设置 → 隐私与安全性 → 辅助功能（给 Terminal / 运行脚本的宿主）。

停止/查看状态：

```bash
bash scripts/bus-autotrigger.sh status
bash scripts/bus-autotrigger.sh stop
```

## 订阅者 ID 格式

```
{agent_type}:{instance_id}

示例:
  claude-code:a1b2c3
  cursor-ai:main
  copilot:session1
```

## 与 context 的关系

| 模块 | 解决的问题 |
|------|-----------|
| context | 共享上下文、决策记录、知识持久化 |
| bus | 实时通信、任务委托、消息传递 |

两者是平级的独立模块，可以单独使用，也可以组合使用。
