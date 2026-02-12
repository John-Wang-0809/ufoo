const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

jest.mock("child_process", () => {
  const { EventEmitter } = require("events");
  const spawn = jest.fn(() => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    process.nextTick(() => proc.emit("close", 0));
    return proc;
  });
  return { spawn };
});

const { getRecoverableAgents, closeAgent } = require("../../../src/daemon/ops");
const { getUfooPaths } = require("../../../src/ufoo/paths");

describe("daemon ops recoverable agents", () => {
  const projectRoot = "/tmp/ufoo-daemon-ops-test";

  function writeAgents(agents) {
    const paths = getUfooPaths(projectRoot);
    fs.mkdirSync(path.dirname(paths.agentsFile), { recursive: true });
    fs.writeFileSync(paths.agentsFile, JSON.stringify({
      created_at: new Date().toISOString(),
      agents,
      schema_version: 1,
    }, null, 2));
  }

  function writeConfig(config) {
    const configPath = path.join(projectRoot, ".ufoo", "config.json");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  beforeEach(() => {
    if (fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test("lists inactive agents with provider sessions as recoverable", () => {
    writeConfig({ launchMode: "terminal" });
    writeAgents({
      "codex:a1": {
        agent_type: "codex",
        nickname: "coder",
        status: "inactive",
        provider_session_id: "sess-1",
        launch_mode: "terminal",
      },
      "codex:a2": {
        agent_type: "codex",
        nickname: "active",
        status: "active",
        pid: process.pid,
        provider_session_id: "sess-2",
      },
    });

    const result = getRecoverableAgents(projectRoot);
    expect(result.recoverable).toHaveLength(1);
    expect(result.recoverable[0]).toMatchObject({
      id: "codex:a1",
      nickname: "coder",
      agent: "codex",
      sessionId: "sess-1",
    });
    expect(result.skipped.some((s) => s.id === "codex:a2" && s.reason === "already active")).toBe(true);
  });

  test("supports resolving single target by nickname", () => {
    writeConfig({ launchMode: "terminal" });
    writeAgents({
      "claude-code:b1": {
        agent_type: "claude-code",
        nickname: "architect",
        status: "inactive",
        provider_session_id: "sess-c",
      },
    });

    const result = getRecoverableAgents(projectRoot, "architect");
    expect(result.recoverable).toHaveLength(1);
    expect(result.recoverable[0].id).toBe("claude-code:b1");
  });

  test("returns internal-mode skip reason and target-not-found reason", () => {
    writeConfig({ launchMode: "internal" });
    writeAgents({
      "codex:c1": {
        agent_type: "codex",
        nickname: "worker",
        status: "inactive",
        provider_session_id: "sess-i",
      },
    });

    const internalResult = getRecoverableAgents(projectRoot);
    expect(internalResult.recoverable).toHaveLength(0);
    expect(internalResult.skipped.some((s) => s.id === "codex:c1" && s.reason === "internal mode not supported for resume")).toBe(true);

    const missingResult = getRecoverableAgents(projectRoot, "missing-target");
    expect(missingResult.recoverable).toHaveLength(0);
    expect(missingResult.skipped).toEqual([{ id: "missing-target", reason: "target not found" }]);
  });
});


describe("daemon ops closeAgent window close gate", () => {
  const projectRoot = "/tmp/ufoo-daemon-closeagent-test";
  let platformDescriptor;
  let killSpy;

  function writeAgents(agents) {
    const paths = getUfooPaths(projectRoot);
    fs.mkdirSync(path.dirname(paths.agentsFile), { recursive: true });
    fs.writeFileSync(paths.agentsFile, JSON.stringify({
      created_at: new Date().toISOString(),
      agents,
      schema_version: 1,
    }, null, 2));
  }

  beforeEach(() => {
    if (fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(projectRoot, { recursive: true });
    platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "darwin" });
    killSpy = jest.spyOn(process, "kill").mockImplementation(() => true);
    spawn.mockClear();
  });

  afterEach(() => {
    if (fs.existsSync(projectRoot)) {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
    if (platformDescriptor) {
      Object.defineProperty(process, "platform", platformDescriptor);
    }
    if (killSpy) {
      killSpy.mockRestore();
    }
  });

  test("terminal mode attempts to close window before SIGTERM", async () => {
    writeAgents({
      "codex:a1": {
        agent_type: "codex",
        status: "active",
        pid: 12345,
        launch_mode: "terminal",
        tty: "/dev/ttys001",
        terminal_app: "Terminal",
      },
    });

    const result = await closeAgent(projectRoot, "codex:a1");
    expect(result).toBe(true);
    expect(spawn.mock.calls.length).toBeGreaterThan(0);
    expect(killSpy).toHaveBeenCalledWith(12345, "SIGTERM");
  });

  test("tmux mode skips window close even when tty is present", async () => {
    writeAgents({
      "codex:a2": {
        agent_type: "codex",
        status: "active",
        pid: 54321,
        launch_mode: "tmux",
        tty: "/dev/ttys002",
        terminal_app: "Terminal",
      },
    });

    const result = await closeAgent(projectRoot, "codex:a2");
    expect(result).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
    expect(killSpy).toHaveBeenCalledWith(54321, "SIGTERM");
  });
});
