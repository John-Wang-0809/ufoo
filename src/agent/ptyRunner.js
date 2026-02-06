const fs = require("fs");
const path = require("path");
const EventBus = require("../bus");
const { runInternalRunner } = require("./internalRunner");
const { getUfooPaths } = require("../ufoo/paths");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSubscriberId() {
  if (process.env.UFOO_SUBSCRIBER_ID) {
    const parts = process.env.UFOO_SUBSCRIBER_ID.split(":");
    if (parts.length === 2) {
      return {
        subscriber: process.env.UFOO_SUBSCRIBER_ID,
        agentType: parts[0],
        sessionId: parts[1],
      };
    }
  }
  throw new Error("PTY runner requires UFOO_SUBSCRIBER_ID set by daemon");
}

function safeSubscriber(subscriber) {
  return subscriber.replace(/:/g, "_");
}

function drainQueue(queueFile) {
  if (!fs.existsSync(queueFile)) return [];
  const processingFile = `${queueFile}.processing.${process.pid}.${Date.now()}`;
  let content = "";
  let readOk = false;
  try {
    fs.renameSync(queueFile, processingFile);
    content = fs.readFileSync(processingFile, "utf8");
    readOk = true;
  } catch {
    try {
      if (fs.existsSync(processingFile)) {
        fs.renameSync(processingFile, queueFile);
      }
    } catch {
      // ignore rollback errors
    }
    return [];
  } finally {
    if (readOk) {
      try {
        if (fs.existsSync(processingFile)) {
          fs.rmSync(processingFile, { force: true });
        }
      } catch {
        // ignore cleanup errors
      }
    }
  }
  if (!content.trim()) return [];
  return content.split(/\r?\n/).filter(Boolean);
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function parseInputMessage(message) {
  if (!message) return { raw: false, text: "" };
  try {
    const parsed = JSON.parse(message);
    if (parsed && typeof parsed === "object") {
      if (parsed.raw && typeof parsed.data === "string") {
        return { raw: true, text: parsed.data };
      }
      if (typeof parsed.text === "string") {
        return { raw: false, text: parsed.text };
      }
    }
  } catch {
    // ignore json parse errors
  }
  return { raw: false, text: message };
}

function buildPrompt(text, marker) {
  if (!marker) return text;
  return `${text}\n\n请在完成后输出以下标记（单独一行）：\n${marker}\n`;
}

function resolveCommand(agentType) {
  const rawCmd = String(process.env.UFOO_PTY_CMD || "").trim();
  if (rawCmd) {
    const rawArgs = String(process.env.UFOO_PTY_ARGS || "").trim();
    const args = rawArgs ? rawArgs.split(/\s+/).filter(Boolean) : [];
    return { command: rawCmd, args };
  }
  if (agentType === "claude" || agentType === "claude-code") {
    return { command: "claude", args: [] };
  }
  return { command: "codex", args: ["--no-alt-screen", "--sandbox", "workspace-write"] };
}

async function runPtyRunner({ projectRoot, agentType = "codex" }) {
  let pty;
  try {
    // eslint-disable-next-line global-require
    pty = require("node-pty");
  } catch {
    throw new Error("node-pty not installed");
  }
  const { subscriber } = parseSubscriberId();
  const queueDir = path.join(getUfooPaths(projectRoot).busQueuesDir, safeSubscriber(subscriber));
  const queueFile = path.join(queueDir, "pending.jsonl");
  const runDir = getUfooPaths(projectRoot).runDir;
  const logFile = path.join(runDir, "pty-runner.log");

  const { command, args } = resolveCommand(agentType);
  const env = {
    ...process.env,
    UFOO_LAUNCH_MODE: "internal-pty",
    UFOO_INTERNAL_PTY: "1",
  };

  const eventBus = new EventBus(projectRoot);

  let running = true;
  let busy = false;
  let currentPublisher = "";
  let currentMarker = "";
  let pendingOutput = [];
  let outputBuffer = "";
  let flushTimer = null;
  let idleTimer = null;
  let watchdogTimer = null;
  let fallbackInProgress = false;
  let ptyProcess = null;
  const messageQueue = [];
  const maxChunk = 2000;
  const idleMs = 2000;
  const watchdogMs = 120000;
  const maxQueue = 200;
  const watchdogAction = String(process.env.UFOO_PTY_WATCHDOG_ACTION || "restart").toLowerCase();
  let sendQueue = Promise.resolve();

  function enqueueSend(target, message) {
    if (!target || !message) return;
    sendQueue = sendQueue.then(() => eventBus.send(target, message, subscriber)).catch(() => {});
  }

  function flushPending() {
    if (!currentPublisher || pendingOutput.length === 0) return;
    const chunks = pendingOutput;
    pendingOutput = [];
    for (const chunk of chunks) {
      enqueueSend(currentPublisher, chunk);
    }
  }

  function deliverChunk(chunk) {
    if (!chunk) return;
    const payload = JSON.stringify({ stream: true, delta: chunk });
    if (currentPublisher) {
      enqueueSend(currentPublisher, payload);
    } else {
      pendingOutput.push(payload);
      if (pendingOutput.length > 50) pendingOutput.shift();
    }
  }

  function flushOutput() {
    if (!outputBuffer) return;
    const chunk = outputBuffer.slice(0, maxChunk);
    outputBuffer = outputBuffer.slice(chunk.length);
    if (chunk) {
      deliverChunk(chunk);
    }
    if (outputBuffer) {
      scheduleFlush();
    }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushOutput();
    }, 120);
  }

  function logNote(note) {
    try {
      fs.mkdirSync(runDir, { recursive: true });
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${note}\n`);
    } catch {
      // ignore
    }
  }

  function attachPty(proc) {
    proc.onData((data) => {
      const clean = stripAnsi(String(data || "")).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      if (!clean) return;
      outputBuffer += clean;
      if (currentMarker) {
        const idx = outputBuffer.indexOf(currentMarker);
        if (idx !== -1) {
          const before = outputBuffer.slice(0, idx);
          outputBuffer = "";
          if (before) {
            deliverChunk(before);
          }
          currentMarker = "";
          busy = false;
          currentPublisher = "";
          if (watchdogTimer) {
            clearTimeout(watchdogTimer);
            watchdogTimer = null;
          }
          if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
          }
          processQueue();
          return;
        }
      }
      scheduleFlush();
      if (busy) {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          idleTimer = null;
          busy = false;
          currentPublisher = "";
          processQueue();
        }, idleMs);
      }
    });

    proc.onExit(({ exitCode, signal }) => {
      if (outputBuffer) {
        flushOutput();
      }
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      const note = `[internal-pty] process exited code=${exitCode} signal=${signal || ""}`.trim();
      if (currentPublisher) enqueueSend(currentPublisher, note);
      logNote(note);
      running = false;
    });
  }

  function spawnPtyProcess() {
    const proc = pty.spawn(command, args, {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: projectRoot,
      env,
    });
    attachPty(proc);
    return proc;
  }

  function restartPty(reason) {
    if (!running) return;
    logNote(`Restarting PTY: ${reason}`);
    if (outputBuffer) {
      flushOutput();
    }
    try {
      if (ptyProcess) ptyProcess.kill();
    } catch {
      // ignore
    }
    ptyProcess = spawnPtyProcess();
  }

  async function fallbackHeadless(reason) {
    if (fallbackInProgress) return;
    fallbackInProgress = true;
    logNote(`Fallback to headless: ${reason}`);
    if (outputBuffer) {
      flushOutput();
    }
    try {
      if (ptyProcess) ptyProcess.kill();
    } catch {
      // ignore
    }
    running = false;
    await runInternalRunner({ projectRoot, agentType });
    process.exit(0);
  }

  const stop = () => {
    running = false;
    try {
      if (ptyProcess) ptyProcess.kill();
    } catch {
      // ignore
    }
  };

  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  ptyProcess = spawnPtyProcess();

  function processQueue() {
    if (busy || messageQueue.length === 0 || !running) return;
    const next = messageQueue.shift();
    if (!next) return;
    busy = true;
    currentPublisher = next.publisher;
    currentMarker = next.marker || "";
    flushPending();
    if (next.text) {
      if (next.raw) {
        ptyProcess.write(next.text);
      } else {
        ptyProcess.write(`${buildPrompt(next.text, currentMarker)}\n`);
      }
    }
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      watchdogTimer = null;
      if (!busy) return;
      const timeoutNote = `[internal-pty] marker timeout; action=${watchdogAction}`;
      if (currentPublisher) enqueueSend(currentPublisher, timeoutNote);
      logNote(timeoutNote);
      if (watchdogAction === "fallback") {
        void fallbackHeadless("marker timeout");
        return;
      }
      if (watchdogAction === "restart") {
        restartPty("marker timeout");
      }
      currentMarker = "";
      busy = false;
      currentPublisher = "";
      processQueue();
    }, watchdogMs);
  }

  while (running) {
    const lines = drainQueue(queueFile);
    if (lines.length > 0) {
      const events = [];
      for (const line of lines) {
        try {
          events.push(JSON.parse(line));
        } catch {
          // ignore malformed line
        }
      }
      for (const evt of events) {
        if (!evt || !evt.data || typeof evt.data.message !== "string") continue;
        const { raw, text } = parseInputMessage(evt.data.message);
        if (messageQueue.length >= maxQueue) {
          messageQueue.shift();
        }
        const marker = raw ? "" : `__UFOO_DONE_${Date.now()}_${Math.random().toString(16).slice(2)}__`;
        messageQueue.push({ publisher: evt.publisher || "unknown", raw, text, marker });
      }
    }
    processQueue();
    // eslint-disable-next-line no-await-in-loop
    await sleep(200);
  }
}

module.exports = { runPtyRunner };
