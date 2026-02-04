const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { randomBytes } = require("crypto");
const { runCliAgent } = require("./cliRunner");
const { normalizeCliOutput } = require("./normalizeOutput");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateSessionId() {
  return randomBytes(4).toString("hex");
}

function buildEnv(agentType, sessionId, publisher, nickname) {
  const env = { ...process.env };
  if (agentType === "codex") {
    env.CODEX_SESSION_ID = sessionId;
    env.CLAUDE_SESSION_ID = "";
  } else {
    env.CLAUDE_SESSION_ID = sessionId;
    env.CODEX_SESSION_ID = "";
  }
  env.AI_BUS_PUBLISHER = publisher || env.AI_BUS_PUBLISHER || "";
  env.UFOO_NICKNAME = nickname || env.UFOO_NICKNAME || "";
  env.UFOO_PARENT_PID = String(process.pid);
  return env;
}

function joinBus(projectRoot, agentType, sessionId, nickname) {
  const env = buildEnv(agentType, sessionId, "", nickname);
  const args = ["bus", "join", sessionId, agentType === "codex" ? "codex" : "claude-code"];
  if (nickname) args.push(nickname);
  const res = spawnSync("ufoo", args, {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").toString("utf8").trim();
    throw new Error(err || "bus join failed");
  }
  const out = (res.stdout || "").toString("utf8").trim().split(/\r?\n/);
  const subscriber = out[out.length - 1];
  return { subscriber, env };
}

function safeSubscriber(subscriber) {
  return subscriber.replace(/:/g, "_");
}

function readQueue(queueFile) {
  if (!fs.existsSync(queueFile)) return [];
  try {
    const content = fs.readFileSync(queueFile, "utf8");
    if (!content.trim()) return [];
    return content.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function truncateQueue(queueFile) {
  try {
    fs.truncateSync(queueFile, 0);
  } catch {
    // ignore
  }
}

async function handleEvent(projectRoot, agentType, provider, model, subscriber, sessionId, nickname, evt, cliSessionState) {
  if (!evt || !evt.data || !evt.data.message) return;
  const prompt = evt.data.message;
  const publisher = evt.publisher || "unknown";

  let res = await runCliAgent({
    provider,
    model,
    prompt,
    sessionId: cliSessionState.cliSessionId,
    cwd: projectRoot,
  });

  // Handle session errors with immediate retry (only for claude)
  if (!res.ok && provider === "claude-cli") {
    const errMsg = (res.error || "").toLowerCase();
    if (errMsg.includes("session") || errMsg.includes("already in use")) {
      // Clear session and retry immediately with new session
      cliSessionState.cliSessionId = null;
      cliSessionState.needsSave = true;

      res = await runCliAgent({
        provider,
        model,
        prompt,
        sessionId: null, // Let runCliAgent generate new session
        cwd: projectRoot,
      });
    }
  }

  // Update CLI session ID for continuity (only for claude)
  if (res.ok && res.sessionId && provider === "claude-cli") {
    cliSessionState.cliSessionId = res.sessionId;
    cliSessionState.needsSave = true;
  }

  let reply = "";
  if (res.ok) {
    reply = normalizeCliOutput(res.output) || "";
  } else {
    reply = `[internal:${agentType}] error: ${res.error || "unknown error"}`;
  }

  if (!reply) return;

  spawnSync("ufoo", ["bus", "send", publisher, reply], {
    cwd: projectRoot,
    env: buildEnv(agentType, sessionId, subscriber, nickname),
    stdio: "ignore",
  });
}

async function runInternalRunner({ projectRoot, agentType = "codex" }) {
  // 优先使用环境变量中预生成的 sessionId（daemon 父子进程监控模式）
  const envSessionId = agentType === "codex"
    ? process.env.CODEX_SESSION_ID
    : process.env.CLAUDE_SESSION_ID;
  const sessionId = envSessionId || generateSessionId();

  const nickname = process.env.UFOO_NICKNAME || "";
  const { subscriber } = joinBus(projectRoot, agentType, sessionId, nickname);
  if (!subscriber) {
    throw new Error("Failed to join bus for internal runner");
  }

  const queueDir = path.join(projectRoot, ".ufoo", "bus", "queues", safeSubscriber(subscriber));
  const queueFile = path.join(queueDir, "pending.jsonl");
  const provider = agentType === "codex" ? "codex-cli" : "claude-cli";
  const model = process.env.UFOO_AGENT_MODEL || "";

  // Session state management for CLI continuity
  // Use stable path based on nickname (if exists) or agent type, NOT subscriber ID
  const stableKey = nickname || `${agentType}-default`;
  const sessionDir = path.join(projectRoot, ".ufoo", "agent", "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });
  const stateFile = path.join(sessionDir, `${stableKey}.json`);

  let cliSessionId = null;
  // Only load session for claude (codex doesn't support sessions)
  if (provider === "claude-cli") {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
      cliSessionId = state.cliSessionId;
    } catch {
      // No previous session
    }
  }

  let running = true;
  let processing = false;

  const stop = () => {
    running = false;
  };

  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  const cliSessionState = { cliSessionId, needsSave: false };

  while (running) {
    if (!processing) {
      processing = true;
      try {
        const lines = readQueue(queueFile);
        if (lines.length > 0) {
          const events = [];
          for (const line of lines) {
            try {
              events.push(JSON.parse(line));
            } catch {
              // ignore malformed line
            }
          }
          truncateQueue(queueFile);

          for (const evt of events) {
            // eslint-disable-next-line no-await-in-loop
            await handleEvent(projectRoot, agentType, provider, model, subscriber, sessionId, nickname, evt, cliSessionState);
          }

          // Persist CLI session state after processing (only if changed and for claude)
          if (cliSessionState.needsSave && provider === "claude-cli") {
            try {
              fs.writeFileSync(stateFile, JSON.stringify({
                cliSessionId: cliSessionState.cliSessionId,
                nickname: nickname || "",
                updated_at: new Date().toISOString(),
              }));
              cliSessionState.needsSave = false;
            } catch {
              // ignore save errors
            }
          }
        }
      } finally {
        processing = false;
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(1000);
  }
}

module.exports = { runInternalRunner };
