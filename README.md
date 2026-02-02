# ufoo

Multi-agent AI collaboration toolkit for Claude Code and OpenAI Codex.

## Features

- **Event Bus** - Real-time inter-agent messaging (`ufoo bus`)
- **Context Sharing** - Shared decisions and project context (`ufoo ctx`)
- **Agent Wrappers** - Auto-initialization for Claude Code (`uclaude`) and Codex (`ucodex`)
- **Skills System** - Extensible agent capabilities (`ufoo skills`)

## Quick Start

```bash
# Clone and link globally
git clone <repo> ~/.ufoo
cd ~/.ufoo && npm link

# Initialize a project
cd your-project
ufoo init

# Or use agent wrappers (auto-init + bus join)
uclaude   # instead of 'claude'
ucodex    # instead of 'codex'
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   uclaude   │     │   ucodex    │     │  other...   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────┐
                    │  ufoo bus   │  Event Bus
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌───▼───┐ ┌──────▼──────┐
       │  .ufoo/bus  │ │context│ │  decisions  │
       └─────────────┘ └───────┘ └─────────────┘
```

## Commands

| Command | Description |
|---------|-------------|
| `ufoo init` | Initialize .ufoo in current project |
| `ufoo status` | Show banner, unread bus messages, open decisions |
| `ufoo daemon --start|--stop|--status` | Manage ufoo daemon |
| `ufoo chat` | Launch ufoo chat UI (also default when no args) |
| `ufoo bus join` | Join event bus (auto by uclaude/ucodex) |
| `ufoo bus send <id> <msg>` | Send message to agent |
| `ufoo bus check <id>` | Check pending messages |
| `ufoo bus status` | Show bus status |
| `ufoo ctx decisions -l` | List all decisions |
| `ufoo ctx decisions -n 1` | Show latest decision |
| `ufoo skills list` | List available skills |
| `ufoo doctor` | Check installation health |

Notes:
- Claude CLI headless agent uses `--dangerously-skip-permissions`.

## Project Structure

```
ufoo/
├── bin/
│   ├── ufoo         # Main CLI entry (bash)
│   ├── ufoo.js      # Node wrapper
│   ├── uclaude      # Claude Code wrapper
│   └── ucodex       # Codex wrapper
├── SKILLS/          # Global skills (uinit, ustatus)
├── scripts/
│   ├── bus.sh       # Event bus implementation
│   ├── bus-*.sh     # Bus utilities (inject, daemon, alert)
│   ├── context-*.sh # Context management
│   ├── init.sh      # Project initialization
│   └── skills.sh    # Skills management
├── modules/
│   ├── context/     # Decision/context protocol
│   ├── bus/         # Bus module resources
│   └── resources/   # UI/icons (optional)
├── AGENTS.md        # Project instructions (canonical)
└── CLAUDE.md        # Points to AGENTS.md
```

## Per-Project Layout

After `ufoo init`, your project gets:

```
your-project/
├── .ufoo/
│   ├── bus/
│   │   ├── events/      # Event log (append-only)
│   │   ├── queues/      # Per-agent message queues
│   │   └── offsets/     # Read position tracking
│   └── context/
│       └── DECISIONS/   # Decision records
├── scripts/             # Symlinked ufoo scripts
├── AGENTS.md            # Injected protocol blocks
└── CLAUDE.md            # → AGENTS.md
```

## Agent Communication

Agents communicate via the event bus:

```bash
# Agent A sends task to Agent B
ufoo bus send "codex:abc123" "Please analyze the project structure"

# Agent B checks and executes
ufoo bus check "codex:abc123"
# → Executes task automatically
# → Replies with result
ufoo bus send "claude-code:xyz789" "分析完成：..."
```

## Skills (for Agents)

Built-in skills triggered by slash commands:

- `/ubus` - Check and auto-execute pending messages
- `/uctx` - Quick context status check
- `/ustatus` - Unified status view (banner, unread bus, open decisions)
- `/uinit` - Manual .ufoo initialization

## Requirements

- macOS (for Terminal.app/iTerm2 injection features)
- Node.js >= 18 (optional, for npm global install)
- Bash 4+

## Codex CLI Notes

`ufoo chat` automatically starts the daemon if not running - no need to run `ufoo daemon start` separately.

If Codex CLI fails with permission errors under `~/.codex` (e.g. sessions dir), set `CODEX_HOME` to a writable path:

```bash
export CODEX_HOME="$PWD/.ufoo/codex"
ufoo chat  # daemon auto-starts
```

## Development

```bash
# Local development
./bin/ufoo --help

# Or via Node
npm link
ufoo --help
```

## License

UNLICENSED (Private)
