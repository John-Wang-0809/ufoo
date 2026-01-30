---
name: ufoo-init
description: |
  初始化 ufoo 模块到当前项目。
  Use when: (1) 新项目需要启用 context/bus, (2) 用户输入 /ufoo init。
  提供交互式模块选择，默认全选。
---

# ufoo init

初始化 ufoo 模块到当前项目。

## 触发

用户输入 `/ufoo-init` 或 `/ufoo init`

## 执行流程

### 1. 询问用户选择模块

使用 AskUserQuestion 工具，提供多选，默认全选：

```
请选择要启用的模块：

☑ context - 共享上下文协议（.ufoo/context/）
☑ bus - Agent 事件总线（.ufoo/bus/）
☐ resources - UI/Icons 资源（可选）
```

选项：
- `context` (推荐) - 共享上下文、决策记录、知识持久化
- `bus` (推荐) - 多 Agent 通信、任务委托、消息传递
- `resources` (可选) - UI 语调指南、图标库

默认选中: context, bus

### 2. 执行初始化

根据用户选择，执行：

```bash
ufoo init --modules <selected_modules> --project $(pwd)
```

### 3. 如果选择了 bus 模块，自动加入总线

```bash
SUBSCRIBER=$(ufoo bus join | tail -1)
echo "已加入事件总线: $SUBSCRIBER"
```

### 4. 报告初始化结果

```
=== ufoo 初始化完成 ===

已启用模块:
  ✓ context → .ufoo/context/
  ✓ bus → .ufoo/bus/

我的身份: claude-code:<session-id>

下一步:
  - 运行 /ctx 检查上下文状态
  - 查看 AGENTS.md 了解协议规则
```

## 注意事项

- 如果 .ufoo/context 或 .ufoo/bus 已存在，跳过创建
- 初始化完成后自动加入事件总线（如果启用了 bus）
- AGENTS.md 会被注入协议说明块
