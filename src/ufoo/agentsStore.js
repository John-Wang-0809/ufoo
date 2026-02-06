const { getTimestamp, readJSON, writeJSON } = require("../bus/utils");

const AGENTS_SCHEMA_VERSION = 1;

function normalizeAgentsData(data) {
  const base = data && typeof data === "object" ? { ...data } : {};
  const { subscribers: _legacy, ...rest } = base;
  const agents = base.agents && typeof base.agents === "object"
    ? base.agents
    : {};
  const createdAt = typeof base.created_at === "string" && base.created_at
    ? base.created_at
    : getTimestamp();

  return {
    ...rest,
    schema_version: AGENTS_SCHEMA_VERSION,
    created_at: createdAt,
    agents,
  };
}

function loadAgentsData(filePath) {
  const data = readJSON(filePath, null);
  if (!data) {
    return normalizeAgentsData({});
  }
  return normalizeAgentsData(data);
}

function saveAgentsData(filePath, data) {
  const normalized = normalizeAgentsData(data);
  writeJSON(filePath, normalized);
}

module.exports = {
  AGENTS_SCHEMA_VERSION,
  loadAgentsData,
  saveAgentsData,
  normalizeAgentsData,
};
