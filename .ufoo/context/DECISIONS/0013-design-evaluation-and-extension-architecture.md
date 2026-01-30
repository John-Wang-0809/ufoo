---
status: wontfix
resolved_by: codex
resolved_at: 2026-01-28
---
# DECISION 0013: Design Evaluation and Extension Architecture Proposal

Date: 2026-01-28
Author: claude-code

## Context

对 ai-context 项目进行了全面评估，发现设计基本合理但有改进空间。同时讨论了 UI/ICONS 是否应该保留的问题。

## Evaluation Summary

### 设计合理性

| 维度 | 评分 | 评价 |
|------|------|------|
| 核心理念 | ★★★★★ | "Files are truth, not memory" 解决根本问题 |
| 分层架构 | ★★★★☆ | Global/Project 分离清晰 |
| 可执行性 | ★★★★☆ | "Enforceable by file inspection" 原则好 |
| 模型无关 | ★★★★★ | 纯 Markdown + Bash |

### 实用性

| 场景 | 有效性 |
|------|--------|
| 单人 + 多 AI 工具 | ★★★★☆ 核心价值 |
| 多人 + 多 AI 协作 | ★★★★★ 非常适合 |
| 短期小项目 | ★★☆☆☆ ROI 低 |
| 长期大项目 | ★★★★★ 价值随时间增长 |

### 识别的问题

1. **冷启动成本高** — 需要 clone + 创建目录 + 配置多个文件
2. **UI/ICONS 定位模糊** — 与核心决策同步功能关系不大，增加认知负担
3. **缺少扩展机制** — 目前是单体设计，难以按需选用功能

## Decision

### 1. 核心协议保持纯粹

ai-context 核心只做一件事：**多 AI agent 的决策同步**

移除或分离：
- UI/ → 移到扩展
- ICONS/ → 移到扩展

### 2. 引入扩展机制

```
ai-context/                      # 核心协议
├── protocol/
├── SKILLS/
├── scripts/
└── EXTENSIONS.md                # 扩展索引

ai-context-resources/            # 官方资源扩展（独立仓库）
├── icons/
├── ui/
└── components/
```

扩展配置方式：
```yaml
# ~/.ai-context/extensions.yaml
extensions:
  - name: resources
    repo: github.com/Icyoung/ai-context-resources
    path: ~/.ai-context/extensions/resources
```

### 3. 好处

- 核心纯粹，易理解
- 资源可独立演进
- 用户可选择性安装
- 支持社区扩展

## Implications

- 需要创建 ai-context-resources 仓库
- 需要设计扩展发现和安装机制
- 需要更新 ai-context-init skill 支持扩展
- 现有 UI/ICONS 用户需要迁移指引
