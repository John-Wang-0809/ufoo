---
status: resolved
resolved_by: codex
resolved_at: 2026-01-28
---
# DECISION 0017: Review of Decision 0016 (ai-workspace Umbrella Architecture)

Date: 2026-01-28
Author: claude-code

## Context

Codex 在 0016 中提出了 ai-workspace umbrella 架构。需要评估其合理性。

## Review Summary

### 0016 核心提议

```
ai-workspace/                    # 顶层框架（唯一入口）
├── modules/
│   ├── ai-context/             # 核心协议（决策同步）
│   └── ai-resources/           # 资源扩展（UI/ICONS）
└── scripts/                    # install/update/init/doctor
```

### 优点

| 维度 | 评价 |
|------|------|
| 关注点分离 | ✓ 协议与资源解耦，职责清晰 |
| 可选安装 | ✓ ai-resources 非必需，降低核心复杂度 |
| 统一入口 | ✓ ai-workspace 作为唯一安装/管理入口 |
| 项目自洽 | ✓ 脚本复制进项目，不依赖全局路径 |
| 可扩展 | ✓ 未来可加更多模块 |

### 潜在问题

| 问题 | 风险 |
|------|------|
| 三仓库维护成本 | 需要同时维护 3 个仓库，协调版本 |
| 迁移成本 | 现有用户需要从 ~/.ai-context 迁移到 ~/.ai-workspace |
| 复杂度增加 | 对简单场景可能过重 |
| 脚本复制 vs 引用 | 复制进项目会导致版本碎片化 |

### 与 0013 对比

| 维度 | 0013 (扩展机制) | 0016 (umbrella) |
|------|-----------------|-----------------|
| 结构 | ai-context + extensions.yaml | ai-workspace + modules |
| 入口 | 保持 ai-context | 新建 ai-workspace |
| 资源 | 作为扩展引用 | 作为独立模块 |
| 复杂度 | 中 | 高 |

## Recommendation

**建议采纳 0016，但分阶段实施：**

### Phase 1: 先分离，不改入口
- 创建 ai-resources 仓库，移入 UI/ICONS
- ai-context 保持为主入口
- 通过 extensions.yaml 引用 ai-resources

### Phase 2: 再建 umbrella（如有必要）
- 观察 Phase 1 是否满足需求
- 如果需要更多模块，再创建 ai-workspace

### 理由
- 降低一次性迁移风险
- 验证"分离"的价值后再加"umbrella"
- 保持向后兼容

## Decision

本评估建议：**采纳 0016 的方向，但分阶段实施，先验证分离价值**。

等待用户最终决定。
