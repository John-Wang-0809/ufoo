---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0006: GitHub Repository & Skill Path Update

Date: 2026-01-28
Author: Human / AI

## Context

执行 Decision 0003 的要求：
- 创建 GitHub 仓库用于协议分发
- 移除 skill 中的硬编码路径 `/Users/...`
- 使用 git clone/pull 作为安装/更新机制

同时处理 Decision 0002 的遗留问题：
- `.ai-context/` 目录不应包含在协议仓库中（它是项目本地的）

## Decision

1. **GitHub 仓库已创建**：https://github.com/Icyoung/ai-context
2. **Skill 更新**：Step 1 现在使用 `git clone` 而非硬编码路径
3. **.gitignore**：排除 `.ai-context/`、`.claude/`、`.DS_Store`
4. **Skill 重命名**：`ai-context-init` → `ctx`

### 新的协议安装方式

```bash
git clone https://github.com/Icyoung/ai-context.git ~/.ai-context/protocol
```

### 更新协议

```bash
cd ~/.ai-context/protocol && git pull --ff-only
```

## Implications

- 任何人可以通过 GitHub 获取协议
- 协议更新通过 git pull 实现
- `.ai-context/` 保持项目本地，不随协议仓库分发
- Decision 0002 中关于根目录 `DECISIONS/` 的要求已过时（项目本地决策在 `.ai-context/DECISIONS/`）
- 已同步更新三处 skill：项目源、~/.claude/skills/ctx、~/.codex/skills/ctx
