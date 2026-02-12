const { createChatLogController } = require("../../../src/chat/chatLogController");

function createHarness(overrides = {}) {
  const logBox = {
    log: jest.fn(),
  };
  const fsModule = {
    mkdirSync: jest.fn(),
    appendFileSync: jest.fn(),
    readFileSync: jest.fn(),
  };
  const now = jest.fn(() => "2026-02-11T00:00:00.000Z");

  const controller = createChatLogController({
    logBox,
    fsModule,
    historyDir: "/tmp/chat-history",
    historyFile: "/tmp/chat-history/history.jsonl",
    now,
    ...overrides,
  });

  return { controller, logBox, fsModule, now };
}

describe("chat chatLogController", () => {
  test("requires logBox with log function", () => {
    expect(() => createChatLogController({})).toThrow(/requires logBox\.log/);
  });

  test("inserts spacer before spaced types after first log", () => {
    const { controller, logBox } = createHarness();

    controller.recordLog("user", "first", {}, false);
    controller.recordLog("reply", "second", {}, false);

    expect(logBox.log.mock.calls).toEqual([["first"], [" "], ["second"]]);
  });

  test("persists log entries when writeHistory is enabled", () => {
    const { controller, fsModule } = createHarness();

    controller.logMessage("status", "hello", { tag: "x" });

    expect(fsModule.mkdirSync).toHaveBeenCalledWith("/tmp/chat-history", { recursive: true });
    expect(fsModule.appendFileSync).toHaveBeenCalledWith(
      "/tmp/chat-history/history.jsonl",
      `${JSON.stringify({
        ts: "2026-02-11T00:00:00.000Z",
        type: "status",
        text: "hello",
        meta: { tag: "x" },
      })}\n`
    );
  });

  test("loadHistory replays legacy history without explicit spacers", () => {
    const { controller, fsModule, logBox } = createHarness();
    const lines = [
      JSON.stringify({ type: "user", text: "u1", meta: {} }),
      JSON.stringify({ type: "reply", text: "r1", meta: {} }),
    ];
    fsModule.readFileSync.mockReturnValue(`${lines.join("\n")}\n`);

    controller.loadHistory();

    expect(logBox.log.mock.calls).toEqual([["u1"], [" "], ["r1"]]);
  });

  test("loadHistory keeps explicit spacers as-is", () => {
    const { controller, fsModule, logBox } = createHarness();
    const lines = [
      JSON.stringify({ type: "user", text: "u1", meta: {} }),
      JSON.stringify({ type: "spacer", text: "", meta: {} }),
      JSON.stringify({ type: "reply", text: "r1", meta: {} }),
    ];
    fsModule.readFileSync.mockReturnValue(`${lines.join("\n")}\n`);

    controller.loadHistory();

    expect(logBox.log.mock.calls).toEqual([["u1"], [" "], ["r1"]]);
  });

  test("markStreamStart allows next spaced log to include spacer", () => {
    const { controller, logBox } = createHarness();

    controller.recordLog("status", "boot", {}, false);
    controller.markStreamStart();
    controller.recordLog("reply", "done", {}, false);

    expect(logBox.log.mock.calls).toEqual([["boot"], [" "], ["done"]]);
  });
});
