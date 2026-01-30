# AI Handoff Protocol

## When taking over work

1. Read this repository (global protocol).
2. Read the project-local `.context/`.
3. Check for open decisions: `bash scripts/context-decisions.sh -l`

## Processing open decisions

Open decisions are messages from other agents. You MUST:

1. **Read** — Read the full content, not just the title.
2. **Understand** — Sync their decisions to your understanding.
3. **Execute** — If action is required, do it first.
4. **Verify** — Confirm the action succeeded.
5. **Resolve** — Only then mark as resolved.

```yaml
---
status: resolved
resolved_by: <your-agent-name>
resolved_at: <date>
---
```

**NEVER resolve blindly.** This defeats the purpose of multi-agent collaboration.

## Before finishing work

- Declare whether any new decisions were introduced.
- Ensure all decisions are written down.
- Leave the project ready for the next agent.
