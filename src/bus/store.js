"use strict";

const fs = require("fs");
const path = require("path");
const { getTimestamp, ensureDir } = require("./utils");
const { getUfooPaths } = require("../ufoo/paths");
const { loadAgentsData, saveAgentsData } = require("../ufoo/agentsStore");

class BusStore {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.paths = getUfooPaths(projectRoot);
    this.busDir = this.paths.busDir;
    this.agentsFile = this.paths.agentsFile;
    this.eventsDir = this.paths.busEventsDir;
    this.logsDir = this.paths.busLogsDir;
  }

  ensure() {
    if (!fs.existsSync(this.busDir) || !fs.existsSync(this.paths.agentDir)) {
      throw new Error(
        "Event bus not initialized. Please run: ufoo bus init or /uinit"
      );
    }
  }

  load() {
    return loadAgentsData(this.agentsFile);
  }

  save(busData) {
    if (busData) {
      saveAgentsData(this.agentsFile, busData);
    }
  }

  init() {
    ensureDir(this.busDir);
    ensureDir(this.paths.agentDir);
    ensureDir(this.eventsDir);
    ensureDir(path.join(this.busDir, "queues"));
    ensureDir(this.logsDir);
    ensureDir(path.join(this.busDir, "offsets"));
    ensureDir(this.paths.busDaemonDir);
    ensureDir(this.paths.busDaemonCountsDir);

    if (!fs.existsSync(this.agentsFile)) {
      const busData = {
        created_at: getTimestamp(),
        agents: {},
      };
      saveAgentsData(this.agentsFile, busData);
    }
  }

  getCurrentSubscriber(busData) {
    if (process.env.UFOO_SUBSCRIBER_ID) {
      return process.env.UFOO_SUBSCRIBER_ID;
    }

    if (!fs.existsSync(this.agentsFile)) {
      return null;
    }

    const sessionFile = path.join(this.paths.agentDir, "session.txt");
    if (fs.existsSync(sessionFile)) {
      const sessionId = fs.readFileSync(sessionFile, "utf8").trim();
      if (sessionId) {
        return sessionId;
      }
    }

    let currentTty = null;
    try {
      const ttyPath = fs.realpathSync("/dev/tty");
      if (ttyPath && ttyPath.startsWith("/dev/")) {
        currentTty = ttyPath;
      }
    } catch {
      // tty not available
    }

    if (currentTty && busData && busData.agents) {
      for (const [id, meta] of Object.entries(busData.agents)) {
        if (meta.tty === currentTty) {
          return id;
        }
      }
    }

    return null;
  }
}

module.exports = { BusStore };
