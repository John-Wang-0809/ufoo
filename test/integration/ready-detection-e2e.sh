#!/bin/bash
# End-to-end integration tests for ready detection with daemon
# Tests the complete flow: daemon start, agent registration, ready detection, probe injection

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
UFOO_BIN="$PROJECT_ROOT/bin/ufoo.js"

TEST_PROJECT="/tmp/ufoo-ready-e2e-$$"
ERRORS=0

pass() {
  echo -e "${GREEN}✓${NC} $1"
}

fail() {
  echo -e "${RED}✗${NC} $1"
  ERRORS=$((ERRORS + 1))
}

info() {
  echo -e "${YELLOW}→${NC} $1"
}

section() {
  echo
  echo "========================================"
  echo "  $1"
  echo "========================================"
}

cleanup() {
  info "Cleaning up test environment..."
  if [[ -d "$TEST_PROJECT" ]]; then
    # Stop daemon if running
    if [[ -f "$TEST_PROJECT/.ufoo/run/ufoo-daemon.pid" ]]; then
      PID=$(cat "$TEST_PROJECT/.ufoo/run/ufoo-daemon.pid" 2>/dev/null || echo "")
      if [[ -n "$PID" ]]; then
        kill "$PID" 2>/dev/null || true
        sleep 0.5
      fi
    fi
    rm -rf "$TEST_PROJECT"
  fi
}

trap cleanup EXIT

section "Ready Detection End-to-End Tests"

# Test 1: Setup
section "Test 1: Environment Setup"

info "Creating test project directory"
mkdir -p "$TEST_PROJECT"
cd "$TEST_PROJECT"

info "Initializing ufoo"
if node "$UFOO_BIN" init --modules "context,bus" >/dev/null 2>&1; then
  pass "ufoo init successful"
else
  fail "ufoo init failed"
  exit 1
fi

# Test 2: Daemon startup
section "Test 2: Daemon Startup"

info "Starting ufoo daemon"
if node "$UFOO_BIN" daemon start >/dev/null 2>&1; then
  pass "Daemon started"
else
  fail "Daemon failed to start"
fi

info "Waiting for daemon to be ready"
sleep 1

if [[ -f ".ufoo/run/ufoo-daemon.pid" && -S ".ufoo/run/ufoo.sock" ]]; then
  pass "Daemon is running (PID and socket exist)"
else
  fail "Daemon not running properly"
fi

PID=$(cat ".ufoo/run/ufoo-daemon.pid")
if ps -p "$PID" >/dev/null 2>&1; then
  pass "Daemon process is alive (PID: $PID)"
else
  fail "Daemon process not found"
fi

# Test 3: Agent registration
section "Test 3: Agent Registration"

info "Joining event bus to create test agent"
SESSION_ID="test-e2e-$(date +%s)"
SUBSCRIBER=$(node "$UFOO_BIN" bus join "$SESSION_ID" "claude-code" | tail -n 1 | awk '{print $1}')

if [[ -n "$SUBSCRIBER" && "$SUBSCRIBER" == *":"* ]]; then
  pass "Agent registered: $SUBSCRIBER"
else
  fail "Agent registration failed"
fi

# Test 4: Ready Detection Mock
section "Test 4: Ready Detection Simulation"

info "Testing ReadyDetector with node"
cat > "$TEST_PROJECT/test-ready.js" <<EOJS
const ReadyDetector = require('$PROJECT_ROOT/src/agent/readyDetector.js');

const detector = new ReadyDetector('claude-code');
let readyCalled = false;
let readyTime = null;

const startTime = Date.now();

detector.onReady(() => {
  readyCalled = true;
  readyTime = Date.now();
  console.log('READY_DETECTED');
});

// Simulate claude-code startup
detector.processOutput("Loading...\n");
detector.processOutput("  ██╗   ██╗███████╗ ██████╗  ██████╗  \n");
detector.processOutput("────────────────────────────────────\n");
detector.processOutput("❯ Try something\n");

if (readyCalled) {
  console.log('SUCCESS: Ready detected in', readyTime - startTime, 'ms');
  process.exit(0);
} else {
  console.log('FAILED: Ready not detected');
  process.exit(1);
}
EOJS

if node "$TEST_PROJECT/test-ready.js" 2>&1 | grep -q "READY_DETECTED"; then
  pass "ReadyDetector correctly detected prompt"
else
  fail "ReadyDetector failed to detect prompt"
fi

cd "$TEST_PROJECT"

# Test 5: Daemon log verification
section "Test 5: Daemon Log Verification"

info "Checking daemon log exists"
if [[ -f ".ufoo/run/ufoo-daemon.log" ]]; then
  pass "Daemon log file exists"

  LOG_SIZE=$(wc -c < ".ufoo/run/ufoo-daemon.log" | tr -d ' ')
  if [[ "$LOG_SIZE" -gt 0 ]]; then
    pass "Daemon log is not empty ($LOG_SIZE bytes)"
  else
    info "Daemon log is empty (daemon might be silent)"
  fi
else
  fail "Daemon log file not found"
fi

# Test 6: Fallback mechanism
section "Test 6: Fallback Mechanism"

info "Testing forceReady fallback"
cat > "$TEST_PROJECT/test-fallback.js" <<EOJS
const ReadyDetector = require('$PROJECT_ROOT/src/agent/readyDetector.js');

const detector = new ReadyDetector('claude-code');
let readyCalled = false;

detector.onReady(() => {
  readyCalled = true;
  console.log('FALLBACK_TRIGGERED');
});

// Don't send any ready signal, just force it
setTimeout(() => {
  detector.forceReady();
}, 100);

setTimeout(() => {
  if (readyCalled) {
    console.log('SUCCESS: Fallback works');
    process.exit(0);
  } else {
    console.log('FAILED: Fallback did not trigger');
    process.exit(1);
  }
}, 200);
EOJS

if node "$TEST_PROJECT/test-fallback.js" 2>&1 | grep -q "FALLBACK_TRIGGERED"; then
  pass "Fallback mechanism works correctly"
else
  fail "Fallback mechanism failed"
fi

cd "$TEST_PROJECT"

# Test 7: Multiple callbacks
section "Test 7: Multiple Callbacks"

info "Testing multiple onReady callbacks"
cat > "$TEST_PROJECT/test-callbacks.js" <<EOJS
const ReadyDetector = require('$PROJECT_ROOT/src/agent/readyDetector.js');

const detector = new ReadyDetector('claude-code');
let count = 0;

detector.onReady(() => { count++; console.log('CB1'); });
detector.onReady(() => { count++; console.log('CB2'); });
detector.onReady(() => { count++; console.log('CB3'); });

detector.processOutput("❯");

setTimeout(() => {
  if (count === 3) {
    console.log('SUCCESS: All callbacks executed');
    process.exit(0);
  } else {
    console.log('FAILED: Expected 3 callbacks, got', count);
    process.exit(1);
  }
}, 100);
EOJS

if node "$TEST_PROJECT/test-callbacks.js" 2>&1 | grep -q "SUCCESS"; then
  pass "Multiple callbacks executed correctly"
else
  fail "Multiple callbacks failed"
fi

cd "$TEST_PROJECT"

# Test 8: Cleanup
section "Test 8: Cleanup"

info "Leaving event bus"
if node "$UFOO_BIN" bus leave "$SUBSCRIBER" >/dev/null 2>&1; then
  pass "Agent left bus successfully"
else
  fail "Failed to leave bus"
fi

info "Stopping daemon"
if node "$UFOO_BIN" daemon stop >/dev/null 2>&1; then
  pass "Daemon stopped"
else
  info "Daemon may have already stopped"
fi

# Wait for daemon to stop
sleep 1

if ! ps -p "$PID" >/dev/null 2>&1; then
  pass "Daemon process terminated"
else
  fail "Daemon process still running"
fi

# Final results
section "Test Results"

if [[ $ERRORS -eq 0 ]]; then
  echo -e "${GREEN}✓ All E2E tests passed!${NC}"
  echo
  exit 0
else
  echo -e "${RED}✗ $ERRORS test(s) failed${NC}"
  echo
  exit 1
fi
