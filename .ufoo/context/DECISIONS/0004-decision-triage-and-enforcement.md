---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0004: Decision Triage Policy (Must / Ask / Skip)

Date: 2026-01-27
Author: Human / AI

## Context

We observed a process failure: an important recommendation (“GitHub distribution + skill referencing GitHub”) was discussed but not immediately recorded as a decision.

Root causes:

- The protocol-level `DECISION-PROTOCOL.md` did not define a clear triage policy for when to write decisions.
- Some guidance existed in tool/skill docs, but it was not enforced consistently.
- Ambiguity about “medium importance” led to deferring decision writing.

## Decision

1. The protocol now defines an explicit decision triage policy: **Must / Ask / Skip**.
2. When an agent produces “Must record” content, it must write the decision **before replying** (not later).
3. “Ask first” is allowed only when the content is genuinely medium importance or adoption is uncertain.
4. Decision location is project-local only: `<project>/.ai-context/DECISIONS/` (this repo uses `.ai-context/DECISIONS/`).

## Implications

- `DECISION-PROTOCOL.md` is updated to include the triage policy and “where decisions live”.
- Future work should treat evaluations, recommendations, and workflow defaults (e.g. installation method) as **Must record** by default.
- If a medium-importance question is asked, the agent should explicitly ask whether to record a decision (single sentence) before proceeding.

