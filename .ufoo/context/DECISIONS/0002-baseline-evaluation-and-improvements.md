---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0002: Baseline Evaluation & Improvements

Date: 2026-01-27
Author: Human / AI

## Context

User requested:

- 基础评估
- 实用性评估
- 改进建议

During validation, `scripts/ai-context-lint.sh` reported protocol/project inconsistencies:

- Protocol lint expected a repo-level `DECISIONS/` directory and at least one `DECISIONS/0002-*.md`.
- Project-context lint expected `<project>/.ai-context/README.md`.

## Decision

1. This repository will maintain a **protocol-level decision log** at `DECISIONS/` (repo root).
2. Project-local truth remains at `<project>/.ai-context/` (including `<project>/.ai-context/DECISIONS/`).
3. We will keep protocol and project context **lintable by file inspection**, and align docs + bootstrap output with the linter.

## Implications

- Create and maintain `DECISIONS/` in this repo; do not delete or rename it without an explicit decision.
- Ensure `.ai-context/README.md` exists in project contexts created/validated by init.
- Update documentation so required directories/files are discoverable (avoid “lint surprises”).

## Notes (Evaluation Summary)

### Strengths

- Clear separation principle: **law (global) vs truth (project)**.
- Files are small, enforceable, and model-agnostic.
- Templates + lint script give the protocol operational leverage (not just guidelines).

### Gaps / Risks

- Some internal inconsistencies (lint expectations vs current repo contents) reduce trust.
- Git usage is assumed, but this repo may not be initialized as a Git repository in some environments.

### Suggested next improvements

- Make `ai-context-init` produce a project context that passes `ai-context-lint` out of the box.
- Add a short “quick verify” section in README: run protocol lint + project lint.
