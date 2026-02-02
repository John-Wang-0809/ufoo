const fs = require("fs");
const path = require("path");
const { runCliAgent } = require("./cliRunner");
const { normalizeCliOutput } = require("./normalizeOutput");

function loadSessionState(projectRoot) {
  const dir = path.join(projectRoot, ".ufoo", "agent");
  const file = path.join(dir, "ufoo-agent.json");
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { file, dir, data };
  } catch {
    return { file, dir, data: null };
  }
}

function saveSessionState(projectRoot, state) {
  const dir = path.join(projectRoot, ".ufoo", "agent");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "ufoo-agent.json"), JSON.stringify(state, null, 2));
}

function isPidAlive(pid) {
  if (!pid || typeof pid !== "number") return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === "EPERM");
  }
}

function loadBusSummary(projectRoot, maxLines = 20) {
  const busPath = path.join(projectRoot, ".ufoo", "bus", "bus.json");
  let subscribers = [];
  let nicknames = {};
  try {
    const bus = JSON.parse(fs.readFileSync(busPath, "utf8"));
    subscribers = Object.entries(bus.subscribers || {})
      .map(([id, meta]) => {
        const pid = typeof meta.pid === "number" ? meta.pid : Number(meta.pid || 0);
        const status = meta.status || "unknown";
        const online = status === "active" && isPidAlive(pid);
        const nickname = meta.nickname || "";
        if (nickname) {
          nicknames[nickname] = id;
        }
        return {
          id,
          status,
          online,
          agent_type: meta.agent_type || "",
          nickname,
          last_heartbeat: meta.last_heartbeat || "",
        };
      })
      .filter((item) => item.online);
  } catch {
    subscribers = [];
    nicknames = {};
  }

  const eventsDir = path.join(projectRoot, ".ufoo", "bus", "events");
  let recent = [];
  try {
    const files = fs
      .readdirSync(eventsDir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort();
    const lastFile = files[files.length - 1];
    if (lastFile) {
      const lines = fs
        .readFileSync(path.join(eventsDir, lastFile), "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean);
      recent = lines.slice(-maxLines);
    }
  } catch {
    recent = [];
  }

  return { subscribers, nicknames, recent };
}

function buildSystemPrompt(context) {
  return [
    "You are ufoo-agent, a headless routing controller.",
    "Return ONLY valid JSON. No extra text.",
    "Schema:",
    "{",
    '  "reply": "string",',
    '  "dispatch": [{"target":"broadcast|<agent-id>|<nickname>","message":"string"}],',
    '  "ops": [{"action":"spawn|close","agent":"codex|claude","count":1,"agent_id":"id","nickname":"optional"}],',
    '  "disambiguate": {"prompt":"string","candidates":[{"agent_id":"id","reason":"string"}]}',
    "}",
    "Rules:",
    "- target must be 'broadcast', concrete agent-id, or a known nickname",
    "- If multiple possible agents, use disambiguate with candidates and no dispatch.",
    "- If user specifies a nickname for a new agent, include ops.spawn with nickname so daemon can rename.",
    "- If no action needed, return reply with empty dispatch/ops.",
    "",
    "Context: online agents and recent bus events:",
    JSON.stringify(context),
  ].join("\n");
}

function loadHistory(projectRoot, maxTurns = 6) {
  const file = path.join(projectRoot, ".ufoo", "agent", "ufoo-agent.history.jsonl");
  try {
    const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean);
    const items = lines.map((l) => JSON.parse(l));
    return items.slice(-maxTurns);
  } catch {
    return [];
  }
}

function appendHistory(projectRoot, item) {
  const dir = path.join(projectRoot, ".ufoo", "agent");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "ufoo-agent.history.jsonl");
  fs.appendFileSync(file, `${JSON.stringify(item)}\n`);
}

function buildHistoryPrompt(history) {
  if (!history.length) return "";
  const lines = ["Recent conversation:"];
  for (const h of history) {
    lines.push(`User: ${h.prompt}`);
    if (h.reply) lines.push(`Agent: ${h.reply}`);
  }
  lines.push("");
  return lines.join("\n");
}

function extractNickname(prompt) {
  if (!prompt) return "";
  const patterns = [
    /(?:叫|名为|叫做|取名|昵称)\s*([A-Za-z0-9_-]{1,32})/i,
    /(?:named|name)\s+([A-Za-z0-9_-]{1,32})/i,
  ];
  for (const re of patterns) {
    const match = prompt.match(re);
    if (match && match[1]) return match[1];
  }
  const quoted = prompt.match(/[“"']([^“"'\\]{1,32})[”"']/);
  if (quoted && quoted[1]) return quoted[1];
  return "";
}

async function runUfooAgent({ projectRoot, prompt, provider, model }) {
  const state = loadSessionState(projectRoot);
  const bus = loadBusSummary(projectRoot);
  const systemPrompt = buildSystemPrompt(bus);
  const history = loadHistory(projectRoot);
  const historyPrompt = buildHistoryPrompt(history);
  const fullPrompt = historyPrompt ? `${historyPrompt}User: ${prompt}` : prompt;

  let res = await runCliAgent({
    provider,
    model,
    prompt: fullPrompt,
    systemPrompt,
    sessionId: state.data?.sessionId,
    disableSession: provider === "claude-cli",
    cwd: projectRoot,
  });

  if (!res.ok) {
    const msg = (res.error || "").toLowerCase();
    if (msg.includes("session id") || msg.includes("session-id") || msg.includes("already in use")) {
      res = await runCliAgent({
        provider,
        model,
        prompt: fullPrompt,
        systemPrompt,
        sessionId: undefined,
        disableSession: provider === "claude-cli",
        cwd: projectRoot,
      });
    }
  }

  if (!res.ok) {
    return { ok: false, error: res.error };
  }

  const text = normalizeCliOutput(res.output);
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // Best-effort fallback to plain reply if model didn't return JSON.
    // eslint-disable-next-line no-console
    console.warn("[ufoo-agent] Non-JSON output received; using raw text reply.");
    payload = { reply: text, dispatch: [], ops: [] };
  }

  const fallbackNickname = extractNickname(prompt);
  if (fallbackNickname && payload && Array.isArray(payload.ops)) {
    for (const op of payload.ops) {
      if (op && op.action === "spawn" && !op.nickname) {
        op.nickname = fallbackNickname;
        break;
      }
    }
  }

  saveSessionState(projectRoot, {
    provider,
    model,
    sessionId: res.sessionId,
    updated_at: new Date().toISOString(),
  });

  appendHistory(projectRoot, { prompt, reply: payload.reply || "" });

  return { ok: true, payload };
}

module.exports = { runUfooAgent };
