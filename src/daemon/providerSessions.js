const fs = require("fs");
const os = require("os");
const path = require("path");
const EventBus = require("../bus");
const { loadAgentsData, saveAgentsData } = require("../ufoo/agentsStore");
const { getUfooPaths } = require("../ufoo/paths");

/**
 * Build probe marker using nickname (e.g., "claude-47")
 * Simpler than the old token format, easier to search
 */
function buildProbeMarker(nickname) {
  return nickname || "";
}

/**
 * Build probe command:
 * - claude-code: /ufoo <nickname>
 * - codex: $ufoo <nickname>
 */
function buildProbeCommand(agentType, nickname) {
  const marker = String(nickname || "").trim();
  if (agentType === "claude-code") {
    return `/ufoo ${marker}`;
  }
  return `$ufoo ${marker}`;
}

function readLines(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw.split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function escapeRegExp(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsProbeCommand(text, marker) {
  if (!text || !marker) return false;
  const escapedMarker = escapeRegExp(marker);
  const pattern = `(?:^|[\\s"'\\\`])(?:\\/ufoo|\\$ufoo|ufoo)\\s+${escapedMarker}(?=$|[\\s"'\\\`.,:;!?\\]\\)\\}])`;
  const re = new RegExp(pattern);
  return re.test(String(text));
}

/**
 * Check if a history record contains our probe marker
 * Searches for probe marker command patterns:
 * - "/ufoo <marker>" (claude)
 * - "$ufoo <marker>" (codex)
 * - "ufoo <marker>" (legacy compatibility)
 */
function recordContainsMarker(record, marker, rawLine) {
  if (!marker) return false;

  // Check raw line first (fastest)
  if (containsProbeCommand(rawLine, marker)) return true;

  if (!record || typeof record !== "object") return false;

  // Check common fields where user input might appear
  const fields = [
    record.display,     // history.jsonl uses "display" for user input
    record.text,
    record.prompt,
    record.input,
    record.message,
    record.query,
    record.content,
  ];

  for (const field of fields) {
    if (containsProbeCommand(field, marker)) return true;
  }
  return false;
}

function extractSessionId(record, rawLine) {
  if (record && typeof record === "object") {
    return record.session_id || record.sessionId || record.session || "";
  }
  if (typeof rawLine === "string") {
    const match = rawLine.match(/"session(?:_id|Id)"\s*:\s*"([^"]+)"/);
    if (match && match[1]) return match[1];
  }
  return "";
}

/**
 * Find session ID in a history file by searching for the probe marker
 */
function findSessionInFile(filePath, marker) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const lines = readLines(filePath);

  // Search from end (most recent first)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];

    // Quick check: line must contain the marker string
    if (!line.includes(marker)) continue;

    let record = null;
    try {
      record = JSON.parse(line);
    } catch {
      record = null;
    }

    if (!recordContainsMarker(record, marker, line)) continue;

    const sessionId = extractSessionId(record, line);
    if (sessionId) {
      return { sessionId, source: filePath };
    }
  }
  return null;
}

function getClaudeHistoryPath() {
  return path.join(os.homedir(), ".claude", "history.jsonl");
}

function getCodexHistoryPath() {
  return path.join(os.homedir(), ".codex", "history.jsonl");
}

/**
 * Search provider history for the probe marker and return session ID
 */
function resolveProviderSession(agentType, marker) {
  if (agentType === "codex") {
    return findSessionInFile(getCodexHistoryPath(), marker);
  }
  if (agentType === "claude-code") {
    return findSessionInFile(getClaudeHistoryPath(), marker);
  }
  return null;
}

/**
 * Save probe marker to agents data (for debugging/tracking)
 */
function persistProbeMarker(projectRoot, subscriberId, marker) {
  const filePath = getUfooPaths(projectRoot).agentsFile;
  const data = loadAgentsData(filePath);
  const meta = data.agents[subscriberId] || {};
  data.agents[subscriberId] = {
    ...meta,
    provider_session_probe: marker,
    provider_session_updated_at: new Date().toISOString(),
  };
  saveAgentsData(filePath, data);
}

function persistProviderSession(projectRoot, subscriberId, payload) {
  const filePath = getUfooPaths(projectRoot).agentsFile;
  const data = loadAgentsData(filePath);
  const meta = data.agents[subscriberId] || {};
  data.agents[subscriberId] = {
    ...meta,
    provider_session_id: payload.sessionId || "",
    provider_session_source: payload.source || "",
    provider_session_updated_at: new Date().toISOString(),
  };
  saveAgentsData(filePath, data);
}

/**
 * Retry searching for session ID with the given marker
 */
async function resolveWithRetries(agentType, marker, attempts = 12, intervalMs = 2000) {
  for (let i = 0; i < attempts; i += 1) {
    const resolved = resolveProviderSession(agentType, marker);
    if (resolved && resolved.sessionId) return resolved;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}


function loadProviderSessionCache(projectRoot) {
  const filePath = getUfooPaths(projectRoot).agentsFile;
  const data = loadAgentsData(filePath);
  const cache = new Map();
  for (const [id, meta] of Object.entries(data.agents || {})) {
    if (meta && meta.provider_session_id) {
      cache.set(id, {
        sessionId: meta.provider_session_id,
        source: meta.provider_session_source || "",
        updated_at: meta.provider_session_updated_at || "",
      });
    }
  }
  return cache;
}

/**
 * Execute probe: inject command and search for session ID
 */
async function executeProbe({
  projectRoot,
  subscriberId,
  agentType,
  nickname,
  attempts = 15,
  intervalMs = 2000,
  onResolved = null,
}) {
  const marker = buildProbeMarker(nickname);

  try {
    const command = buildProbeCommand(agentType, nickname);
    const bus = new EventBus(projectRoot);
    bus.ensureBus();
    await bus.inject(subscriberId, command);
  } catch {
    // ignore injection failures
  }

  const resolved = await resolveWithRetries(agentType, marker, attempts, intervalMs);
  if (resolved && resolved.sessionId) {
    persistProviderSession(projectRoot, subscriberId, resolved);
    if (typeof onResolved === "function") {
      onResolved(subscriberId, resolved);
    }
  }
}

/**
 * Schedule a provider session probe
 *
 * @param {Object} options
 * @param {string} options.projectRoot - Project root directory
 * @param {string} options.subscriberId - Subscriber ID (e.g., "claude-code:abc123")
 * @param {string} options.agentType - Agent type ("claude-code" or "codex")
 * @param {string} options.nickname - Agent nickname (e.g., "claude-47")
 * @param {number} options.delayMs - Delay before injection
 * @param {number} options.attempts - Number of search attempts
 * @param {number} options.intervalMs - Interval between attempts
 * @param {Function} options.onResolved - Callback when session ID is found
 */
function scheduleProviderSessionProbe({
  projectRoot,
  subscriberId,
  agentType,
  nickname,
  delayMs = 8000,
  attempts = 15,
  intervalMs = 2000,
  onResolved = null,
}) {
  if (!subscriberId || !agentType) return null;
  if (agentType !== "codex" && agentType !== "claude-code") return null;
  if (!nickname) return null;

  const marker = buildProbeMarker(nickname);
  persistProbeMarker(projectRoot, subscriberId, marker);

  let executed = false;
  let timer = null;

  const execute = async () => {
    if (executed) return;
    executed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await executeProbe({
      projectRoot,
      subscriberId,
      agentType,
      nickname,
      attempts,
      intervalMs,
      onResolved,
    });
  };

  // Schedule delayed execution (fallback)
  timer = setTimeout(execute, delayMs);

  // Return handle for early trigger
  return {
    subscriberId,
    marker,
    triggerNow: execute,
  };
}

module.exports = {
  scheduleProviderSessionProbe,
  loadProviderSessionCache,
  __private: {
    buildProbeCommand,
    recordContainsMarker,
    containsProbeCommand,
    escapeRegExp,
  },
};
