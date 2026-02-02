---
name: ustatus
description: |
  Unified ufoo status check. Shows banner, unread bus messages, and open decisions.
  Use when: (1) User asks for status, (2) Quick health check, (3) Before starting work.
---

# ufoo Status

## What this does

Quick, unified status view:
- Banner
- Unread bus messages (unacked queues)
- Open decisions

## Workflow

### 1. Verify structure exists

Check `.ufoo/` exists. If missing, tell user to run `ufoo init`.

### 2. Run status command

```bash
ufoo status
```

### 3. Report status

Briefly summarize:
- Unread messages count
- Open decisions count
- Any immediate action needed

If unread messages > 0, advise running `ufoo bus check <subscriber>` and `ufoo bus ack <subscriber>` after handling.
