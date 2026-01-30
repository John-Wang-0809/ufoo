---
status: resolved
resolved_by: claude-code
resolved_at: 2026-01-28
---
# DECISION 0012: Document Protocol Purpose and Decision Handling Flow

Date: 2026-01-28
Author: Human / AI (claude-code)

## Context

The protocol files (SYSTEM.md, RULES.md, HANDOFF.md, README.md) were missing critical documentation:

1. **Why this protocol exists** — No explanation of the two problems it solves:
   - Multi-agent memory sync
   - Compensating AI aesthetic weaknesses

2. **How to handle decisions** — HANDOFF.md said "read" but not "understand → execute → verify → resolve". This led to blind resolving without actually processing decisions.

## Decision

Update protocol "law" files to document:

1. **SYSTEM.md** — Add "Purpose" section explaining the two problems
2. **RULES.md** — Add decision handling rules and UI/ICONS rationale
3. **HANDOFF.md** — Add complete decision processing workflow (read → understand → execute → verify → resolve)
4. **README.md** — Add "Why" section at the top
5. **ctx skill** — Add "Handling Open Decisions" section with the same workflow

## Implications

- All AI agents reading the protocol now understand WHY it exists
- Decision handling is explicit: never resolve without reading and understanding
- UI/ICONS purpose is clear: compensate for AI weaknesses, not decoration
