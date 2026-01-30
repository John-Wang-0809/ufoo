# Project Instructions (Codex + Claude Code)

`CLAUDE.md` points to this file. Edit `AGENTS.md` only.

<!-- context -->
## context Protocol

This monorepo follows the context protocol. On session start, automatically:

1. Run `bash modules/context/scripts/context-decisions.sh -l` to list all decisions
2. Run `bash modules/context/scripts/context-decisions.sh -n 1` to show latest decision
3. Report status briefly

Key files:
- `.context/SYSTEM.md` - System overview
- `.context/CONSTRAINTS.md` - Non-negotiable rules
- `.context/ASSUMPTIONS.md` - Current assumptions
- `.context/TERMINOLOGY.md` - Shared vocabulary
- `.context/DECISIONS/` - Decision log (append-only)

Key principle:
```
Global context defines the law.
Project context defines the truth.
```

Decision recording policy (Must/Ask/Skip):
- **Must record**: evaluations, architectural recommendations, naming changes, trade-offs
- **Ask first**: medium importance or uncertain
- Write decision **before replying** when "Must record" applies.

## Pre-flight Checklist (BEFORE EVERY REPLY)

**STOP. Before you reply, check:**

1. **Open decisions?** → Read, understand, execute, then resolve. NEVER resolve blindly.
2. **Is this an evaluation/analysis/recommendation?** → Write decision FIRST, reply AFTER.
3. **Is this a trade-off or architectural choice?** → Write decision FIRST, reply AFTER.

**Default behavior must be: Check → Record → Reply (not Reply → Maybe record)**

Failure to follow this checklist defeats the purpose of the protocol.
<!-- /context -->

## Skills

以下 skills 可通过 slash command 触发：

- `/context-init` - Deprecated. context is now a module installed and initialized by ufoo.
- `/context-lint` - Validate context protocol and project-local context structure.
- `/bus-init` - 初始化并加入项目事件总线。
- `/ctx` - Quick context status check. Shows decisions and context health.

<!-- bus -->
## bus Protocol

This project uses bus for multi-agent communication.

### On Session Start

Join the event bus with your session ID:
```bash
SUBSCRIBER=$(bash scripts/bus.sh join)
echo "My ID: $SUBSCRIBER"
```

### Check for Messages

```bash
bash scripts/bus.sh check $SUBSCRIBER
```

### Send Messages

```bash
# To specific agent
bash scripts/bus.sh send "claude-code:other-session" "请帮我 review"

# To all agents of a type
bash scripts/bus.sh send "claude-code" "请大家 review"

# Broadcast to all
bash scripts/bus.sh broadcast "我完成了 feature-x"
```

### Status

```bash
bash scripts/bus.sh status
```

Key files:
- `.bus/bus.json` - Bus metadata and subscribers
- `.bus/events/` - Event stream (append-only)
- `.bus/queues/` - Per-agent message queues
<!-- /bus -->

<!-- ufoo-context -->
## ufoo context Protocol

This project follows the ufoo context protocol. On session start, automatically:

1. Run `ufoo ctx decisions -l` to list all decisions
2. Run `ufoo ctx decisions -n 1` to show latest decision
3. Report status briefly

Key files:
- `.ufoo/context/SYSTEM.md` - System overview
- `.ufoo/context/CONSTRAINTS.md` - Non-negotiable rules
- `.ufoo/context/ASSUMPTIONS.md` - Current assumptions
- `.ufoo/context/TERMINOLOGY.md` - Shared vocabulary
- `.ufoo/context/DECISIONS/` - Decision log (append-only)

Decision recording policy (Must/Ask/Skip):
- **Must record**: evaluations, architectural recommendations, naming changes, trade-offs
- **Ask first**: medium importance or uncertain
- Write decision **before replying** when "Must record" applies.

## Pre-flight Checklist (BEFORE EVERY REPLY)

**STOP. Before you reply, check:**

1. **Open decisions?** → Read, understand, execute, then resolve. NEVER resolve blindly.
2. **Is this an evaluation/analysis/recommendation?** → Write decision FIRST, reply AFTER.
3. **Is this a trade-off or architectural choice?** → Write decision FIRST, reply AFTER.

**Default behavior must be: Check → Record → Reply (not Reply → Maybe record)**

Failure to follow this checklist defeats the purpose of the protocol.
<!-- /ufoo-context -->

<!-- ufoo-bus -->
## ufoo bus Protocol

This project uses ufoo bus for multi-agent communication.

### On Session Start

Join the event bus with your session ID:
```bash
SUBSCRIBER=$(ufoo bus join)
echo "My ID: $SUBSCRIBER"
```

### Check for Messages

```bash
ufoo bus check $SUBSCRIBER
```

### Send Messages

```bash
# To specific agent
ufoo bus send "claude-code:other-session" "请帮我 review"

# To all agents of a type
ufoo bus send "claude-code" "请大家 review"

# Broadcast to all
ufoo bus broadcast "我完成了 feature-x"
```

### Status

```bash
ufoo bus status
```

Key files:
- `.ufoo/bus/bus.json` - Bus metadata and subscribers
- `.ufoo/bus/events/` - Event stream (append-only)
- `.ufoo/bus/queues/` - Per-agent message queues
<!-- /ufoo-bus -->
