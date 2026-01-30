#!/usr/bin/env bash
set -euo pipefail

# bus-inject.sh
# Inject `/ubus` command into Terminal.app tab.
#
# Usage:
#   bash scripts/bus-inject.sh <subscriber-id>
#
# Method:
# - Clipboard paste (Cmd+V) to bypass IME
# - Accessibility (System Events) for Escape + Paste + Enter
#
# Requirements:
# - macOS Accessibility permission for Terminal (first run will prompt)
# - Subscriber must have joined via `claude-bus` wrapper

BUS_DIR=".ufoo/bus"
SUBSCRIBER="${1:-}"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: bus-inject.sh <subscriber-id>"
  echo ""
  echo "Injects '/ubus' + Enter into Terminal.app tab by tty device."
  echo "The subscriber must have joined from that terminal first."
  exit 0
fi

if [[ -z "$SUBSCRIBER" ]]; then
  echo "Error: subscriber ID required" >&2
  echo "Usage: bus-inject.sh <subscriber-id>" >&2
  exit 1
fi

# Convert subscriber to safe name
safe_name="${SUBSCRIBER//:/_}"
tty_file="$BUS_DIR/queues/${safe_name}/tty"

if [[ ! -f "$tty_file" ]]; then
  echo "[inject] Error: No tty recorded for $SUBSCRIBER" >&2
  echo "[inject] Make sure to run 'ufoo bus join' from the target terminal first" >&2
  exit 1
fi

TARGET_TTY=$(cat "$tty_file")
echo "[inject] Looking for Terminal tab with tty: $TARGET_TTY"

# Detect terminal type from tty path or environment
# iTerm2 uses "write text", Terminal.app uses "do script"

# Check if iTerm2 is running and has this tty
USE_ITERM=0
if pgrep -q "iTerm2"; then
  # Check if iTerm2 has a session with this tty
  if osascript -e 'tell application "iTerm2" to get tty of current session of current window' 2>/dev/null | grep -q "$TARGET_TTY"; then
    USE_ITERM=1
  fi
fi

if [[ "$USE_ITERM" == "1" ]]; then
  echo "[inject] Using iTerm2 write text method"
  osascript <<EOF
tell application "iTerm2"
    activate
    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                try
                    if tty of s is "$TARGET_TTY" then
                        select s
                        -- Use write text which includes newline automatically
                        write text "/ubus" to s
                        return
                    end if
                end try
            end repeat
        end repeat
    end repeat
    error "No iTerm2 session found with tty: $TARGET_TTY"
end tell
EOF
else
  echo "[inject] Using Terminal.app keystroke method (for interactive apps like Codex)"
  osascript <<EOF
tell application "Terminal"
    set targetWindow to missing value
    set targetTab to missing value

    repeat with w in windows
        repeat with t in tabs of w
            try
                if tty of t is "$TARGET_TTY" then
                    set targetWindow to w
                    set targetTab to t
                    exit repeat
                end if
            end try
        end repeat
        if targetTab is not missing value then exit repeat
    end repeat

    if targetTab is missing value then
        error "No Terminal tab found with tty: $TARGET_TTY"
    end if

    -- Activate and bring to front
    activate
    set selected tab of targetWindow to targetTab
    set index of targetWindow to 1
end tell

-- Save current clipboard, set /ubus, paste, restore
set oldClipboard to the clipboard

set the clipboard to "/ubus"
delay 0.1

tell application "System Events"
    tell process "Terminal"
        -- Escape to ensure input mode
        key code 53
        delay 0.1
        -- Cmd+V to paste
        keystroke "v" using command down
        delay 0.2
        -- Enter (Return key)
        keystroke return
    end tell
end tell

delay 0.2
set the clipboard to oldClipboard
EOF
fi

echo "[inject] Done"
