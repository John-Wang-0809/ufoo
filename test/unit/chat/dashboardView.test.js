const { computeDashboardContent, providerLabel } = require("../../../src/chat/dashboardView");

describe("chat dashboardView", () => {
  const dashHints = {
    agents: "AGENTS",
    agentsEmpty: "EMPTY",
    mode: "MODE",
    provider: "PROVIDER",
    resume: "RESUME",
  };

  test("providerLabel maps provider ids", () => {
    expect(providerLabel("claude-cli")).toBe("claude");
    expect(providerLabel("codex-cli")).toBe("codex");
    expect(providerLabel("unknown")).toBe("codex");
  });

  test("normal mode renders summary line", () => {
    const out = computeDashboardContent({
      focusMode: "input",
      activeAgents: ["a", "b", "c", "d"],
      getAgentLabel: (id) => `@${id}`,
      launchMode: "tmux",
      agentProvider: "claude-cli",
      autoResume: false,
      dashHints,
    });

    expect(out.windowStart).toBe(0);
    expect(out.content).toContain("{gray-fg}Agents:{/gray-fg} {cyan-fg}@a, @b, @c +1{/cyan-fg}");
    expect(out.content).toContain("{gray-fg}Mode:{/gray-fg} {cyan-fg}tmux{/cyan-fg}");
    expect(out.content).toContain("{gray-fg}Agent:{/gray-fg} {cyan-fg}claude{/cyan-fg}");
  });

  test("dashboard mode page highlights selected mode", () => {
    const out = computeDashboardContent({
      focusMode: "dashboard",
      dashboardView: "mode",
      selectedModeIndex: 1,
      dashHints,
    });

    expect(out.content).toContain("{inverse}tmux{/inverse}");
    expect(out.content).toContain("{gray-fg}│ MODE{/gray-fg}");
  });

  test("dashboard agents view clamps window and renders overflow markers", () => {
    const out = computeDashboardContent({
      focusMode: "dashboard",
      dashboardView: "agents",
      activeAgents: ["a", "b", "c", "d", "e"],
      selectedAgentIndex: 4,
      agentListWindowStart: 0,
      maxAgentWindow: 3,
      getAgentLabel: (id) => id.toUpperCase(),
      dashHints,
    });

    expect(out.windowStart).toBe(2);
    expect(out.content).toContain("{gray-fg}<{/gray-fg}");
    expect(out.content).toContain("{inverse}E{/inverse}");
    expect(out.content).toContain("{gray-fg}│ AGENTS{/gray-fg}");
  });

  test("dashboard agents empty renders empty hint", () => {
    const out = computeDashboardContent({
      focusMode: "dashboard",
      dashboardView: "agents",
      activeAgents: [],
      dashHints,
    });

    expect(out.content).toContain("{cyan-fg}none{/cyan-fg}");
    expect(out.content).toContain("{gray-fg}│ EMPTY{/gray-fg}");
  });

  test("provider and resume pages highlight selected options", () => {
    const providerOut = computeDashboardContent({
      focusMode: "dashboard",
      dashboardView: "provider",
      providerOptions: [
        { label: "codex", value: "codex-cli" },
        { label: "claude", value: "claude-cli" },
      ],
      selectedProviderIndex: 1,
      dashHints,
    });
    expect(providerOut.content).toContain("{inverse}claude{/inverse}");
    expect(providerOut.content).toContain("{gray-fg}│ PROVIDER{/gray-fg}");

    const resumeOut = computeDashboardContent({
      focusMode: "dashboard",
      dashboardView: "resume",
      resumeOptions: [
        { label: "Resume previous session", value: true },
        { label: "Start new session", value: false },
      ],
      selectedResumeIndex: 0,
      dashHints,
    });
    expect(resumeOut.content).toContain("{inverse}Resume previous session{/inverse}");
    expect(resumeOut.content).toContain("{gray-fg}│ RESUME{/gray-fg}");
  });
});
