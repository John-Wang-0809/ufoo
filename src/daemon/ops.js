const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("../config");
const { getUfooPaths } = require("../ufoo/paths");
const { loadAgentsData, saveAgentsData } = require("../ufoo/agentsStore");
const { isAgentPidAlive } = require("../bus/utils");
const { isITerm2 } = require("../terminal/detect");

function resolveAgentId(projectRoot, agentId) {
  if (!agentId) return agentId;
  if (agentId.includes(":")) return agentId;
  const busPath = getUfooPaths(projectRoot).agentsFile;
  try {
    const bus = JSON.parse(fs.readFileSync(busPath, "utf8"));
    const entries = Object.entries(bus.agents || {});
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

function shellEscape(value) {
  const str = String(value);
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

function escapeAppleScriptString(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * 在 Terminal.app 中打开新窗口运行 agent
 * 使用简单的 AppleScript，只负责打开窗口执行命令
 * agent 进程的监控由 uclaude/ucodex 内部的 PTY wrapper 处理
 */
async function spawnTerminalAgent(projectRoot, agent, nickname = "") {
  if (process.platform !== "darwin") {
    throw new Error("Terminal mode is only supported on macOS");
  }

  const binary = agent === "codex" ? "ucodex" : "uclaude";
  const nickEnv = nickname ? `UFOO_NICKNAME=${shellEscape(nickname)} ` : "";
  const modeEnv = "UFOO_LAUNCH_MODE=terminal ";
  const runCmd = `cd ${shellEscape(projectRoot)} && ${modeEnv}${nickEnv}${binary}`;

  const script = [
    'tell application "Terminal"',
    `do script "${escapeAppleScriptString(runCmd)}"`,
    "activate",
    "end tell",
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn("osascript", script.flatMap((l) => ["-e", l]));
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || "Failed to open Terminal.app"));
    });
  });
}

/**
 * 在 iTerm2 中打开新 tab 运行 agent
 * 使用 AppleScript 控制 iTerm2，比 Terminal.app 更丰富的功能
 */
async function spawnITerm2Agent(projectRoot, agent, nickname = "") {
  if (process.platform !== "darwin") {
    throw new Error("iTerm2 mode is only supported on macOS");
  }

  const binary = agent === "codex" ? "ucodex" : "uclaude";
  const nickEnv = nickname ? `UFOO_NICKNAME=${shellEscape(nickname)} ` : "";
  const modeEnv = "UFOO_LAUNCH_MODE=terminal ";
  const runCmd = `cd ${shellEscape(projectRoot)} && ${modeEnv}${nickEnv}${binary}`;

  const script = [
    'tell application "iTerm2"',
    "  tell current window",
    `    create tab with default profile command "${escapeAppleScriptString(runCmd)}"`,
    "  end tell",
    "  activate",
    "end tell",
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn("osascript", script.flatMap((l) => ["-e", l]));
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || "Failed to open iTerm2 tab"));
    });
  });
}

async function spawnInternalAgent(projectRoot, agent, count = 1, nickname = "", processManager = null) {
  const runner = path.join(projectRoot, "bin", "ufoo.js");
  const logDir = getUfooPaths(projectRoot).runDir;
  fs.mkdirSync(logDir, { recursive: true });

  const crypto = require("crypto");
  const EventBus = require("../bus");
  const children = [];
  const subscriberIds = [];

  // 初始化 bus
  const bus = new EventBus(projectRoot);
  await bus.init();

  const originalPid = process.pid;

  for (let i = 0; i < count; i += 1) {
    const logFile = path.join(logDir, `agent-${agent}-${Date.now()}-${i}.log`);
    const errLog = fs.openSync(logFile, "a");

    // 预生成 session ID
    const sessionId = crypto.randomBytes(4).toString("hex");
    const agentType = agent === "codex" ? "codex" : "claude-code";
    const subscriberId = `${agentType}:${sessionId}`;
    subscriberIds.push(subscriberId);

    // Daemon 预先在 bus 中注册
    bus.loadBusData();
    process.env.UFOO_PARENT_PID = String(originalPid);

    const finalNickname = count > 1 ? `${nickname || agent}-${i + 1}` : (nickname || "");
    const usePty = process.env.UFOO_INTERNAL_PTY !== "0";
    const launchMode = usePty ? "internal-pty" : "internal";

    // 传递 launch_mode 和 parent PID 到 join
    await bus.subscriberManager.join(sessionId, agentType, finalNickname, {
      launchMode,
      parentPid: originalPid,
    });
    bus.saveBusData();

    const runnerCmd = usePty ? "agent-pty-runner" : "agent-runner";
    const child = spawn(process.execPath, [runner, runnerCmd, agent], {
      // 关键改动：不使用 detached，daemon 作为父进程
      detached: false,
      stdio: ["ignore", errLog, errLog],
      cwd: projectRoot,
      env: {
        ...process.env,
        UFOO_INTERNAL_AGENT: "1",
        UFOO_INTERNAL_PTY: usePty ? "1" : "0",
        UFOO_SUBSCRIBER_ID: subscriberId,  // 直接传递 subscriber ID
        UFOO_NICKNAME: finalNickname,
        UFOO_LAUNCH_MODE: usePty ? "internal-pty" : "internal",
        UFOO_PARENT_PID: String(originalPid),
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

/**
 * Find the first idle tmux pane in the SAME window as ufoo chat.
 * Looks for panes running a plain shell, excluding the chat pane itself.
 * Returns the pane target (e.g. "%5") or null.
 */
function findIdleTmuxPane() {
  const myPaneId = process.env.TMUX_PANE || "";
  if (!myPaneId) return null;

  // List panes in the same window as ufoo chat
  const result = spawnSync("tmux", [
    "list-panes", "-t", myPaneId,
    "-F", "#{pane_id}\t#{pane_current_command}",
  ], { stdio: "pipe", encoding: "utf8" });

  if (result.status !== 0 || !result.stdout) return null;

  const shells = new Set(["bash", "zsh", "fish", "sh", "dash", "ksh", "login"]);

  for (const line of result.stdout.trim().split("\n")) {
    const [paneId, cmd] = line.split("\t");
    if (!paneId || !cmd) continue;
    // Skip ufoo chat's own pane
    if (paneId === myPaneId) continue;
    // Only use panes running a plain shell
    if (shells.has(path.basename(cmd))) {
      return paneId;
    }
  }
  return null;
}

function spawnTmuxWindow(projectRoot, agent, nickname = "", extraArgs = [], extraEnv = "") {
  return new Promise((resolve, reject) => {
    const binary = agent === "codex" ? "ucodex" : "uclaude";
    const nickEnv = nickname ? `UFOO_NICKNAME=${shellEscape(nickname)} ` : "";
    const modeEnv = "UFOO_LAUNCH_MODE=tmux ";
    const ttyEnv = "UFOO_TTY_OVERRIDE=$(tty) ";
    const args = Array.isArray(extraArgs) ? extraArgs : [];
    const envPrefix = extraEnv ? `${String(extraEnv).trim()} ` : "";
    const argText = args.length > 0 ? ` ${args.map(shellEscape).join(" ")}` : "";

    // tmux natively sets $TMUX_PANE for each pane — no need to override
    const runCmd = `cd ${shellEscape(projectRoot)} && ${modeEnv}${nickEnv}${ttyEnv}${envPrefix}${binary}${argText}`;
    const windowName = nickname || `${agent}-${Date.now()}`;
    const targetSession = process.env.UFOO_TMUX_SESSION || "";

    // Find an idle pane in the same window, or split a new one
    const idlePane = findIdleTmuxPane();
    const myPane = process.env.TMUX_PANE || "";

    if (idlePane) {
      // Reuse idle pane: send the launch command there
      const proc = spawn("tmux", ["send-keys", "-t", idlePane, runCmd, "Enter"]);
      let stderr = "";
      proc.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || "tmux send-keys failed"));
      });
    } else {
      // No idle pane — split current window to create a new pane
      const splitTarget = myPane || (targetSession ? `${targetSession}:` : "");
      const splitArgs = ["split-window", "-d", "-h"];
      if (splitTarget) splitArgs.push("-t", splitTarget);
      splitArgs.push(runCmd);

      const proc = spawn("tmux", splitArgs);
      let stderr = "";
      proc.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || "tmux split-window failed"));
      });
    }
  });
}

/**
 * Detect the effective launch mode based on the current environment.
 */
function detectLaunchMode() {
  // Inside tmux → use tmux mode
  if (process.env.TMUX) return "tmux";
  // macOS with Terminal.app / iTerm → use terminal mode
  if (process.platform === "darwin") return "terminal";
  // Fallback
  return "internal";
}

async function launchAgent(projectRoot, agent, count = 1, nickname = "", processManager = null) {
  const config = loadConfig(projectRoot);
  let mode = config.launchMode || "auto";
  if (mode === "auto") {
    mode = detectLaunchMode();
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

  // terminal mode - 使用 AppleScript 打开窗口 (iTerm2 优先)
  if (mode === "terminal") {
    const useITerm = isITerm2();
    for (let i = 0; i < count; i += 1) {
      const nick = count > 1 ? `${nickname || agent}-${i + 1}` : (nickname || "");
      // eslint-disable-next-line no-await-in-loop
      if (useITerm) {
        await spawnITerm2Agent(projectRoot, agent, nick);
      } else {
        await spawnTerminalAgent(projectRoot, agent, nick);
      }
    }
    return { mode: "terminal" };
  }

  // internal mode - 使用 PTY 方式启动
  const result = await spawnInternalAgent(projectRoot, agent, count, nickname, processManager);
  return { mode: "internal", subscriberIds: result.subscriberIds };
}

function normalizeAgentType(agentType) {
  if (agentType === "claude-code") return "claude";
  if (agentType === "codex") return "codex";
  return agentType;
}

function buildResumeArgs(agent, sessionId) {
  if (!sessionId) return [];
  if (agent === "codex") return ["resume", sessionId];
  if (agent === "claude") return ["--session-id", sessionId];
  return [];
}

function isActiveAgent(meta) {
  if (!meta || meta.status !== "active") return false;
  if (meta.pid && !isAgentPidAlive(meta.pid)) return false;
  return true;
}

async function resumeAgents(projectRoot, target = "", processManager = null) {
  const config = loadConfig(projectRoot);
  const mode = config.launchMode || "internal";
  const filePath = getUfooPaths(projectRoot).agentsFile;
  const data = loadAgentsData(filePath);
  const entries = Object.entries(data.agents || {});

  let targets = entries;
  if (target) {
    if (target.includes(":")) {
      targets = entries.filter(([id]) => id === target);
    } else {
      targets = entries.filter(([, meta]) => meta && meta.nickname === target);
    }
  }

  const resumable = [];
  const skipped = [];

  for (const [id, meta] of targets) {
    if (!meta || !meta.provider_session_id) {
      skipped.push({ id, reason: "no provider session" });
      continue;
    }
    if (isActiveAgent(meta)) {
      skipped.push({ id, reason: "already active" });
      continue;
    }
    const agent = normalizeAgentType(meta.agent_type);
    if (agent !== "codex" && agent !== "claude") {
      skipped.push({ id, reason: "unsupported agent type" });
      continue;
    }
    resumable.push({ id, meta, agent });
  }

  if (resumable.length === 0) {
    return { ok: true, resumed: [], skipped };
  }

  // Clear old nicknames to allow reuse
  let updated = false;
  for (const item of resumable) {
    if (item.meta && item.meta.nickname) {
      data.agents[item.id] = { ...item.meta, nickname: "" };
      updated = true;
    }
  }
  if (updated) {
    saveAgentsData(filePath, data);
  }

  const resumed = [];

  // tmux 模式使用 tmux new-window 恢复
  if (mode === "tmux") {
    for (const item of resumable) {
      const nickname = item.meta.nickname || "";
      const sessionId = item.meta.provider_session_id;
      const args = buildResumeArgs(item.agent, sessionId);
      const envPrefix = "UFOO_SKIP_SESSION_PROBE=1";
      // eslint-disable-next-line no-await-in-loop
      await spawnTmuxWindow(projectRoot, item.agent, nickname, args, envPrefix);
      resumed.push({ id: item.id, nickname, agent: item.agent, sessionId, reused: false });
    }
    return { ok: true, resumed, skipped };
  }

  // internal 模式暂不支持 resume（需要用户手动启动）
  for (const item of resumable) {
    skipped.push({ id: item.id, reason: "internal mode requires manual restart" });
  }
  return { ok: true, resumed, skipped };
}

async function closeAgent(projectRoot, agentId) {
  const resolvedId = resolveAgentId(projectRoot, agentId);
  const busPath = getUfooPaths(projectRoot).agentsFile;
  let pid = null;
  try {
    const bus = JSON.parse(fs.readFileSync(busPath, "utf8"));
    const entry = bus.agents?.[resolvedId];
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

module.exports = { launchAgent, closeAgent, resumeAgents };
