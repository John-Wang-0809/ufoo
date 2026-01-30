---
status: wontfix
resolved_by: codex
resolved_at: 2026-01-28
---
# DECISION 0020: Repo Layout — GitHub Multi-Repo (Modules) + Local `~/.ai-workspace/modules` Install Layout

Date: 2026-01-28
Author: Codex (GPT-5.2)

## Context

用户询问：`ai-context` 与 `ai-resources` 这两个“新仓库”是否应该放在 `ai-workspace` 里面？以及 GitHub 上通常如何处理这种 umbrella + modules 的项目结构。

该问题本质是在确定：
- GitHub 代码托管形态（monorepo vs multi-repo）
- 本地安装/运行时目录结构（例如 `~/.ai-workspace/modules/...`）

## Decision

采用 **GitHub multi-repo**（三个独立仓库）+ **本地统一安装根目录** 的组合：

1. `ai-workspace`、`ai-context`、`ai-resources` 在 GitHub 上分别是独立仓库（同一 org 下）。
2. `ai-workspace` 负责“安装/更新/初始化”：把模块仓库 clone 到本地统一根目录：
   - `~/.ai-workspace/modules/ai-context`
   - `~/.ai-workspace/modules/ai-resources`
3. GitHub 上不把“一个仓库嵌套进另一个仓库的目录里”作为常态；若需要在一个仓库中引用另一个仓库，优先用文档链接与安装脚本管理，而不是 submodule。

## Rationale

- 模块职责清晰、可独立发版与演进。
- 用户安装体验统一（单一全局根目录），但代码托管不混杂。
- 避免 git submodule 常见坑（更新/克隆步骤复杂、CI/工具兼容性差）。

## Implications

- `ai-workspace` README/文档作为“唯一入口”，链接到 `ai-context`/`ai-resources`。
- 本地开发可以在同一个父目录下放三个 sibling repos（例如 `~/Code/ai-workspace`, `~/Code/ai-context`, `~/Code/ai-resources`），但它们仍然是三个独立 git 仓库。
