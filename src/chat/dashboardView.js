const { clampAgentWindowWithSelection } = require("./agentDirectory");

const DEFAULT_MODE_OPTIONS = ["terminal", "tmux", "internal"];

function providerLabel(value) {
  return value === "claude-cli" ? "claude" : "codex";
}

function computeDashboardContent(options = {}) {
  const {
    focusMode = "input",
    dashboardView = "agents",
    activeAgents = [],
    selectedAgentIndex = -1,
    agentListWindowStart = 0,
    maxAgentWindow = 4,
    getAgentLabel = (id) => id,
    launchMode = "terminal",
    agentProvider = "codex-cli",
    autoResume = true,
    selectedModeIndex = 0,
    selectedProviderIndex = 0,
    selectedResumeIndex = 0,
    providerOptions = [],
    resumeOptions = [],
    dashHints = {},
    modeOptions = DEFAULT_MODE_OPTIONS,
  } = options;

  let content = " ";
  let windowStart = agentListWindowStart;

  if (focusMode === "dashboard") {
    if (dashboardView === "mode") {
      const modeParts = modeOptions.map((mode, i) => {
        if (i === selectedModeIndex) {
          return `{inverse}${mode}{/inverse}`;
        }
        return `{cyan-fg}${mode}{/cyan-fg}`;
      });
      content += `{gray-fg}Mode:{/gray-fg} ${modeParts.join("  ")}`;
      content += `  {gray-fg}│ ${dashHints.mode || ""}{/gray-fg}`;
      return { content, windowStart };
    }

    if (dashboardView === "provider") {
      const providerParts = providerOptions.map((opt, i) => {
        if (i === selectedProviderIndex) {
          return `{inverse}${opt.label}{/inverse}`;
        }
        return `{cyan-fg}${opt.label}{/cyan-fg}`;
      });
      content += `{gray-fg}Agent:{/gray-fg} ${providerParts.join("  ")}`;
      content += `  {gray-fg}│ ${dashHints.provider || ""}{/gray-fg}`;
      return { content, windowStart };
    }

    if (dashboardView === "resume") {
      const resumeParts = resumeOptions.map((opt, i) => {
        if (i === selectedResumeIndex) {
          return `{inverse}${opt.label}{/inverse}`;
        }
        return `{cyan-fg}${opt.label}{/cyan-fg}`;
      });
      content += `{gray-fg}Resume:{/gray-fg} ${resumeParts.join("  ")}`;
      content += `  {gray-fg}│ ${dashHints.resume || ""}{/gray-fg}`;
      return { content, windowStart };
    }

    if (activeAgents.length > 0) {
      windowStart = clampAgentWindowWithSelection({
        activeCount: activeAgents.length,
        maxWindow: maxAgentWindow,
        windowStart,
        selectionIndex: selectedAgentIndex,
      });
      const maxItems = Math.max(1, Math.min(maxAgentWindow, activeAgents.length));
      const start = windowStart;
      const end = start + maxItems;
      const visibleAgents = activeAgents.slice(start, end);
      const agentParts = visibleAgents.map((agent, i) => {
        const absoluteIndex = start + i;
        const label = getAgentLabel(agent);
        if (absoluteIndex === selectedAgentIndex) {
          return `{inverse}${label}{/inverse}`;
        }
        return `{cyan-fg}${label}{/cyan-fg}`;
      });
      const leftMore = start > 0 ? "{gray-fg}<{/gray-fg} " : "";
      const rightMore = end < activeAgents.length ? " {gray-fg}>{/gray-fg}" : "";
      content += `{gray-fg}Agents:{/gray-fg} ${leftMore}${agentParts.join("  ")}${rightMore}`;
      content += `  {gray-fg}│ ${dashHints.agents || ""}{/gray-fg}`;
    } else {
      content += "{gray-fg}Agents:{/gray-fg} {cyan-fg}none{/cyan-fg}";
      content += `  {gray-fg}│ ${dashHints.agentsEmpty || ""}{/gray-fg}`;
    }
    return { content, windowStart };
  }

  const agents = activeAgents.length > 0
    ? activeAgents.slice(0, 3).map((id) => getAgentLabel(id)).join(", ") + (activeAgents.length > 3 ? ` +${activeAgents.length - 3}` : "")
    : "none";
  content += `{gray-fg}Agents:{/gray-fg} {cyan-fg}${agents}{/cyan-fg}`;
  content += `  {gray-fg}Mode:{/gray-fg} {cyan-fg}${launchMode}{/cyan-fg}`;
  content += `  {gray-fg}Agent:{/gray-fg} {cyan-fg}${providerLabel(agentProvider)}{/cyan-fg}`;
  content += `  {gray-fg}Resume:{/gray-fg} {cyan-fg}${autoResume ? "auto" : "off"}{/cyan-fg}`;

  return { content, windowStart };
}

module.exports = {
  computeDashboardContent,
  providerLabel,
};
