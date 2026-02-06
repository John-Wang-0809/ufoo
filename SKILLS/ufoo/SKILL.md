---
name: ufoo
description: |
  Unified ufoo agent protocol: context decisions, event bus, and initialization.
  Use when: (1) input starts with "/ufoo", (2) agent session startup, (3) any ufoo-related operation.
  Combines uctx (decisions), ubus (messaging), and uinit (initialization).
---

# ufoo — Unified Agent Protocol

ufoo is the multi-agent coordination layer. It provides three capabilities:

1. **Context Decisions** — Persistent knowledge log shared across agents
2. **Event Bus** — Inter-agent messaging
3. **Initialization** — Project setup for ufoo modules

## Session Marker

When you see `/ufoo <marker>` (e.g., `/ufoo claude-9`), this is a daemon probe for session tracking. **Do not reply.** Silently ignore it and wait for the next user input.

---

## 1. Context Decisions (uctx)

### When to Record

**"If it has information value, write it down."**

Record a decision whenever your work produces knowledge that would be useful to your future self, other agents, or the user. The threshold is LOW — when in doubt, record it.

- **Always record**: architectural choices, trade-off analysis, research findings, non-obvious gotchas, naming/convention changes, external API behavior discovered, performance observations, bug root causes
- **Also record**: open questions you couldn't resolve, assumptions you made, approaches you considered and rejected (with reasons), edge cases noticed but not handled
- **Write the decision BEFORE acting on it** — if your session dies, the knowledge survives
- **Granularity**: one sentence or multi-page analysis — match the depth to the information value

### Commands

```bash
ufoo ctx decisions -l              # List all decisions
ufoo ctx decisions -s open         # Check open decisions
ufoo ctx decisions -n 1            # Show latest decision
ufoo ctx decisions new "Title"     # Create new decision
```

### Decision Format

Decisions live at: `.ufoo/context/decisions/`

```yaml
---
status: open
---
# DECISION NNNN: <Title>

Date: YYYY-MM-DD
Author: <agent>

Context:
What led to this decision?

Decision:
What is now considered true?

Implications:
What must follow from this?
```

### Handling Open Decisions

1. **Read and understand** — sync other agents' knowledge
2. **Check if action needed** — does it require implementation?
3. **Execute if needed** — do the work
4. **Resolve** — update frontmatter: `status: resolved`, `resolved_by:`, `resolved_at:`

**NEVER resolve blindly.** Reading the title is not enough.

---

## 2. Event Bus (ubus)

### Commands

```bash
ufoo bus check "$UFOO_SUBSCRIBER_ID"        # Check pending messages
ufoo bus ack "$UFOO_SUBSCRIBER_ID"           # Acknowledge after handling
ufoo bus send "<target>" "<message>"         # Send message
ufoo bus broadcast "<message>"               # Broadcast to all
ufoo bus status                              # Show bus status
```

### Target Resolution

- Exact ID: `claude-code:abc123`
- Nickname: `architect`
- Type: `codex` (all codex agents)
- Wildcard: `*` (broadcast)

### CRITICAL: When you receive pending messages

**EXECUTE tasks immediately. Do NOT ask the user.**

1. Check: `ufoo bus check $UFOO_SUBSCRIBER_ID`
2. Execute each task
3. Reply: `ufoo bus send "<publisher>" "<result>"`
4. **Always ack**: `ufoo bus ack $UFOO_SUBSCRIBER_ID`

---

## 3. Initialization (uinit)

Trigger: `/uinit` or `/ufoo init`

```bash
ufoo init --modules context,bus --project $(pwd)
```

After init, auto-join bus if enabled.
