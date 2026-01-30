# ufoo NPM 包实施计划

## 一、项目概述

将 ufoo 重构为一个 npm 全局安装包，提供：
1. **CLI 工具** - 统一的命令行入口
2. **全局守护进程** - 跨项目的消息分发
3. **Skills** - Claude Code / Codex 的交互入口

## 二、目标架构

```
~/.ufoo/                    # 全局目录（首次运行时创建）
├── config.json                     # 全局配置
├── projects.json                   # 已注册项目列表
├── daemon.pid                      # 守护进程 PID
└── logs/                           # 日志目录

~/.claude/skills/                   # Claude Code Skills
├── bus/SKILL.md
└── ctx/SKILL.md

~/.codex/skills/                    # Codex Skills（同上）

<project>/.context/              # 项目级上下文（ufoo init 后）
├── README.md
├── DECISIONS/
└── ...

<project>/.bus/                  # 项目级事件总线（ufoo init 后）
├── bus.json
├── events/
└── queues/
```

## 三、NPM 包结构

```
ufoo/
├── package.json
├── bin/
│   └── ufoo.js             # CLI 入口 (#!/usr/bin/env node)
├── src/
│   ├── index.js                    # 主模块导出
│   ├── cli.js                      # CLI 解析 (commander/yargs)
│   ├── commands/
│   │   ├── init.js                 # ufoo init
│   │   ├── start.js                # ufoo start
│   │   ├── stop.js                 # ufoo stop
│   │   ├── status.js               # ufoo status
│   │   ├── install-skills.js       # ufoo install-skills
│   │   ├── bus/
│   │   │   ├── index.js            # ufoo bus
│   │   │   ├── join.js             # ufoo bus join
│   │   │   ├── leave.js            # ufoo bus leave
│   │   │   ├── send.js             # ufoo bus send
│   │   │   ├── check.js            # ufoo bus check
│   │   │   ├── status.js           # ufoo bus status
│   │   │   └── broadcast.js        # ufoo bus broadcast
│   │   └── ctx/
│   │       ├── index.js            # ufoo ctx
│   │       ├── sync.js             # ufoo ctx sync
│   │       └── lint.js             # ufoo ctx lint
│   ├── daemon/
│   │   ├── index.js                # 守护进程主逻辑
│   │   ├── watcher.js              # 文件监听
│   │   └── injector.js             # 窗口注入（osascript）
│   ├── utils/
│   │   ├── paths.js                # 路径常量
│   │   ├── config.js               # 配置读写
│   │   ├── logger.js               # 日志
│   │   ├── permissions.js          # macOS 辅助功能权限检测
│   │   └── terminal.js             # 终端窗口操作
│   └── platform/
│       ├── index.js                # 平台检测
│       ├── macos.js                # macOS 实现（osascript）
│       ├── linux.js                # Linux 实现（预留）
│       └── windows.js              # Windows 实现（预留）
├── protocol/                       # 协议文档（只读参考）
│   ├── README.md
│   ├── SYSTEM.md
│   ├── RULES.md
│   ├── CONSTRAINTS.md
│   ├── TERMINOLOGY.md
│   ├── CONTEXT-STRUCTURE.md
│   ├── DECISION-PROTOCOL.md
│   └── HANDOFF.md
├── templates/                      # 项目初始化模板
│   ├── context/
│   │   ├── README.md
│   │   ├── ASSUMPTIONS.md
│   │   ├── CONSTRAINTS.md
│   │   ├── TERMINOLOGY.md
│   │   ├── SYSTEM.md
│   │   └── DECISIONS/.gitkeep
│   └── bus/
│       └── bus.json
├── skills/                         # Skills 模板
│   ├── bus/
│   │   └── SKILL.md
│   └── ctx/
│       └── SKILL.md
└── test/
    └── ...
```

## 四、CLI 命令设计

### 4.1 全局命令

| 命令 | 描述 |
|------|------|
| `ufoo init [--modules context,bus]` | 在当前项目初始化 |
| `ufoo start` | 启动全局守护进程 |
| `ufoo stop` | 停止守护进程 |
| `ufoo status` | 查看守护进程和项目状态 |
| `ufoo install-skills` | 安装 skills 到 ~/.claude/skills/ |
| `ufoo version` | 显示版本 |

### 4.2 Bus 子命令

| 命令 | 描述 |
|------|------|
| `ufoo bus join [session] [--nick <name>]` | 加入总线，设置窗口标题 |
| `ufoo bus leave` | 离开总线 |
| `ufoo bus send <target> <message>` | 发送消息 |
| `ufoo bus broadcast <message>` | 广播消息 |
| `ufoo bus check` | 检查待处理消息 |
| `ufoo bus status` | 查看总线状态 |
| `ufoo bus consume [--limit n]` | 消费消息 |

### 4.3 Ctx 子命令

| 命令 | 描述 |
|------|------|
| `ufoo ctx` | 快速状态检查 |
| `ufoo ctx sync` | 同步上下文 |
| `ufoo ctx lint` | 验证上下文完整性 |
| `ufoo ctx decisions` | 列出所有决策 |

## 五、实施阶段

### Phase 1: 项目初始化 (Day 1)

- [ ] 创建 npm 包目录结构
- [ ] 配置 package.json
  - name: `ufoo`
  - bin: `{ "ufoo": "./bin/ufoo.js" }`
  - dependencies: `commander`, `chalk`, `fs-extra`, `jsonfile`
- [ ] 创建 CLI 入口 `bin/ufoo.js`
- [ ] 实现基础命令解析 `src/cli.js`

### Phase 2: 核心命令 (Day 2)

- [ ] 实现 `ufoo init`
  - 检测当前目录
  - 询问要启用的模块（context/bus）
  - 复制模板到 `.context/` 和 `.bus/`
  - 注册项目到 `~/.ufoo/projects.json`
- [ ] 实现 `ufoo install-skills`
  - 复制 skills 到 `~/.claude/skills/`
  - 复制 skills 到 `~/.codex/skills/`
- [ ] 实现 `ufoo version`

### Phase 3: Bus 命令 (Day 3)

- [ ] 迁移 `bus.sh` 逻辑到 Node.js
  - `src/commands/bus/join.js`
  - `src/commands/bus/leave.js`
  - `src/commands/bus/send.js`
  - `src/commands/bus/check.js`
  - `src/commands/bus/status.js`
  - `src/commands/bus/broadcast.js`
- [ ] 实现窗口标题设置（跨平台）
- [ ] 测试所有 bus 命令

### Phase 4: Ctx 命令 (Day 4)

- [ ] 迁移上下文相关逻辑
  - `src/commands/ctx/sync.js`
  - `src/commands/ctx/lint.js`
  - `src/commands/ctx/decisions.js`
- [ ] 测试所有 ctx 命令

### Phase 5: 守护进程 (Day 5)

- [ ] 实现守护进程核心 `src/daemon/index.js`
  - 监听所有注册项目的 `.bus/queues/`
  - 检测新消息
  - 调用 injector 注入命令
- [ ] 实现 macOS 注入器 `src/platform/macos.js`
  - 切换英文输入法
  - 通过窗口标题找到目标窗口
  - 注入 `/bus` + 回车
- [ ] 实现 `ufoo start`
  - 检测辅助功能权限
  - 后台启动守护进程
  - 记录 PID
- [ ] 实现 `ufoo stop`
- [ ] 实现 `ufoo status`

### Phase 6: Skills 更新 (Day 6)

- [ ] 更新 `skills/bus/SKILL.md`
  - 所有命令改为调用 `ufoo bus xxx`
- [ ] 更新 `skills/ctx/SKILL.md`
  - 所有命令改为调用 `ufoo ctx xxx`
- [ ] 测试 skills 在 Claude Code 中的执行

### Phase 7: 协议文档整合 (Day 7)

- [ ] **不要移动/删除 `modules/`**（monorepo 模块边界固定）
- [ ] 如需发布 npm 包：将 `modules/context/*.md` **复制/打包** 到 `protocol/`（只读镜像）
- [ ] 将 `modules/context/TEMPLATES/*.md` **复制/打包** 到 `templates/context/`（初始化模板镜像）
- [ ] 更新文档中的引用路径（从“移动”改为“打包来源”）

### Phase 8: 测试与发布 (Day 8)

- [ ] 编写测试用例
- [ ] 本地测试 `npm link`
- [ ] 编写 README.md
- [ ] 发布到 npm

## 六、关键实现细节

### 6.1 守护进程架构

```javascript
// src/daemon/index.js
class AiBusDaemon {
  constructor() {
    this.projects = [];      // 已注册项目列表
    this.watchers = {};      // 每个项目的队列监听器
    this.lastCounts = {};    // 每个队列的上次消息数
  }

  async start() {
    // 1. 加载已注册项目
    this.projects = await this.loadProjects();

    // 2. 为每个项目创建监听器
    for (const project of this.projects) {
      this.watchProject(project);
    }

    // 3. 定期检查新项目
    setInterval(() => this.checkNewProjects(), 30000);
  }

  watchProject(projectPath) {
    const queuesDir = path.join(projectPath, '.bus/queues');
    // 监听队列变化...
  }

  async onNewMessage(project, subscriber, message) {
    // ✅ 推荐：不要跨窗口“输入 /bus”，避免 IME/权限/窗口定位问题
    // 改为：写入“未读计数/通知标记”，由该会话的 alert/listen 进程自行提示用户
    //
    // 例如（思路）：更新每个 subscriber 的 badge 文件
    //   <project>/.bus/badges/<safe_subscriber>.json
    // 或仅依赖 queues/pending.jsonl 的增长，由 bus-alert.sh 轮询并提示（title/bell/通知中心）
  }
}
```

### 6.2 macOS 注入器

```javascript
// src/platform/macos.js
const { execSync } = require('child_process');

// ✅ 更稳的做法：只做“通知”，不做“按键注入”
function notify(subtitle, body) {
  // 注意：Notification Center 不需要“辅助功能”权限
  execSync(`osascript -e 'display notification "${body}" with title "bus" subtitle "${subtitle}"'`);
}
```

### 6.3 权限检测

```javascript
// src/utils/permissions.js
const { execSync } = require('child_process');

function checkAccessibilityPermission() {
  // 不再作为主路径依赖：alert/listen 不需要辅助功能权限
  return true;
}

function promptForPermission() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  可选：如仍使用“按键注入”，需要「辅助功能」权限            ║
║                                                            ║
║  请前往: 系统偏好设置 → 隐私与安全性 → 辅助功能            ║
║  勾选 Terminal.app（或你使用的终端应用）                   ║
╚════════════════════════════════════════════════════════════╝
  `);
}
```

### 6.4 Skills 示例

```markdown
# skills/bus/SKILL.md
---
name: bus
description: |
  事件总线交互。检查消息、发送消息、查看状态。
  Use when: 需要与其他 Agent 通信时
---

# /bus - 事件总线

## 检查消息

```bash
ufoo bus check
```

## 发送消息

```bash
ufoo bus send "<target>" "<message>"
```

## 查看状态

```bash
ufoo bus status
```

## 加入总线（设置昵称）

```bash
ufoo bus join --nick "架构师"
```
```

## 七、依赖项

```json
{
  "dependencies": {
    "commander": "^11.0.0",      // CLI 解析
    "chalk": "^5.0.0",           // 终端颜色
    "fs-extra": "^11.0.0",       // 文件操作
    "jsonfile": "^6.0.0",        // JSON 读写
    "inquirer": "^9.0.0",        // 交互式提示
    "chokidar": "^3.5.0",        // 文件监听
    "node-schedule": "^2.0.0"    // 定时任务（可选）
  }
}
```

## 八、测试计划

### 8.1 单元测试
- [ ] Bus 命令的 JSONL 读写
- [ ] 路径处理
- [ ] 配置读写

### 8.2 集成测试
- [ ] `ufoo init` 创建正确的目录结构
- [ ] `ufoo bus send/check` 消息流转
- [ ] 守护进程消息检测

### 8.3 端到端测试
- [ ] 两个终端之间的完整消息流程
- [ ] Skills 在 Claude Code 中的执行

## 九、后续扩展

### 9.1 跨平台支持
- Linux: 使用 `xdotool` 模拟键盘
- Windows: 使用 PowerShell 或 AutoHotkey

### 9.2 更多 Agent 类型支持
- Cursor
- VS Code + Continue
- 其他 AI 编程助手

### 9.3 Web Dashboard（可选）
- 实时查看所有项目的 Agent 状态
- 消息历史浏览
- 手动发送消息

## 十、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| macOS 辅助功能权限难以引导 | 提供清晰的文档和首次运行检测 |
| osascript 性能开销 | 使用批量操作，避免频繁调用 |
| 多项目同时使用时的资源占用 | 限制轮询频率，优化文件监听 |
| 输入法切换影响用户体验 | 记录并恢复原输入法（可选） |
