const fs = require("fs");
const path = require("path");

function readBus(projectRoot) {
  const busPath = path.join(projectRoot, ".ufoo", "bus", "bus.json");
  try {
    return JSON.parse(fs.readFileSync(busPath, "utf8"));
  } catch {
    return null;
  }
}

function readDecisions(projectRoot) {
  const dir = path.join(projectRoot, ".ufoo", "context", "DECISIONS");
  let open = 0;
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const content = fs.readFileSync(path.join(dir, f), "utf8");
      const match = content.match(/---[\s\S]*?status:\s*([^\n]+)[\s\S]*?---/);
      const status = match ? match[1].trim() : "open";
      if (status === "open") open += 1;
    }
  } catch {
    open = 0;
  }
  return { open };
}

function readUnread(projectRoot) {
  const queuesDir = path.join(projectRoot, ".ufoo", "bus", "queues");
  let total = 0;
  const perSubscriber = {};
  try {
    const dirs = fs.readdirSync(queuesDir);
    for (const d of dirs) {
      const file = path.join(queuesDir, d, "pending.jsonl");
      if (!fs.existsSync(file)) continue;
      const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/).filter(Boolean);
      if (lines.length > 0) {
        total += lines.length;
        perSubscriber[d] = lines.length;
      }
    }
  } catch {
    return { total: 0, perSubscriber: {} };
  }
  return { total, perSubscriber };
}

function buildStatus(projectRoot) {
  const bus = readBus(projectRoot);
  const decisions = readDecisions(projectRoot);
  const unread = readUnread(projectRoot);
  const subscribers = bus ? Object.keys(bus.subscribers || {}) : [];
  const activeEntries = bus
    ? Object.entries(bus.subscribers || {})
        .filter(([, meta]) => meta.status === "active")
        .map(([id, meta]) => ({ id, meta }))
    : [];
  const active = activeEntries.map(({ id }) => id);
  const activeMeta = activeEntries.map(({ id, meta }) => {
    const nickname = meta?.nickname || "";
    const display = nickname ? nickname : id;
    return { id, nickname, display };
  });

  return {
    projectRoot,
    subscribers,
    active,
    active_meta: activeMeta,
    unread,
    decisions,
  };
}

module.exports = { buildStatus };
