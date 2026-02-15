const fs = require("fs");
const { runUfooAgent } = require("../../../src/agent/ufooAgent");

jest.mock("../../../src/agent/cliRunner", () => ({
  runCliAgent: jest.fn(),
}));
jest.mock("../../../src/daemon/status", () => ({
  buildStatus: jest.fn(),
}));
jest.mock("../../../src/agent/normalizeOutput", () => ({
  normalizeCliOutput: jest.fn((value) => String(value || "")),
}));

const { runCliAgent } = require("../../../src/agent/cliRunner");
const { buildStatus } = require("../../../src/daemon/status");

describe("ufooAgent prompt schema", () => {
  const projectRoot = "/tmp/ufoo-agent-schema-test";

  beforeEach(() => {
    if (fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(projectRoot, { recursive: true });
    buildStatus.mockReturnValue({ active_meta: [] });
    runCliAgent.mockResolvedValue({
      ok: true,
      sessionId: "sess-1",
      output: "{\"reply\":\"ok\",\"dispatch\":[],\"ops\":[]}",
    });
  });

  afterEach(() => {
    if (fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
    jest.clearAllMocks();
  });

  test("injects assistant_call rules into system prompt", async () => {
    const res = await runUfooAgent({
      projectRoot,
      prompt: "inspect project",
      provider: "codex-cli",
      model: "",
    });

    expect(res.ok).toBe(true);
    expect(runCliAgent).toHaveBeenCalledTimes(1);
    const call = runCliAgent.mock.calls[0][0];
    expect(call.systemPrompt).toContain("assistant_call");
    expect(call.systemPrompt).toContain("Use top-level assistant_call for project exploration");
    expect(call.systemPrompt).toContain("\"assistant_call\": {\"kind\":\"explore|bash|mixed\"");
  });
});
