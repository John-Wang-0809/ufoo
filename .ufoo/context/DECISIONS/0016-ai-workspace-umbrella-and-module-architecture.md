---
status: open
---
# DECISION 0016: `ai-workspace` Umbrella + `ai-context` / `ai-resources` as Modules (Global Install + Per-Project Init)

Date: 2026-01-28
Author: Codex (GPT-5.2)

## Context

你提出：当前仓库名为 `ai-context`，其核心目标应聚焦“多 AI/多 agent 的上下文共享与决策同步”；`UI/`、`ICONS/`（以及更多资源类内容）更像“资源扩展”，不应与核心协议耦合。

你设想的改造方向：

- 顶层改为 `ai-workspace`（总仓库/总框架）
- `ai-context`（协议/上下文同步）与 `ai-resources`（UI/ICONS 等资源）作为子仓库/模块
- 全局安装到 `~/.ai-workspace/`
- 每个项目用 `ai-workspace-init` 初始化：可选启用一个或多个模块，并在项目内生成 `.ai-context/` 用于多 agent 协作共享真相
- 同时在项目 `CLAUDE.md` / `AGENTS.md` 注入自动检查与工作流

## Decision

采用 umbrella 架构（Option 3），并按“最佳实践”落地（**不做兼容、不保留 legacy 路径**）：

1. 新增顶层框架仓库：`ai-workspace`（作为唯一入口与安装/初始化工具提供者）。
2. `ai-context` 保持为独立模块仓库，聚焦：**多 agent 决策同步 + 项目 `.ai-context/` 结构与流程**；不包含 UI/ICONS 等资源内容。
3. `ai-resources` 作为独立模块仓库，包含 UI/ICONS 等参考资源（可选安装/可独立演进）。
4. 全局安装位置统一：`~/.ai-workspace/`，推荐结构：
   - `~/.ai-workspace/modules/ai-context`
   - `~/.ai-workspace/modules/ai-resources`
5. 模块管理不使用 git submodule：由 `ai-workspace` 脚本以 `git clone` / `git pull --ff-only` 管理模块更新；并引入 `config`/`lock`（可选）用于记录启用模块与版本 pin，保证可复现。
6. 项目初始化入口统一为 `ai-workspace init` / `ai-workspace-init`（脚本/skill），支持选择性启用模块；对每个项目生成 `.ai-context/`（truth）。
7. 为了最佳实践与“项目可自洽”，初始化时将所需脚本与模板 **复制进项目仓库**（例如放入 `<project>/scripts/`），避免运行时依赖全局绝对路径；同时向 `CLAUDE.md`/`AGENTS.md` 注入自动检查块（ctx/decisions/doctor + pre-flight checklist + 已启用模块列表）。

## Options Considered

1. 维持单仓库 `ai-context`（继续包含 UI/ICONS），仅通过文档澄清定位
2. `ai-context` 继续作为主仓库，但把资源拆为可选扩展（独立仓库/可选安装）
3. 采用 `ai-workspace` 作为 umbrella，将 `ai-context` 与 `ai-resources` 模块化，并统一全局安装与项目初始化入口

## Implications

- 明确模块边界与“默认最小可用”：默认只装 `ai-context` 就能在项目内生成 `.ai-context/` 并跑通 `ctx`；`ai-resources` 不应成为核心协议运行的硬依赖。
- `ai-workspace` 需要提供统一命令面：install/update/init/doctor/skills，并输出清晰的下一步指引。
- 文档需要把“协议（ai-context）”与“资源（ai-resources）”的角色分离说清楚，避免将 UI/ICONS 误解为协议必需品。
- 因为不做兼容：需要一次性更新所有对外文档/示例/skills，统一指向 `~/.ai-workspace` 与 `ai-workspace init`。
