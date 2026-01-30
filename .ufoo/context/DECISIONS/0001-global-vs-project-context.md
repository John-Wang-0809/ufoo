---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0001: Global vs Project Context Separation

Date: 2025-01-27
Author: Human / AI

## Context

需要明确全局和项目 context 的边界。

原设计允许在 `~/.ai-context/projects/` 写入决策，违反了核心原则：
- 不可审计（不在 Git）
- 不可 diff
- 项目间污染

## Decision

```
Global context defines the law.
Project context defines the truth.
```

**全局（只读）**：
```
~/.ai-context/
└── protocol/           # symlink to ai-context repo (READ-ONLY)
```

**项目（可写）**：
```
<project>/.ai-context/  # IN THE REPO, can diff, can review
```

## Red Line

**Never write decisions or assumptions to global.**

## Implications

- 全局只存协议，作为模板源
- 所有决策必须在项目内，可 Git 追踪
- ai-context-init 只创建项目本地 context
