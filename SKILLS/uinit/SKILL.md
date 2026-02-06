---
name: uinit
description: |
  Initialize ufoo modules in current project.
  Use when: (1) new project needs context/bus enabled, (2) user inputs /uinit or /ufoo init.
  Provides interactive module selection, defaults to all selected.
---

# uinit

Initialize ufoo modules in current project.

## Trigger

User inputs `/uinit` or `/ufoo init`

## Execution Flow

### 1. Ask user to select modules

Use AskUserQuestion tool, provide multi-select, default all selected:

```
Please select modules to enable:

☑ context - Shared context protocol (.ufoo/context/)
☑ bus - Agent event bus (.ufoo/bus/ + .ufoo/agent/)
☐ resources - UI/Icons resources (optional)
```

Options:
- `context` (recommended) - Shared context, decision recording, knowledge persistence
- `bus` (recommended) - Multi-agent communication, task delegation, message passing
- `resources` (optional) - UI tone guide, icon library

Default selected: context, bus

### 2. Execute initialization

Based on user selection, execute:

```bash
ufoo init --modules <selected_modules> --project $(pwd)
```

### 3. If bus module selected, auto-join bus

```bash
SUBSCRIBER=$(ufoo bus join | tail -1)
echo "Joined event bus: $SUBSCRIBER"
```

### 4. Report initialization result

```
=== ufoo initialization complete ===

Enabled modules:
  ✓ context → .ufoo/context/
  ✓ bus → .ufoo/bus/ + .ufoo/agent/

My identity: claude-code:<session-id>

Next steps:
  - Run /ctx to check context status
  - See AGENTS.md for protocol rules
```

## Notes

- If .ufoo/context, .ufoo/bus, or .ufoo/agent already exists, skip creation
- After initialization, auto-join event bus (if bus enabled)
- AGENTS.md will have protocol description block injected
