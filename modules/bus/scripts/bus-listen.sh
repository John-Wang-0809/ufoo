#!/usr/bin/env bash
set -euo pipefail

# bus-listen.sh
# Foreground listener that prints incoming messages.
#
# Usage:
#   bash bus-listen.sh <subscriber> [options]
#
# Options:
#   --from-beginning  Print existing queued messages first
#   --reset           Truncate pending queue before listening
#   --auto-join       Auto-join bus to get subscriber ID

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
BUS_DIR=".ufoo/bus"
FROM_BEGINNING=0
RESET=0
AUTO_JOIN=0

SUBSCRIBER="${1:-}"
shift || true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from-beginning)
      FROM_BEGINNING=1
      shift
      ;;
    --reset)
      RESET=1
      shift
      ;;
    --auto-join)
      AUTO_JOIN=1
      shift
      ;;
    *)
      shift
      ;;
  esac
done

# Auto-join if requested
if [[ "$AUTO_JOIN" == "1" ]] && [[ -z "$SUBSCRIBER" ]]; then
  SUBSCRIBER="$(ufoo bus join 2>/dev/null | tail -1)"
  echo "[listen] Auto-joined as: $SUBSCRIBER"
fi

if [[ -z "$SUBSCRIBER" ]]; then
  echo "Usage: bus-listen.sh <subscriber> [options]" >&2
  echo "  or:  bus-listen.sh --auto-join" >&2
  exit 1
fi

# Sanitize subscriber for filename
SAFE_SUB="${SUBSCRIBER//:/_}"
QUEUE_FILE="$BUS_DIR/queues/${SAFE_SUB}/pending.jsonl"
QUEUE_DIR="$BUS_DIR/queues/${SAFE_SUB}"

mkdir -p "$QUEUE_DIR"
touch "$QUEUE_FILE"

# Reset queue if requested
if [[ "$RESET" == "1" ]]; then
  echo "[listen] Resetting queue..."
  : > "$QUEUE_FILE"
fi

# Print existing messages if requested
if [[ "$FROM_BEGINNING" == "1" ]] && [[ -s "$QUEUE_FILE" ]]; then
  echo "[listen] Existing messages:"
  echo "---"
  while IFS= read -r line; do
    # Parse JSON and extract message
    msg="$(echo "$line" | jq -r '.data.message // .data // .' 2>/dev/null || echo "$line")"
    from="$(echo "$line" | jq -r '.publisher // "unknown"' 2>/dev/null || echo "unknown")"
    ts="$(echo "$line" | jq -r '.ts // ""' 2>/dev/null || echo "")"
    short_ts="${ts:11:8}"  # Extract HH:MM:SS
    echo "[$short_ts] <$from> $msg"
  done < "$QUEUE_FILE"
  echo "---"
fi

echo "[listen] Listening for new messages... (Ctrl+C to stop)"

# Track last line count
LAST_LINES=0
if [[ -s "$QUEUE_FILE" ]]; then
  LAST_LINES="$(wc -l < "$QUEUE_FILE" | tr -d ' ')"
fi

while true; do
  if [[ -f "$QUEUE_FILE" ]]; then
    CURRENT_LINES="$(wc -l < "$QUEUE_FILE" | tr -d ' ')"

    if [[ "$CURRENT_LINES" -gt "$LAST_LINES" ]]; then
      # Read new lines
      tail -n "+$((LAST_LINES + 1))" "$QUEUE_FILE" | while IFS= read -r line; do
        msg="$(echo "$line" | jq -r '.data.message // .data // .' 2>/dev/null || echo "$line")"
        from="$(echo "$line" | jq -r '.publisher // "unknown"' 2>/dev/null || echo "unknown")"
        ts="$(echo "$line" | jq -r '.ts // ""' 2>/dev/null || echo "")"
        short_ts="${ts:11:8}"

        # Bell notification
        printf '\a'

        echo "[$short_ts] <$from> $msg"
      done

      LAST_LINES="$CURRENT_LINES"
    fi
  fi

  sleep 1
done
