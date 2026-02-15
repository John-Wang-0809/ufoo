const { normalizeCliOutput } = require("../../../src/agent/normalizeOutput");

describe("agent normalizeOutput", () => {
  test("preserves reply field for claude-style object output", () => {
    expect(normalizeCliOutput({ reply: "done", dispatch: [], ops: [] })).toBe("done");
  });
});
