const { normalizeAgentsData } = require("../../../src/ufoo/agentsStore");

describe("agentsStore normalizeAgentsData", () => {
  test("heals double-prefixed subscriber id and leaked nickname object", () => {
    const result = normalizeAgentsData({
      agents: {
        "codex:codex:abc123": {
          agent_type: "codex",
          nickname: {
            parentPid: 12345,
            launchMode: "terminal",
            tmuxPane: "",
            tty: "/dev/ttys001",
          },
          status: "active",
          joined_at: "2026-02-12T00:00:00.000Z",
          last_seen: "2026-02-12T00:00:01.000Z",
        },
      },
    });

    expect(result.agents["codex:abc123"]).toMatchObject({
      agent_type: "codex",
      nickname: "",
      launch_mode: "terminal",
      tty: "/dev/ttys001",
      pid: 12345,
    });
    expect(result.agents["codex:codex:abc123"]).toBeUndefined();
  });

  test("heals underscore-prefixed corruption variant", () => {
    const result = normalizeAgentsData({
      agents: {
        "codex:codex_abc123": {
          status: "active",
        },
      },
    });

    expect(result.agents["codex:abc123"]).toMatchObject({ status: "active" });
    expect(result.agents["codex:codex_abc123"]).toBeUndefined();
  });

  test("deduplicates healed collisions by preferring active/newer", () => {
    const result = normalizeAgentsData({
      agents: {
        "codex:abc123": {
          status: "inactive",
          last_seen: "2026-02-12T00:00:00.000Z",
        },
        "codex:codex:abc123": {
          status: "active",
          last_seen: "2026-02-12T00:00:01.000Z",
        },
      },
    });

    expect(result.agents["codex:abc123"]).toMatchObject({
      status: "active",
      last_seen: "2026-02-12T00:00:01.000Z",
    });
  });
});
