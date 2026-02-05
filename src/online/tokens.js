const fs = require("fs");
const path = require("path");
const os = require("os");

function defaultTokensPath() {
  return path.join(os.homedir(), ".ufoo", "online", "tokens.json");
}

function normalizeTokensData(raw) {
  if (!raw || typeof raw !== "object") {
    return { agents: {} };
  }
  if (raw.agents && typeof raw.agents === "object") {
    return { agents: raw.agents };
  }
  // Legacy: flat object mapping id -> token
  return { agents: raw };
}

function loadTokens(filePath = defaultTokensPath()) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeTokensData(parsed);
  } catch {
    return { agents: {} };
  }
}

function saveTokens(filePath = defaultTokensPath(), data = { agents: {} }) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function setToken(filePath, agentId, token, server = "") {
  if (!agentId || !token) throw new Error("agentId and token are required");
  const data = loadTokens(filePath);
  data.agents[agentId] = {
    token,
    server,
    updated_at: new Date().toISOString(),
  };
  saveTokens(filePath, data);
  return data.agents[agentId];
}

function removeToken(filePath, agentId) {
  const data = loadTokens(filePath);
  if (data.agents[agentId]) {
    delete data.agents[agentId];
    saveTokens(filePath, data);
  }
  return data;
}

function getToken(filePath, agentId) {
  const data = loadTokens(filePath);
  return data.agents[agentId] || null;
}

function listTokens(filePath) {
  const data = loadTokens(filePath);
  return Object.entries(data.agents).map(([id, entry]) => ({ id, ...entry }));
}

module.exports = {
  defaultTokensPath,
  loadTokens,
  saveTokens,
  setToken,
  removeToken,
  getToken,
  listTokens,
};
