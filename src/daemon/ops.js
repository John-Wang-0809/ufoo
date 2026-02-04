const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("../config");

function resolveAgentId(projectRoot, agentId) {
  if (!agentId) return agentId;
  if (agentId.includes(":")) return agentId;
  const busPath = path.join(projectRoot, ".ufoo", "bus", "bus.json");
  try {
    const bus = JSON.parse(fs.readFileSync(busPath, "utf8"));
    const entries = Object.entries(bus.subscribers || {});
    const match = entries.find(([, meta]) => meta?.nickname === agentId);
    if (match) return match[0];
    const targetType = agentId === "claude" ? "claude-code" : agentId;
    const candidates = entries
      .filter(([, meta]) => meta?.agent_type === targetType && meta?.status === "active")
      .map(([id]) => id);
    if (candidates.length === 1) return candidates[0];
  } catch {
    // ignore
  }
  return agentId;
}

function runAppleScript(lines) {
  return new Promise((resolve, reject) => {
    const proc = spawn("osascript", lines.flatMap((l) => ["-e", l]));
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || "osascript failed"));
    });
  });
}

function escapeCommand(cmd) {
  return cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function shellEscape(value) {
  const str = String(value);
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

/**
 * Spawn managed terminal agent - daemon 作为父进程，输出到终端窗口
 */
async function spawnManagedTerminalAgent(projectRoot, agent, nickname = "", processManager = null) {
  const binary = agent === "codex" ? "ucodex" : "uclaude";
  const logDir = path.join(projectRoot, ".ufoo", "run");
  fs.mkdirSync(logDir, { recursive: true });

  const crypto = require("crypto");

  // 预生成 session ID
  const sessionId = crypto.randomBytes(4).toString("hex");
  const agentType = agent === "codex" ? "codex" : "claude-code";
  const subscriberId = `${agentType}:${sessionId}`;

  // 日志文件路径
  const logFile = path.join(logDir, `agent-${agent}-${sessionId}.log`);

  // daemon spawn 子进程（父子关系）
  const logFd = fs.openSync(logFile, "a");
  const child = spawn(binary, [], {
    detached: false, // daemon 作为父进程
    stdio: ["ignore", logFd, logFd],
    cwd: projectRoot,
    env: {
      ...process.env,
      UFOO_NICKNAME: nickname || "",
      UFOO_LAUNCH_MODE: "terminal",
      // 只设置对应类型的 session ID
      ...(agent === "codex"
        ? { CODEX_SESSION_ID: sessionId, CLAUDE_SESSION_ID: "" }
        : { CLAUDE_SESSION_ID: sessionId, CODEX_SESSION_ID: "" }),
    },
  });

  // 日志记录
  child.on("exit", (code, signal) => {
    try {
      fs.closeSync(logFd);
    } catch {
      // ignore
    }

    const exitMsg = signal
      ? `\n[terminal-agent] ${subscriberId} killed by signal ${signal}\n`
      : `\n[terminal-agent] ${subscriberId} exited with code ${code}\n`;
    try {
      fs.appendFileSync(logFile, exitMsg);
    } catch {
      // ignore
    }
  });

  child.on("error", (err) => {
    const errMsg = `\n[terminal-agent] ${subscriberId} spawn failed: ${err.message}\n`;
    try {
      fs.appendFileSync(logFile, errMsg);
      fs.closeSync(logFd);
    } catch {
      // ignore
    }
  });

  // 注册到进程管理器（父子进程监控）
  if (processManager) {
    processManager.register(subscriberId, child);
  }

  // 打开终端窗口显示日志
  if (process.platform === "darwin") {
    const displayName = nickname || `${agent}-${sessionId.slice(0, 6)}`;
    const tailCmd = `tail -f "${logFile}"`;
    const script = [
      'tell application "Terminal"',
      `do script "${escapeCommand(`cd "${projectRoot}" && echo "=== ${displayName} (${subscriberId}) ===" && ${tailCmd}`)}"`,
      "activate",
      "end tell",
    ];
    await runAppleScript(script);
  }

  return { child, subscriberId };
}

async function spawnInternalAgent(projectRoot, agent, count = 1, nickname = "", processManager = null) {
  const runner = path.join(projectRoot, "bin", "ufoo.js");
  const logDir = path.join(projectRoot, ".ufoo", "run");
  fs.mkdirSync(logDir, { recursive: true });

  const crypto = require("crypto");
  const children = [];
  const subscriberIds = [];

  for (let i = 0; i < count; i += 1) {
    const logFile = path.join(logDir, `agent-${agent}-${Date.now()}-${i}.log`);
    const errLog = fs.openSync(logFile, "a");

    // 预生成 session ID，这样父进程就知道 subscriber_id 了
    const sessionId = crypto.randomBytes(4).toString("hex");
    const agentType = agent === "codex" ? "codex" : "claude-code";
    const subscriberId = `${agentType}:${sessionId}`;
    subscriberIds.push(subscriberId);

    const child = spawn(process.execPath, [runner, "agent-runner", agent], {
      // 关键改动：不使用 detached，daemon 作为父进程
      detached: false,
      stdio: ["ignore", errLog, errLog],
      cwd: projectRoot,
      env: {
        ...process.env,
        UFOO_INTERNAL_AGENT: "1",
        UFOO_NICKNAME: nickname || "",
        UFOO_LAUNCH_MODE: "internal",
        // 传递预生成的 session ID
        CLAUDE_SESSION_ID: sessionId,
        CODEX_SESSION_ID: sessionId
      },
    });

    // 本地日志记录
    child.on("exit", (code, signal) => {
      try {
        fs.closeSync(errLog);
      } catch {
        // ignore
      }

      if (signal) {
        fs.appendFileSync(logFile, `\n[internal-agent] ${subscriberId} killed by signal ${signal}\n`);
      } else {
        fs.appendFileSync(logFile, `\n[internal-agent] ${subscriberId} exited with code ${code}\n`);
      }
    });

    child.on("error", (err) => {
      fs.appendFileSync(logFile, `\n[internal-agent] ${subscriberId} spawn failed: ${err.message}\n`);
      try {
        fs.closeSync(errLog);
      } catch {
        // ignore
      }
    });

    // 注册到进程管理器（父子进程监控）
    if (processManager) {
      processManager.register(subscriberId, child);
    }

    children.push(child);
  }

  return { children, subscriberIds };
}

function spawnTmuxWindow(projectRoot, agent, nickname = "") {
  return new Promise((resolve, reject) => {
    const binary = agent === "codex" ? "ucodex" : "uclaude";
    const nickEnv = nickname ? `UFOO_NICKNAME=${shellEscape(nickname)} ` : "";
    const modeEnv = "UFOO_LAUNCH_MODE=tmux ";

    // IMPORTANT: Set TMUX_PANE inside the new window using tmux display-message
    // This ensures the agent gets the correct pane ID for command injection
    const setPaneEnv = `export TMUX_PANE=$(tmux display-message -p '#{pane_id}'); `;
    const runCmd = `cd ${shellEscape(projectRoot)} && ${setPaneEnv}${modeEnv}${nickEnv}${binary}`;
    const windowName = nickname || `${agent}-${Date.now()}`;

    // Use detached mode (-d) to avoid stealing focus
    // Use -a flag to insert after current window, avoiding index conflicts
    // Use target session from env or current session
    const targetSession = process.env.UFOO_TMUX_SESSION || "";
    const tmuxArgs = ["new-window", "-a", "-d", "-n", windowName];
    if (targetSession) {
      tmuxArgs.push("-t", targetSession);
    }
    tmuxArgs.push(runCmd);

    const proc = spawn("tmux", tmuxArgs);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || "tmux new-window failed"));
    });
  });
}

async function launchAgent(projectRoot, agent, count = 1, nickname = "", processManager = null) {
  const config = loadConfig(projectRoot);
  const mode = config.launchMode || "terminal";

  if (mode === "internal") {
    const result = await spawnInternalAgent(projectRoot, agent, count, nickname, processManager);
    return { mode: "internal", subscriberIds: result.subscriberIds };
  }
  if (mode === "tmux") {
    // Check if tmux is available
    const tmuxCheck = spawn("tmux", ["list-sessions"], { stdio: "pipe" });
    let stdout = "";
    tmuxCheck.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    const tmuxAvailable = await new Promise((resolve) => {
      tmuxCheck.on("close", (code) => resolve(code === 0));
      tmuxCheck.on("error", () => resolve(false));
    });
    if (!tmuxAvailable) {
      throw new Error("tmux is not available or no tmux session is running");
    }
    // If UFOO_TMUX_SESSION not set, use first available session
    if (!process.env.UFOO_TMUX_SESSION && stdout) {
      const sessions = stdout.trim().split("\n");
      if (sessions.length > 0) {
        const firstSession = sessions[0].split(":")[0];
        process.env.UFOO_TMUX_SESSION = firstSession;
      }
    }
    for (let i = 0; i < count; i += 1) {
      const nick = count > 1 ? `${nickname || agent}-${i + 1}` : (nickname || "");
      // eslint-disable-next-line no-await-in-loop
      await spawnTmuxWindow(projectRoot, agent, nick);
    }
    return { mode: "tmux" };
  }
  // terminal mode - daemon 作为父进程，输出到终端窗口
  if (process.platform !== "darwin") {
    throw new Error("launchAgent with terminal mode is only supported on macOS Terminal.app");
  }

  const subscriberIds = [];
  for (let i = 0; i < count; i += 1) {
    const nick = count > 1 ? `${nickname || agent}-${i + 1}` : (nickname || "");
    // eslint-disable-next-line no-await-in-loop
    const result = await spawnManagedTerminalAgent(projectRoot, agent, nick, processManager);
    subscriberIds.push(result.subscriberId);
  }

  return { mode: "terminal", subscriberIds };
}

async function closeAgent(projectRoot, agentId) {
  if (process.platform !== "darwin") {
    return false;
  }
  const resolvedId = resolveAgentId(projectRoot, agentId);
  const busPath = path.join(projectRoot, ".ufoo", "bus", "bus.json");
  let pid = null;
  try {
    const bus = JSON.parse(fs.readFileSync(busPath, "utf8"));
    const entry = bus.subscribers?.[resolvedId];
    if (entry && entry.pid) pid = entry.pid;
  } catch {
    pid = null;
  }
  if (!pid) return false;
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

module.exports = { launchAgent, closeAgent };
