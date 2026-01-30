#!/usr/bin/env bash
set -euo pipefail

# bus-alert.sh
# Background notification daemon for a single subscriber.
#
# Usage:
#   bash bus-alert.sh <subscriber> [interval] [options]
#
# Options:
#   --notify     Enable macOS Notification Center
#   --daemon     Run in background
#   --stop       Stop running alert for this subscriber
#   --no-title   Disable terminal title badge
#   --no-bell    Disable terminal bell

BUS_DIR=".ufoo/bus"
INTERVAL=2
DAEMON_MODE=0
USE_NOTIFY=0
USE_TITLE=1
USE_BELL=1
STOP_MODE=0

usage() {
  cat <<'USAGE'
bus-alert.sh - Background notification daemon for a single subscriber

Usage:
  bus-alert.sh <subscriber> [interval] [options]

Options:
  --notify     Enable macOS Notification Center
  --daemon     Run in background
  --stop       Stop running alert for this subscriber
  --no-title   Disable terminal title badge
  --no-bell    Disable terminal bell
  -h, --help   Show this help
USAGE
}

# Handle --help first
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

SUBSCRIBER="${1:-}"
shift || true

if [[ -z "$SUBSCRIBER" ]]; then
  usage >&2
  exit 1
fi

# Parse interval if numeric
if [[ "${1:-}" =~ ^[0-9]+$ ]]; then
  INTERVAL="$1"
  shift || true
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --notify)
      USE_NOTIFY=1
      shift
      ;;
    --daemon)
      DAEMON_MODE=1
      shift
      ;;
    --stop)
      STOP_MODE=1
      shift
      ;;
    --no-title)
      USE_TITLE=0
      shift
      ;;
    --no-bell)
      USE_BELL=0
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Sanitize subscriber for filename: claude-code:abc123 -> claude-code_abc123
SAFE_SUB="${SUBSCRIBER//:/_}"
PID_FILE="$BUS_DIR/pids/alert-${SAFE_SUB}.pid"
QUEUE_FILE="$BUS_DIR/queues/${SAFE_SUB}/pending.jsonl"

mkdir -p "$BUS_DIR/pids"

# Stop mode
if [[ "$STOP_MODE" == "1" ]]; then
  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null && echo "[alert] Stopped $SUBSCRIBER (pid=$pid)" || echo "[alert] Not running"
    fi
    rm -f "$PID_FILE"
  else
    echo "[alert] Not running for $SUBSCRIBER"
  fi
  exit 0
fi

# Daemon mode - fork to background
if [[ "$DAEMON_MODE" == "1" ]]; then
  # Check if already running
  if [[ -f "$PID_FILE" ]]; then
    existing="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$existing" ]] && kill -0 "$existing" 2>/dev/null; then
      echo "[alert] Already running for $SUBSCRIBER (pid=$existing)"
      exit 0
    fi
  fi

  LOG_FILE="$BUS_DIR/logs/alert-${SAFE_SUB}.log"
  mkdir -p "$BUS_DIR/logs"

  args=("$SUBSCRIBER" "$INTERVAL")
  [[ "$USE_NOTIFY" == "1" ]] && args+=("--notify")
  [[ "$USE_TITLE" == "0" ]] && args+=("--no-title")
  [[ "$USE_BELL" == "0" ]] && args+=("--no-bell")

  nohup bash "$0" "${args[@]}" >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "[alert] Started for $SUBSCRIBER (pid=$!, log=$LOG_FILE)"
  exit 0
fi

# Record PID for foreground mode too
echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE" 2>/dev/null || true' EXIT

echo "[alert] Watching $SUBSCRIBER (interval=${INTERVAL}s)"

LAST_COUNT=0

# Get initial count
if [[ -f "$QUEUE_FILE" ]] && [[ -s "$QUEUE_FILE" ]]; then
  LAST_COUNT="$(wc -l < "$QUEUE_FILE" | tr -d ' ')"
fi

while true; do
  # Get current count
  if [[ -f "$QUEUE_FILE" ]] && [[ -s "$QUEUE_FILE" ]]; then
    count="$(wc -l < "$QUEUE_FILE" | tr -d ' ')"
  else
    count=0
  fi

  # New messages arrived
  if [[ "$count" -gt "$LAST_COUNT" ]]; then
    new_count=$((count - LAST_COUNT))
    echo "[alert] $(date '+%H:%M:%S') +${new_count} new message(s)"

    # Terminal bell
    if [[ "$USE_BELL" == "1" ]]; then
      printf '\a'
    fi

    # Terminal title badge
    if [[ "$USE_TITLE" == "1" ]]; then
      printf '\033]0;[%d] %s\007' "$count" "$SUBSCRIBER"
    fi

    # macOS notification
    if [[ "$USE_NOTIFY" == "1" ]]; then
      osascript -e "display notification \"${new_count} new message(s)\" with title \"ufoo bus\" subtitle \"$SUBSCRIBER\"" 2>/dev/null || true
    fi
  fi

  # Update title even if no new messages (show current count)
  if [[ "$USE_TITLE" == "1" ]] && [[ "$count" -gt 0 ]]; then
    printf '\033]0;[%d] %s\007' "$count" "$SUBSCRIBER"
  fi

  LAST_COUNT="$count"
  sleep "$INTERVAL"
done
