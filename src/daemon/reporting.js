const fs = require("fs");
const { BUS_STATUS_PHASES } = require("../shared/eventContract");
const {
  REPORT_PHASES,
  normalizeReportInput,
  appendReport,
  updateReportState,
  appendControllerInboxEntry,
} = require("../report/store");
const { getUfooPaths } = require("../ufoo/paths");

function resolveAgentDisplayName(projectRoot, agentId) {
  if (!agentId) return "unknown-agent";
  try {
    const busPath = getUfooPaths(projectRoot).agentsFile;
    const bus = JSON.parse(fs.readFileSync(busPath, "utf8"));
    const meta = bus && bus.agents ? bus.agents[agentId] : null;
    if (meta && typeof meta.nickname === "string" && meta.nickname.trim()) {
      return meta.nickname.trim();
    }
  } catch {
    // ignore
  }
  return agentId;
}

function toStatusPhase(reportPhase) {
  if (reportPhase === REPORT_PHASES.START || reportPhase === REPORT_PHASES.PROGRESS) {
    return BUS_STATUS_PHASES.START;
  }
  if (reportPhase === REPORT_PHASES.ERROR) return BUS_STATUS_PHASES.ERROR;
  return BUS_STATUS_PHASES.DONE;
}

function formatStatusText(displayName, entry) {
  if (entry.phase === REPORT_PHASES.START) {
    const detail = entry.message || entry.summary || entry.task_id;
    return `${displayName} ${detail}`;
  }
  if (entry.phase === REPORT_PHASES.PROGRESS) {
    const detail = entry.message || entry.summary || entry.task_id;
    return `${displayName} progress: ${detail}`;
  }
  if (entry.phase === REPORT_PHASES.ERROR) {
    const detail = entry.error || entry.summary || entry.message || entry.task_id;
    return `${displayName} failed: ${detail}`;
  }
  const detail = entry.summary || entry.message || entry.task_id;
  return `${displayName} done: ${detail}`;
}

function buildReportStatus(entry, displayName) {
  return {
    phase: toStatusPhase(entry.phase),
    key: `report:${entry.agent_id}:${entry.task_id}`,
    text: formatStatusText(displayName, entry),
  };
}

function publishToPrivateController(projectRoot, entry) {
  if (!entry || !entry.controller_id) return;
  appendControllerInboxEntry(projectRoot, entry.controller_id, entry);
}

async function recordAgentReport({
  projectRoot,
  report,
  onStatus = () => {},
  log = () => {},
}) {
  const entry = normalizeReportInput(report);
  appendReport(projectRoot, entry);
  const state = updateReportState(projectRoot, entry);
  publishToPrivateController(projectRoot, entry);
  const displayName = resolveAgentDisplayName(projectRoot, entry.agent_id);
  if (entry.scope !== "private") {
    onStatus(buildReportStatus(entry, displayName));
  }
  log(`report ${entry.phase} scope=${entry.scope} agent=${entry.agent_id} task=${entry.task_id}`);
  return { entry, state };
}

module.exports = {
  recordAgentReport,
  resolveAgentDisplayName,
  toStatusPhase,
  formatStatusText,
  buildReportStatus,
  publishToPrivateController,
};
