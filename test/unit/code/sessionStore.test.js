const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  normalizeSessionId,
  resolveSessionId,
  saveSessionSnapshot,
  loadSessionSnapshot,
  getSessionFilePath,
} = require("../../../src/code/sessionStore");

describe("ucode session store", () => {
  let workspaceRoot = "";

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ufoo-ucode-session-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test("normalize/resolve session id keeps valid id and regenerates invalid", () => {
    expect(normalizeSessionId("sess-1")).toBe("sess-1");
    expect(normalizeSessionId("../bad")).toBe("");

    expect(resolveSessionId("sess-2")).toBe("sess-2");
    expect(resolveSessionId("../bad")).toMatch(/^ucode-/);
  });

  test("save and load snapshot roundtrip", () => {
    const saved = saveSessionSnapshot(workspaceRoot, {
      sessionId: "sess-roundtrip",
      workspaceRoot,
      provider: "openai",
      model: "gpt-5",
      context: "rules",
      nlMessages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    });

    expect(saved.ok).toBe(true);
    expect(saved.sessionId).toBe("sess-roundtrip");
    expect(fs.existsSync(getSessionFilePath(workspaceRoot, "sess-roundtrip"))).toBe(true);

    const loaded = loadSessionSnapshot(workspaceRoot, "sess-roundtrip");
    expect(loaded.ok).toBe(true);
    expect(loaded.snapshot).toEqual(expect.objectContaining({
      sessionId: "sess-roundtrip",
      provider: "openai",
      model: "gpt-5",
      context: "rules",
      nlMessages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    }));
  });

  test("load returns not found for unknown session", () => {
    const loaded = loadSessionSnapshot(workspaceRoot, "sess-missing");
    expect(loaded.ok).toBe(false);
    expect(loaded.error).toContain("session not found");
  });
});
