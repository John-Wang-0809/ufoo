#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
context_mod="$repo_root/modules/context"
bus_mod="$repo_root/modules/bus"
resources_mod="$repo_root/modules/resources"

usage() {
  cat <<'USAGE'
ufoo init

Usage:
  ufoo init [--modules context[,bus,resources]] [--project <dir>]

Available modules:
  context   - 共享上下文协议 (.ufoo/context/)
  bus       - Agent 事件总线 (.ufoo/bus/)
  resources - UI/Icons 资源

Defaults:
  --modules context
  --project  <current directory>

Examples:
  ufoo init                           # 只初始化 context
  ufoo init --modules context,bus     # 初始化 context + bus
  ufoo init --modules context,bus,resources  # 全部
USAGE
}

modules="context"
project="$(pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --modules)
      modules="$2"
      shift 2
      ;;
    --project)
      project="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Parse modules list
IFS=',' read -ra MODULE_LIST <<< "$modules"

echo "=== ufoo init ==="
echo "项目目录: $project"
echo "模块: ${MODULE_LIST[*]}"
echo ""

# Ensure rg exists for inject; fallback to grep
if ! command -v rg >/dev/null 2>&1; then
  rg() { grep "$@"; }
fi

agents_file="$project/AGENTS.md"
claude_file="$project/CLAUDE.md"

# Ensure AGENTS.md exists
if [[ ! -f "$agents_file" ]]; then
  printf '# Project Instructions\n\n' >"$agents_file"
fi

# CLAUDE.md points to AGENTS.md
printf 'AGENTS.md\n' >"$claude_file"

# ============================================================================
# Module: context
# ============================================================================

init_context() {
  echo "[context] 初始化 .ufoo/context..."

  if [[ ! -d "$context_mod" ]]; then
    echo "FAIL: missing context module at $context_mod" >&2
    exit 1
  fi

  ufoo_context="$project/.ufoo/context"
  mkdir -p "$ufoo_context/DECISIONS"

  # Templates (create if missing)
  cp -n "$context_mod/TEMPLATES/project-context-readme.md" "$ufoo_context/README.md" 2>/dev/null || true
  cp -n "$context_mod/TEMPLATES/system.md" "$ufoo_context/SYSTEM.md" 2>/dev/null || true
  cp -n "$context_mod/TEMPLATES/constraints.md" "$ufoo_context/CONSTRAINTS.md" 2>/dev/null || true
  cp -n "$context_mod/TEMPLATES/assumptions.md" "$ufoo_context/ASSUMPTIONS.md" 2>/dev/null || true
  cp -n "$context_mod/TEMPLATES/terminology.md" "$ufoo_context/TERMINOLOGY.md" 2>/dev/null || true

  # Inject block into AGENTS.md
  if ! rg -q "<!-- ufoo-context -->" "$agents_file" 2>/dev/null; then
    cat >>"$agents_file" <<'BLOCK'

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
BLOCK
  fi

  echo "[context] ✓ 完成: $ufoo_context"
}

# ============================================================================
# Module: bus
# ============================================================================

init_bus() {
  echo "[bus] 初始化 .ufoo/bus..."

  if [[ ! -d "$bus_mod" ]]; then
    echo "FAIL: missing bus module at $bus_mod" >&2
    exit 1
  fi

  ufoo_bus="$project/.ufoo/bus"
  mkdir -p "$ufoo_bus"/{events,offsets,queues}

  # Create bus.json if not exists
  if [[ ! -f "$ufoo_bus/bus.json" ]]; then
    local project_name
    project_name=$(basename "$project")
    cat > "$ufoo_bus/bus.json" << EOF
{
  "bus_id": "${project_name}-bus",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")",
  "subscribers": {},
  "agent_types": {},
  "config": {
    "poll_interval_ms": 3000,
    "heartbeat_timeout_ms": 30000
  }
}
EOF
  fi

  # Inject block into AGENTS.md
  if ! rg -q "<!-- ufoo-bus -->" "$agents_file" 2>/dev/null; then
    cat >>"$agents_file" <<'BLOCK'

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
BLOCK
  fi

  echo "[bus] ✓ 完成: $ufoo_bus"
}

# ============================================================================
# Module: resources
# ============================================================================

init_resources() {
  echo "[resources] 初始化 resources..."

  if [[ ! -d "$resources_mod" ]]; then
    echo "FAIL: missing resources module at $resources_mod" >&2
    exit 1
  fi

  echo "[resources] ✓ 完成 (资源模块无需初始化，直接引用 $resources_mod)"
}

# ============================================================================
# Execute selected modules
# ============================================================================

for mod in "${MODULE_LIST[@]}"; do
  case "$mod" in
    context)   init_context ;;
    bus)       init_bus ;;
    resources) init_resources ;;
    *)
      echo "Unknown module: $mod" >&2
      exit 1
      ;;
  esac
done

echo ""
echo "=== 初始化完成 ==="
