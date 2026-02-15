const { __private } = require("../../../src/daemon/providerSessions");

describe("daemon providerSessions probe command", () => {
  test("uses /ufoo marker for claude-code", () => {
    expect(__private.buildProbeCommand("claude-code", "claude-1")).toBe("/ufoo claude-1");
  });

  test("uses $ufoo marker for codex", () => {
    expect(__private.buildProbeCommand("codex", "codex-1")).toBe("$ufoo codex-1");
  });

  test("recordContainsMarker recognizes /ufoo, $ufoo and legacy ufoo", () => {
    const marker = "codex-1";
    expect(__private.recordContainsMarker(null, marker, "/ufoo codex-1")).toBe(true);
    expect(__private.recordContainsMarker(null, marker, "$ufoo codex-1")).toBe(true);
    expect(__private.recordContainsMarker(null, marker, "ufoo codex-1")).toBe(true);
  });

  test("recordContainsMarker checks parsed record fields", () => {
    const marker = "codex-9";
    expect(__private.recordContainsMarker({ display: "$ufoo codex-9" }, marker, "")).toBe(true);
    expect(__private.recordContainsMarker({ text: "/ufoo codex-9" }, marker, "")).toBe(true);
    expect(__private.recordContainsMarker({ prompt: "ufoo codex-9" }, marker, "")).toBe(true);
  });

  test("recordContainsMarker does not collide similar nicknames", () => {
    const marker = "codex-1";
    expect(__private.recordContainsMarker(null, marker, "$ufoo codex-10")).toBe(false);
    expect(__private.recordContainsMarker(null, marker, "/ufoo codex-10")).toBe(false);
    expect(__private.recordContainsMarker({ display: "ufoo codex-10" }, marker, "")).toBe(false);
  });

  test("containsProbeCommand enforces token boundary", () => {
    expect(__private.containsProbeCommand("\"$ufoo codex-1\"", "codex-1")).toBe(true);
    expect(__private.containsProbeCommand("... /ufoo codex-1,", "codex-1")).toBe(true);
    expect(__private.containsProbeCommand("$ufoo codex-10", "codex-1")).toBe(false);
  });
});
