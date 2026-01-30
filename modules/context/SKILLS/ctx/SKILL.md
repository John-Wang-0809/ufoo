---
name: ctx
description: |
  Quick ufoo context status check. Shows decisions and context health.
  Use when: (1) Starting a session, (2) User says "ctx", (3) Need quick context refresh.
  For full initialization, use ufoo init.
---

# AI Context Quick Check

## What this does

Fast context check for daily use. Run at session start or anytime.

Pre-flight reminder:
- If the user is asking for evaluation/recommendation/plan, write a decision before replying.

## Workflow

### 1. Verify structure exists

Check `.ufoo/context/` exists. If missing, tell user to run `ufoo init`.

### 2. List all decisions

```bash
ufoo ctx decisions -l
```

### 3. Show latest decision

```bash
ufoo ctx decisions -n 1
```

### 4. Report status

Brief summary:
- Open decisions count (need attention)
- Total decisions count
- Any issues found
- Ready to work

## Output format

```
=== ufoo context status ===
Project: <cwd>
Decisions: N open, M total
Latest open: DECISION XXXX: <title>

[Latest decision content]

Status: Ready ✓
```

## Handling Open Decisions

When there are open decisions, you MUST:

### 1. Read and understand
- Read the full content of each open decision
- Understand what other agents decided
- This is "syncing their memory to yours"

### 2. Check if action needed
- Does the decision require implementation?
- Is something already done that needs verification?
- Are there implications you need to follow?

### 3. Execute if needed
- If the decision requires action, do it first
- Verify the action was successful

### 4. Then resolve
Only after understanding and completing any required actions:
```yaml
---
status: resolved
resolved_by: <your-agent-name>
resolved_at: <date>
---
```

**NEVER resolve blindly.** Reading the title is not enough.

## Notes

- Script defaults to showing only `open` decisions
- Resolved decisions are skipped (already processed)
- Use `-s all` to see all decisions regardless of status
