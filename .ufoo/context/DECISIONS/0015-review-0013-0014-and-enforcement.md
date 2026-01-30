---
status: resolved
resolved_by: codex
resolved_at: 2026-01-28
---
# DECISION 0015: Review 0013/0014 and Strengthen Enforcement (Pre-flight + Decision Workflow)

Date: 2026-01-28
Author: Codex (GPT-5.2)

## Context

用户请求对当前 open decisions 进行 review。

当前 open：
- DECISION 0013（扩展架构，拟分离 UI/ICONS）
- DECISION 0014（执行失败反思：需要 pre-flight 与更强机制）

同时发现一个一致性风险：DECISION 0012 已标记 resolved，但其要求的文档更新（purpose + 决策处理流程）在协议“law”文件中尚未完整落地，需要落实以避免再次发生“先回复、后记录/不记录”的违例。

## Decision

1. **采纳 0014 的方向**：把 “检查 → 记录 → 回复” 固化为显式流程（pre-flight checklist + 决策处理工作流），优先提升协议的可执行性。
2. **0013 不立即执行结构迁移**：不在当前阶段拆分/移除 `UI/` 与 `ICONS/`；先通过文档澄清它们的定位与价值（配合 0012），降低认知负担而不引入迁移成本。
3. **落实 0012（补强 law 文件）**：
   - 在 `SYSTEM.md` / `RULES.md` / `HANDOFF.md` / `README.md` / `SKILLS/ctx/SKILL.md` 中补齐 “Why” 与 “如何处理 decisions（read→understand→execute→verify→resolve）”。
4. **工具层面辅助**：
   - `ctx`/`doctor` 在输出中提示：若用户请求评估/建议/计划，必须先写 decision，再回复。

## Implications

- 0013 后续若仍要推进“扩展机制/拆分资源”，需在落实 0012/0014 后再开启，并提供迁移指引与兼容策略。
- 本次将通过修改协议文件与 skills 文档把流程写成默认行为，并在后续把 0014 标记为 resolved（在落实完成后）。
