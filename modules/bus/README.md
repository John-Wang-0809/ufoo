# bus

File-system based Agent event bus for async communication between multiple AI Coding Agents.

## Overview

bus solves communication problems in multi-agent collaboration:

- Multiple Claude Code instances collaborating on the same project
- Communication between different AI tools (Claude Code, Cursor, Copilot)
- Task delegation and response
- Broadcast messages

## Installation

Initialize via ufoo:

```bash
ufoo init --modules context,bus
```

## Directory Structure

```
.bus/
├── bus.json      # Bus metadata + subscriber status
├── events/       # Event stream (JSONL, sharded by date)
├── offsets/      # Each Agent's consumption progress
└── queues/       # Targeted event queues
```

## Usage

### Join Bus

```bash
SUBSCRIBER=$(bash scripts/bus.sh join)
# Output: claude-code:a1b2c3
```

### Check Pending Messages

```bash
bash scripts/bus.sh check $SUBSCRIBER
```

### Send Messages

```bash
# Send to specific instance
bash scripts/bus.sh send "claude-code:abc123" "Please help me review"

# Send to all instances of same type
bash scripts/bus.sh send "claude-code" "Everyone please review"

# Broadcast to all
bash scripts/bus.sh broadcast "I completed feature-x"
```

### View Status

```bash
bash scripts/bus.sh status
```

## Notifications/Alerts (no key injection, recommended)

If you want to receive "new message alerts" while running Codex/Claude in another terminal, use **agent-side alert/listen** (avoids IME/accessibility permission/window positioning fragmentation issues):

```bash
SUBSCRIBER=$(bash scripts/bus.sh join | tail -n 1)

# Background alert: title badge + bell + optional macOS notification center
bash scripts/bus-alert.sh "$SUBSCRIBER" 1 --notify --daemon

# Or: foreground continuous print of new messages (suitable for a side terminal)
bash scripts/bus-listen.sh "$SUBSCRIBER" --from-beginning
```

## Unattended Auto-Execute (recommended)

If you need **Claude A to notify Claude B / Codex C and have the target auto-execute** (e.g., auto-trigger `/ubus`), use `autotrigger`:

1) First `join` in each terminal session (records `tty`, also records `TMUX_PANE` if in tmux):

```bash
SUBSCRIBER=$(bash scripts/bus.sh join | tail -n 1)
```

2) Start autotrigger in the project (runs as background daemon):

```bash
# backend=auto prefers tmux (if available), otherwise tries Terminal.app do script (pure Automation), finally Accessibility
bash scripts/bus-autotrigger.sh start --interval 1 --command "/ubus" --backend auto
```

3) After sending a message, autotrigger injects `/ubus` into the target session and presses Enter:
- tmux: `send-keys`
- Terminal.app (pure Automation): `do script` (no Accessibility needed, but requires Automation authorization; compatibility depends on whether target program accepts input)
- Terminal.app (Accessibility): System Events (needs Accessibility), injection sequence is Escape + paste + Return (avoids IME issues)

Tips:
- Terminal.app backend depends on `tty` in `bus.json`. Execute `join` in the target terminal session (ensure `tty` is not `not a tty`).
- Pure Automation backend needs one-time authorization: System Preferences → Privacy & Security → Automation (allow script to control Terminal).
- Accessibility backend needs one-time authorization: System Preferences → Privacy & Security → Accessibility (for Terminal / script host).

Stop/view status:

```bash
bash scripts/bus-autotrigger.sh status
bash scripts/bus-autotrigger.sh stop
```

## Subscriber ID Format

```
{agent_type}:{instance_id}

Examples:
  claude-code:a1b2c3
  cursor-ai:main
  copilot:session1
```

## Relationship with context

| Module | Problem Solved |
|--------|----------------|
| context | Shared context, decision recording, knowledge persistence |
| bus | Real-time communication, task delegation, message passing |

Both are independent peer modules that can be used separately or together.
