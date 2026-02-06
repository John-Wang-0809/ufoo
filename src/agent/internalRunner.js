const fs = require("fs");
const path = require("path");
const { getUfooPaths } = require("../ufoo/paths");
const { spawnSync } = require("child_process");
const { runCliAgent } = require("./cliRunner");
const { normalizeCliOutput } = require("./normalizeOutput");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildEnv(agentType, sessionId, publisher, nickname) {
  const env = { ...process.env };
  env.AI_BUS_PUBLISHER = publisher || env.AI_BUS_PUBLISHER || "";
  env.UFOO_NICKNAME = nickname || env.UFOO_NICKNAME || "";
  env.UFOO_PARENT_PID = String(process.pid);
  return env;
}

function parseSubscriberId() {
  // Daemon 已经注册，直接使用
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

  throw new Error("Internal runner requires UFOO_SUBSCRIBER_ID set by daemon");
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

async function handleEvent(projectRoot, agentType, provider, model, subscriber, nickname, evt, cliSessionState) {
  if (!evt || !evt.data || !evt.data.message) return;
  const prompt = evt.data.message;
  const publisher = evt.publisher || "unknown";
  const sandbox = "workspace-write";

  let res = await runCliAgent({
    provider,
    model,
    prompt,
    sessionId: cliSessionState.cliSessionId,
    sandbox,
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
        sandbox,
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
    env: { ...process.env, AI_BUS_PUBLISHER: subscriber },
    stdio: "ignore",
  });
}

async function runInternalRunner({ projectRoot, agentType = "codex" }) {
  // Internal runner 必须由 daemon 启动，UFOO_SUBSCRIBER_ID 应该已经设置
  const { subscriber, agentType: parsedAgentType, sessionId } = parseSubscriberId();
  const nickname = process.env.UFOO_NICKNAME || "";

  const queueDir = path.join(getUfooPaths(projectRoot).busQueuesDir, safeSubscriber(subscriber));
  const queueFile = path.join(queueDir, "pending.jsonl");
  const provider = agentType === "codex" ? "codex-cli" : "claude-cli";
  const model = process.env.UFOO_AGENT_MODEL || "";

  // Session state management for CLI continuity
  // Use stable path based on nickname (if exists) or agent type, NOT subscriber ID
  const stableKey = nickname || `${agentType}-default`;
  const sessionDir = path.join(getUfooPaths(projectRoot).agentDir, "sessions");
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
  let lastHeartbeat = 0;
  const HEARTBEAT_INTERVAL = 30000; // 30秒心跳间隔

  const stop = () => {
    running = false;
  };

  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  const cliSessionState = { cliSessionId, needsSave: false };

  // 心跳更新函数
  const updateHeartbeat = () => {
    try {
      spawnSync("ufoo", ["bus", "check", subscriber], {
        cwd: projectRoot,
        env: { ...process.env, UFOO_SUBSCRIBER_ID: subscriber },
        stdio: "ignore",
        timeout: 5000,
      });
    } catch {
      // ignore heartbeat errors
    }
  };

  while (running) {
    // 定期心跳更新
    const now = Date.now();
    if (now - lastHeartbeat > HEARTBEAT_INTERVAL) {
      updateHeartbeat();
      lastHeartbeat = now;
    }

    if (!processing) {
      processing = true;
      try {
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
            // eslint-disable-next-line no-await-in-loop
            await handleEvent(projectRoot, parsedAgentType, provider, model, subscriber, nickname, evt, cliSessionState);
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

          // 处理消息后更新心跳
          updateHeartbeat();
          lastHeartbeat = now;
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
