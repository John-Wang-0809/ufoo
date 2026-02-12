const { createCommandExecutor } = require("../../../src/chat/commandExecutor");

function createHarness(overrides = {}) {
  const logs = [];
  const logMessage = jest.fn((type, text) => {
    logs.push({ type, text });
  });

  const context = {
    doctor: jest.fn().mockResolvedValue(undefined),
    listDecisions: jest.fn().mockResolvedValue(undefined),
    status: jest.fn().mockResolvedValue(undefined),
  };

  const bus = {
    rename: jest.fn().mockResolvedValue(undefined),
    ensureBus: jest.fn(),
    loadBusData: jest.fn(),
    busData: { agents: {} },
  };

  const skills = {
    list: jest.fn(() => []),
    install: jest.fn().mockResolvedValue(undefined),
  };

  const doctor = {
    run: jest.fn(() => true),
  };

  const defaults = {
    projectRoot: "/tmp/ufoo",
    parseCommand: jest.fn(() => null),
    escapeBlessed: jest.fn((value) => `ESC(${value})`),
    logMessage,
    renderScreen: jest.fn(),
    getActiveAgents: jest.fn(() => []),
    getActiveAgentMetaMap: jest.fn(() => new Map()),
    getAgentLabel: jest.fn((id) => id),
    isDaemonRunning: jest.fn(() => false),
    startDaemon: jest.fn(),
    stopDaemon: jest.fn(),
    restartDaemon: jest.fn().mockResolvedValue(undefined),
    send: jest.fn(),
    requestStatus: jest.fn(),
    createBus: jest.fn(() => bus),
    createInit: jest.fn(() => ({ init: jest.fn().mockResolvedValue(undefined) })),
    createDoctor: jest.fn(() => doctor),
    createContext: jest.fn(() => context),
    createSkills: jest.fn(() => skills),
    activateAgent: jest.fn().mockResolvedValue(undefined),
    sleep: jest.fn(() => Promise.resolve()),
    schedule: jest.fn((fn) => fn()),
  };

  const options = { ...defaults, ...overrides };
  const executor = createCommandExecutor(options);
  return { executor, options, logs, bus, context, skills, doctor };
}

describe("chat commandExecutor", () => {
  test("requires projectRoot", () => {
    expect(() => createCommandExecutor({ projectRoot: "" })).toThrow(/requires projectRoot/);
  });

  test("executeCommand returns false when parser does not match", async () => {
    const { executor } = createHarness();
    await expect(executor.executeCommand("hello")).resolves.toBe(false);
  });

  test("executeCommand logs unknown command", async () => {
    const { executor, logs } = createHarness({
      parseCommand: jest.fn(() => ({ command: "nope", args: [] })),
    });

    await expect(executor.executeCommand("/nope")).resolves.toBe(true);
    expect(logs.some((entry) => entry.text.includes("Unknown command: /nope"))).toBe(true);
  });

  test("handleStatusCommand logs active agents and daemon status", async () => {
    const { executor, options, logs } = createHarness({
      getActiveAgents: jest.fn(() => ["codex:1"]),
      getActiveAgentMetaMap: jest.fn(() => new Map([["codex:1", { launch_mode: "internal" }]])),
      getAgentLabel: jest.fn(() => "alpha"),
      isDaemonRunning: jest.fn(() => true),
    });

    await executor.handleStatusCommand();

    expect(options.getAgentLabel).toHaveBeenCalledWith("codex:1");
    expect(logs.some((entry) => entry.text.includes("1 active agent"))).toBe(true);
    expect(logs.some((entry) => entry.text.includes("alpha") && entry.text.includes("internal"))).toBe(true);
    expect(logs.some((entry) => entry.text.includes("Daemon is running"))).toBe(true);
  });

  test("handleDaemonCommand start path invokes start and checks status", async () => {
    const isDaemonRunning = jest
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { executor, options, logs } = createHarness({ isDaemonRunning });

    await executor.handleDaemonCommand(["start"]);

    expect(options.startDaemon).toHaveBeenCalledWith("/tmp/ufoo");
    expect(options.sleep).toHaveBeenCalledWith(1000);
    expect(logs.some((entry) => entry.text.includes("Daemon started"))).toBe(true);
  });

  test("handleBusCommand send validates args and sends message", async () => {
    const { executor, options, logs } = createHarness();

    await executor.handleBusCommand(["send", "only-target"]);
    expect(logs.some((entry) => entry.text.includes("Usage: /bus send"))).toBe(true);

    await executor.handleBusCommand(["send", "codex:1", "hello", "world"]);
    expect(options.send).toHaveBeenCalledWith({
      type: "bus_send",
      target: "codex:1",
      message: "hello world",
    });
  });

  test("handleBusCommand activate delegates to activateAgent", async () => {
    const { executor, options } = createHarness();
    await executor.handleBusCommand(["activate", "codex:1"]);
    expect(options.activateAgent).toHaveBeenCalledWith("codex:1");
  });

  test("handleCtxCommand routes to decisions", async () => {
    const { executor, context, options } = createHarness();

    await executor.handleCtxCommand(["decisions"]);

    expect(context.listDecisions).toHaveBeenCalled();
    expect(context.doctor).not.toHaveBeenCalled();
    expect(options.renderScreen).toHaveBeenCalled();
  });

  test("handleLaunchCommand parses nickname/count and schedules refresh", async () => {
    const { executor, options, logs } = createHarness();

    await executor.handleLaunchCommand(["codex", "nickname=neo", "count=1"]);

    expect(options.send).toHaveBeenCalledWith({
      type: "launch_agent",
      agent: "codex",
      count: 1,
      nickname: "neo",
    });
    expect(options.schedule).toHaveBeenCalled();
    expect(options.requestStatus).toHaveBeenCalled();
    expect(logs.some((entry) => entry.text.includes("Launching codex (neo)"))).toBe(true);
  });

  test("handleLaunchCommand rejects nickname with count > 1", async () => {
    const { executor, options, logs } = createHarness();

    await executor.handleLaunchCommand(["codex", "nickname=neo", "count=2"]);

    expect(options.send).not.toHaveBeenCalled();
    expect(logs.some((entry) => entry.text.includes("nickname requires count=1"))).toBe(true);
  });

  test("handleDoctorCommand escapes thrown errors", async () => {
    const { executor, options, logs } = createHarness({
      createDoctor: jest.fn(() => ({ run: jest.fn(() => { throw new Error("boom"); }) })),
    });

    await executor.handleDoctorCommand();

    expect(options.escapeBlessed).toHaveBeenCalledWith("boom");
    expect(logs.some((entry) => entry.text.includes("Doctor check failed: ESC(boom)"))).toBe(true);
  });
});
