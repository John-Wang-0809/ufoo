# Ready Detection Architecture

## Overview

Smart agent initialization detection ensures probe injection happens after agents are ready, preventing premature command execution.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        uclaude/ucodex                         │
│                    (Agent Wrapper Start)                      │
└────────────────────────┬──────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     AgentLauncher                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. Register agent with daemon                       │   │
│  │  2. Create PtyWrapper                                │   │
│  │  3. Create ReadyDetector                             │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────┬────────────────────────────┬─────────────────┘
                 │                            │
                 ▼                            ▼
    ┌────────────────────────┐   ┌──────────────────────────┐
    │     PtyWrapper          │   │    ReadyDetector         │
    │ ┌────────────────────┐ │   │ ┌──────────────────────┐ │
    │ │ spawn(claude/codex)│ │   │ │ Monitor PTY output   │ │
    │ │ Capture stdout     │───────▶│ Detect prompt "❯"   │ │
    │ │ Forward to terminal│ │   │ │ Buffer management    │ │
    │ └────────────────────┘ │   │ └──────────┬───────────┘ │
    └────────────────────────┘   └─────────────┼─────────────┘
                                                │
                                                ▼ Ready detected!
                                   ┌────────────────────────────┐
                                   │  Notify Daemon             │
                                   │  {"type":"agent_ready",    │
                                   │   "subscriberId":"..."}    │
                                   └────────────┬───────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────┐
│                          Daemon                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. Receive agent_ready message                      │   │
│  │  2. Find probe handle for subscriber                 │   │
│  │  3. Trigger probe immediately (skip 8s delay)        │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
                 ┌───────────────────────┐
                 │  Inject Probe Command │
                 │  /ufoo session probe  │
                 └───────────┬───────────┘
                             │
                             ▼
                 ┌───────────────────────┐
                 │   Agent responds      │
                 │   Session ID captured │
                 └───────────────────────┘
```

## Sequence Diagram

```
Agent Startup          Launcher          PtyWrapper    ReadyDetector    Daemon
     │                     │                  │              │             │
     │ uclaude            │                  │              │             │
     ├────────────────────▶│                  │              │             │
     │                     │                  │              │             │
     │                     │ register_agent   │              │             │
     │                     ├──────────────────┼──────────────┼────────────▶│
     │                     │                  │              │             │
     │                     │ schedule probe   │              │             │
     │                     │ (8s delay)       │              │    ┌────────┤
     │                     │                  │              │    │ 8s timer│
     │                     │                  │              │    └────────┤
     │                     │                  │              │             │
     │                     │ spawn()          │              │             │
     │                     ├─────────────────▶│              │             │
     │                     │                  │              │             │
     │                     │ enableMonitoring │              │             │
     │                     ├──────────────────┼─────────────▶│             │
     │                     │                  │              │             │
     │  Banner output      │                  │              │             │
     ├─────────────────────┼─────────────────▶│              │             │
     │  ████ UFOO          │                  │ onData()     │             │
     │                     │                  ├─────────────▶│             │
     │                     │                  │              │ processOutput()
     │                     │                  │              ├───┐         │
     │                     │                  │              │   │ buffer  │
     │                     │                  │              │◀──┘         │
     │                     │                  │              │             │
     │  ────────────       │                  │              │             │
     ├─────────────────────┼─────────────────▶│              │             │
     │  ❯ Try "help"       │                  │ onData()     │             │
     │                     │                  ├─────────────▶│             │
     │                     │                  │              │ detect "❯"! │
     │                     │                  │              ├───┐         │
     │                     │                  │              │   │ ready=true
     │                     │                  │              │◀──┘         │
     │                     │                  │              │             │
     │                     │         onReady callback        │             │
     │                     │◀───────────────────────────────┤             │
     │                     │                  │              │             │
     │                     │ agent_ready msg  │              │             │
     │                     ├──────────────────┼──────────────┼────────────▶│
     │                     │                  │              │  triggerNow()
     │                     │                  │              │  ┌──────────┤
     │                     │                  │              │  │ cancel 8s│
     │                     │                  │              │  │ timer    │
     │                     │                  │              │  └──────────┤
     │                     │                  │              │             │
     │  /ufoo session probe│                  │              │  inject probe
     │◀────────────────────┼──────────────────┼──────────────┼─────────────┤
     │                     │                  │              │             │
     │  ufoo:session-probe-ok                 │              │             │
     ├─────────────────────┼──────────────────┼──────────────┼────────────▶│
     │                     │                  │              │             │
     │                     │                  │              │ extractSessionId
     │                     │                  │              │ persistSession
     │                     │                  │              │             │
```

## Timing Analysis

### Before Ready Detection (Old Behavior)
```
t=0s    Agent starts
t=2s    ⚠️ Probe injected (TOO EARLY!)
t=3s    Agent still showing banner
t=4s    Agent shows prompt
t=5s    ❌ Probe command was lost/ignored
```

### With Ready Detection (New Behavior)
```
t=0s    Agent starts
t=0s    ReadyDetector monitoring begins
t=2s    Detect banner output...
t=3s    Detect separator line...
t=4s    ✅ Detect prompt "❯" → Ready!
t=4.1s  Notify daemon
t=4.2s  ✅ Probe injected (JUST IN TIME!)
t=4.3s  Agent responds with session ID
```

## Fallback Mechanisms

The system has multiple layers of protection:

```
Layer 1: Smart Detection (Primary)
  └─▶ Detect prompt "❯" in PTY output
      └─▶ Typical: 2-5 seconds
          └─▶ SUCCESS → inject immediately

Layer 2: Force Ready (10s timeout)
  └─▶ If no prompt detected after 10s
      └─▶ forceReady() triggered
          └─▶ SUCCESS → inject immediately

Layer 3: Scheduled Delay (8s fallback)
  └─▶ If daemon notification fails
      └─▶ Fallback timer still running
          └─▶ SUCCESS → inject at 8s

Layer 4: Retry Loop (15 attempts)
  └─▶ If probe fails to capture session
      └─▶ Retry every 2s, 15 times
          └─▶ Total: 30s retry window
```

## Performance Metrics

Collected via `readyDetector.getMetrics()`:

```javascript
{
  agentType: "claude-code",
  ready: true,
  createdAt: 1675678900000,
  readyAt: 1675678904500,
  detectionTimeMs: 4500,      // Time to detect ready
  bufferSize: 1234            // Current buffer usage
}
```

Enable debug logging:
```bash
UFOO_DEBUG=1 uclaude
```

Output:
```
[ReadyDetector] prompt detected in buffer (1234 bytes)
[ReadyDetector] claude-code ready detected in 4500ms
[ready] notified daemon in 23ms
```

## Error Handling

### Daemon Communication Failure
```javascript
// launcher.js - 3 retry attempts with 100ms delay
const daemonSock = await connectWithRetry(sockPath, 3, 100);
if (!daemonSock) {
  // Fallback: 8s timer still active
  if (process.env.UFOO_DEBUG) {
    console.error('[ready] failed to connect, will use fallback');
  }
}
```

### Buffer Overflow Protection
```javascript
// readyDetector.js - Automatic trimming
if (this.buffer.length > this.maxBufferSize) {
  const trimmed = this.maxBufferSize * 0.5; // Keep 50%
  this.buffer = this.buffer.slice(-trimmed);

  if (process.env.UFOO_DEBUG) {
    console.error(`[ReadyDetector] buffer trimmed to ${trimmed} bytes`);
  }
}
```

## Configuration

### Environment Variables

- `UFOO_DEBUG=1` - Enable debug logging
- `UFOO_DISABLE_PTY=1` - Disable PTY wrapper (use direct spawn)
- `UFOO_FORCE_PTY=1` - Force PTY even in non-TTY environments

### Timing Parameters

Can be adjusted in `src/daemon/providerSessions.js`:

```javascript
scheduleProviderSessionProbe({
  delayMs: 8000,      // Fallback delay
  attempts: 15,       // Retry attempts
  intervalMs: 2000,   // Retry interval
})
```

## Testing

### Unit Tests
```bash
npm test -- test/unit/agent/readyDetector.test.js
# 18 tests covering all detection scenarios
```

### Integration Tests
```bash
npm test -- test/integration/ready-detection.test.js
# 13 tests covering launcher integration
```

### E2E Tests
```bash
bash test/integration/ready-detection-e2e.sh
# 8 shell script tests with real daemon
```

## Troubleshooting

### Probe Not Injected

1. **Check PTY is enabled**
   ```bash
   ps aux | grep claude
   # Should show pty spawn helper
   ```

2. **Check daemon is running**
   ```bash
   ufoo daemon status
   # Should show "running"
   ```

3. **Enable debug logging**
   ```bash
   UFOO_DEBUG=1 uclaude
   # Look for "[ReadyDetector]" and "[ready]" logs
   ```

### Slow Detection (>10s)

- Check terminal output speed
- Verify prompt format matches detection pattern
- Enable debug to see what's in buffer

### Session ID Not Captured

- Check history.jsonl file exists
- Verify probe token appears in history
- Check daemon logs for extraction errors

## Future Improvements

- [ ] Adaptive detection patterns (ML-based)
- [ ] Terminal-specific optimizations (iTerm2, VSCode, etc.)
- [ ] Real-time performance dashboard
- [ ] Auto-tuning based on historical data
