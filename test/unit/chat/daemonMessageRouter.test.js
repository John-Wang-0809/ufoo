const { createDaemonMessageRouter } = require("../../../src/chat/daemonMessageRouter");

function createHarness(overrides = {}) {
  let pending = null;
  const options = {
    escapeBlessed: jest.fn((v) => `ESC(${v})`),
    stripBlessedTags: jest.fn((v) => String(v || "").replace(/\{[^}]+\}/g, "")),
    logMessage: jest.fn(),
    renderScreen: jest.fn(),
    updateDashboard: jest.fn(),
    requestStatus: jest.fn(),
    resolveStatusLine: jest.fn(),
    enqueueBusStatus: jest.fn(),
    resolveBusStatus: jest.fn(),
    getPending: jest.fn(() => pending),
    setPending: jest.fn((value) => {
      pending = value;
    }),
    resolveAgentDisplayName: jest.fn((v) => `name:${v}`),
    getCurrentView: jest.fn(() => "main"),
    isAgentViewUsesBus: jest.fn(() => false),
    getViewingAgent: jest.fn(() => ""),
    writeToAgentTerm: jest.fn(),
    consumePendingDelivery: jest.fn(() => false),
    getPendingState: jest.fn(() => null),
    beginStream: jest.fn(() => ({ state: true })),
    appendStreamDelta: jest.fn(),
    finalizeStream: jest.fn(),
    hasStream: jest.fn(() => false),
    ...overrides,
  };

  const router = createDaemonMessageRouter(options);
  return { router, options, getPending: () => pending };
}

describe("chat daemonMessageRouter", () => {
  test("handles status phase messages", () => {
    const { router, options } = createHarness();

    const stop = router.handleMessage({
      type: "status",
      data: { phase: "start", key: "k1", text: "processing" },
    });

    expect(stop).toBe(false);
    expect(options.enqueueBusStatus).toHaveBeenCalledWith({ key: "k1", text: "processing" });
    expect(options.renderScreen).toHaveBeenCalled();
  });

  test("handles response disambiguate payload", () => {
    const { router, options, getPending } = createHarness({
      getPending: jest.fn(() => ({ original: "task" })),
    });

    router.handleMessage({
      type: "response",
      data: {
        disambiguate: {
          prompt: "Pick",
          candidates: [{ agent_id: "codex:1", reason: "best" }],
        },
      },
    });

    expect(getPending()).toEqual({
      disambiguate: {
        prompt: "Pick",
        candidates: [{ agent_id: "codex:1", reason: "best" }],
      },
      original: "task",
    });
    expect(options.resolveStatusLine).toHaveBeenCalledWith("{gray-fg}?{/gray-fg} ESC(Pick)");
    expect(options.logMessage).toHaveBeenCalled();
  });

  test("agent view bus passthrough writes to term and stops processing", () => {
    const { router, options } = createHarness({
      getCurrentView: jest.fn(() => "agent"),
      isAgentViewUsesBus: jest.fn(() => true),
      getViewingAgent: jest.fn(() => "codex:1"),
    });

    const stop = router.handleMessage({
      type: "bus",
      data: {
        event: "message",
        publisher: "codex:1",
        message: "hello",
      },
    });

    expect(stop).toBe(true);
    expect(options.writeToAgentTerm).toHaveBeenCalledWith("hello\r\n");
  });

  test("delivery event consumes pending and requests status", () => {
    const { router, options } = createHarness({
      consumePendingDelivery: jest.fn(() => true),
    });

    const stop = router.handleMessage({
      type: "bus",
      data: {
        event: "delivery",
        publisher: "codex:1",
        status: "ok",
        message: "delivered",
      },
    });

    expect(stop).toBe(true);
    expect(options.logMessage).toHaveBeenCalledWith(
      "status",
      "{white-fg}✓{/white-fg} ESC(delivered)"
    );
    expect(options.requestStatus).toHaveBeenCalled();
    expect(options.renderScreen).toHaveBeenCalled();
  });

  test("stream payload routes through stream tracker methods", () => {
    const { router, options } = createHarness();

    router.handleMessage({
      type: "bus",
      data: {
        event: "message",
        publisher: "codex:1",
        message: JSON.stringify({ stream: true, delta: "A", done: true, reason: "end" }),
      },
    });

    expect(options.beginStream).toHaveBeenCalled();
    expect(options.appendStreamDelta).toHaveBeenCalled();
    expect(options.finalizeStream).toHaveBeenCalledWith("codex:1", expect.any(Object), "end");
  });

  test("handles error messages", () => {
    const { router, options } = createHarness();

    router.handleMessage({ type: "error", error: "boom" });

    expect(options.resolveStatusLine).toHaveBeenCalledWith("{gray-fg}✗{/gray-fg} Error: boom");
    expect(options.logMessage).toHaveBeenCalledWith(
      "error",
      "{white-fg}✗{/white-fg} Error: boom"
    );
  });
});
