---
name: bus
description: |
  轮询事件总线，检查待处理消息。
  Use when: (1) 检查是否有其他 Agent 发来的消息, (2) 查看总线状态, (3) 定期轮询。
  如果尚未加入总线，会自动加入。
---

# /bus - 事件总线轮询

检查事件总线上的待处理消息。

## 参数

- `/bus` - 检查消息并显示状态
- `/bus watch` - 启动后台自动通知（标题 badge + 响铃 + 通知中心）
- `/bus stop` - 停止后台自动通知
- `/bus listen` - 前台持续监听并打印新消息（适合开一个旁路终端）
- `/bus auto` - 无人干预自动执行（自动注入 `/bus` 并回车）

## 执行流程

### 1. 检查 .ufoo/bus 是否存在

```bash
if [[ ! -d ".ufoo/bus" ]]; then
  echo "事件总线未初始化，请先运行 /ufoo-init 并选择 bus 模块"
  exit
fi
```

### 2. 检查是否已加入总线

读取 `.ufoo/bus/bus.json`，检查当前 session 是否已注册。

如果没有，自动加入：

```bash
SUBSCRIBER=$(ufoo bus join | tail -n 1)
echo "已加入事件总线: $SUBSCRIBER"
```

### 3. 处理参数

如果参数是 `watch`，使用 **Bash 工具的 `run_in_background: true`** 启动后台通知：

```bash
# 标题 badge + 响铃 + 通知中心（不需要辅助功能权限）
ufoo bus alert "$SUBSCRIBER" 2 --notify --daemon
```

如果参数是 `listen`，前台阻塞监听（不需要后台任务工具）：

```bash
ufoo bus listen "$SUBSCRIBER" --from-beginning
```

如果参数是 `auto`，无人干预自动执行：

```bash
# 启动 daemon（后台常驻），收到新消息会自动注入 /bus + Enter
ufoo bus daemon --daemon
```

提示：
- 需要用 `ufoo-bus` 包装器启动 Claude（会自动记录 tty）
- Terminal.app 需要 Accessibility 权限（用于注入键盘输入）

如果参数是 `stop`，停止后台通知：

```bash
ufoo bus alert "$SUBSCRIBER" --stop
```

### 4. 检查待处理事件

```bash
ufoo bus check "$SUBSCRIBER"
```

如果有待处理事件，显示：

```
=== 待处理消息 ===

@你 from claude-code:abc123
  类型: task/delegate
  内容: {"task":"review","file":"src/main.ts"}

---
请处理以上消息，完成后可以回复：
ufoo bus send "claude-code:abc123" "已完成 review，发现2个问题..."
```

### 5. 显示总线状态

```bash
ufoo bus status
```

输出：

```
=== 事件总线状态 ===
我的身份: claude-code:xyz789
在线订阅者: 2
  - claude-code:abc123
  - claude-code:xyz789
最近事件: 5 条
```

## 处理收到的消息

当收到定向消息时：

1. **理解请求** - 阅读消息内容
2. **执行任务** - 如果是任务委托，执行它
3. **回复发送者** - 完成后发送响应

```bash
ufoo bus send "<发送者ID>" "<回复内容>"
```

## 发送消息

```bash
# 发给特定 Agent
ufoo bus send "claude-code:abc123" "消息内容"

# 发给所有同类型 Agent
ufoo bus send "claude-code" "消息内容"

# 广播给所有人
ufoo bus broadcast "消息内容"
```
