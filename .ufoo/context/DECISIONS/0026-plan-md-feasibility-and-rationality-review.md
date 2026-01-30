---
status: resolved
resolved_by: codex
resolved_at: 2026-01-29
---
# DECISION 0026: Feasibility/Reasonableness Review of `PLAN.md` (npm + daemon + skills)

Date: 2026-01-29  
Author: Codex (GPT-5.2)

## Context

用户要求评估仓库根目录 `PLAN.md`（“ai-workspace NPM 包实施计划”）的可行性与合理性。

当前仓库已通过 DECISION 0021/0024 确认：
- 本仓库 `ai-workspace` 为 canonical monorepo
- 模块边界为 `modules/*`
- 已存在 Bash 版 `bin/ai-workspace` + `scripts/init.sh`/`scripts/skills.sh` 等最小实现

## Evaluation

### 可行（Feasible）

`PLAN.md` 的目标（npm 全局 CLI + init + skills + bus/ctx 命令面）在工程上是可行的；用 Node.js（commander + fs-extra + chokidar）实现也合理。

### 不合理/需调整（Not Reasonable As-Written）

1. **与 monorepo 现实冲突**：Phase 7 提议 “移动模块到 `protocol/`/`templates/` 并删除 `modules/`” 与 DECISION 0021 的模块边界直接冲突，执行会破坏仓库结构与约束。
2. **重复建设**：计划按“从零搭 npm 包结构”写，但当前 repo 已有 Bash 入口与 init/skills 能力；更合理的是把 `PLAN.md` 改为“在现有实现上增量演进/或以其为 fallback”。
3. **守护进程/注入方案风险过高**：
   - 需要 macOS 辅助功能权限、依赖终端实现与窗口标题、输入法等，稳定性与可维护性风险高
   - 与“协议/上下文同步”核心价值相比，属于高成本、低确定性收益项
4. **工期不可信**：Day 1–8 的排期低估了：跨平台窗口注入、权限引导、测试、发布、回滚策略与文档迁移的工作量。
5. **路径口径不统一**：skills 的目标目录在计划里是 `~/.claude/skills/`，但当前 repo 体系里同时存在 `~/.agents/skills`（以及 Codex 的 `~/.codex/skills`）的既定路径，需要统一“支持哪些宿主/默认写哪里”。

## Decision

1. `PLAN.md` 仍可作为路线图，但必须先做“结构与假设校准”再按其推进：
   - Phase 7 的 “move/delete modules” 必须改为 “package/copy from `modules/*`”
   - 明确现有 Bash 实现作为 MVP/回退路径，避免从零重写带来的停摆
2. 将 daemon + osascript 注入从主线拆出：只有在明确需求与验收标准后才进入实现（单独 decision）。
3. 若目标是对外分发，优先把 “分发模型”定清楚（npm vs git clone vs 二者并行）；并定义最小可发布版本的验收标准（install/init/skills/doctor 的行为一致性）。

## Implications

- 后续如果要“按计划落地”，应先更新 `PLAN.md` 使其与 monorepo/现有脚本一致（这是文档层面的必要修复）。
- daemon 注入、跨平台支持、skills 目标目录属于 Must record 的架构取舍点，不能默默实现后再补文档。
