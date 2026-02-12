const { createStatusLineController } = require("../../../src/chat/statusLineController");

function createHarness(overrides = {}) {
  const statusLine = {
    setContent: jest.fn(),
  };
  const renderScreen = jest.fn();
  const setIntervalFn = jest.fn(() => ({ id: "timer" }));
  const clearIntervalFn = jest.fn();
  const now = jest.fn(() => 0);

  const controller = createStatusLineController({
    statusLine,
    bannerText: "banner",
    renderScreen,
    setIntervalFn,
    clearIntervalFn,
    now,
    ...overrides,
  });

  return { controller, statusLine, renderScreen, setIntervalFn, clearIntervalFn };
}

describe("chat statusLineController", () => {
  test("requires statusLine", () => {
    expect(() => createStatusLineController({})).toThrow(/requires statusLine/);
  });

  test("queue and resolve pending status toggles animation", () => {
    const { controller, statusLine, renderScreen, setIntervalFn, clearIntervalFn } = createHarness();

    controller.queueStatusLine("processing task");
    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(renderScreen).toHaveBeenCalled();
    expect(statusLine.setContent).toHaveBeenCalled();

    controller.resolveStatusLine("done");
    expect(clearIntervalFn).toHaveBeenCalledTimes(1);
    expect(statusLine.setContent).toHaveBeenLastCalledWith("done");
  });

  test("multiple pending statuses resolve in FIFO order", () => {
    const { controller, statusLine, clearIntervalFn } = createHarness();

    controller.queueStatusLine("first");
    controller.queueStatusLine("second");

    controller.resolveStatusLine("ignored");
    const firstResolveContent = statusLine.setContent.mock.calls.at(-1)[0];
    const firstResolvePlain = firstResolveContent.replace(/\{[^}]+\}/g, "");
    expect(firstResolvePlain).toContain("second");
    expect(clearIntervalFn).toHaveBeenCalledTimes(0);

    controller.resolveStatusLine("final");
    expect(statusLine.setContent).toHaveBeenLastCalledWith("final");
    expect(clearIntervalFn).toHaveBeenCalledTimes(1);
  });

  test("bus queue appends and resolves status indicators", () => {
    const { controller, statusLine } = createHarness();

    controller.enqueueBusStatus({ key: "a", text: "processing a" });
    controller.enqueueBusStatus({ key: "b", text: "processing b" });
    const withExtra = statusLine.setContent.mock.calls.at(-1)[0];
    expect(withExtra).toContain("(+1)");

    controller.resolveBusStatus({ key: "a", text: "processing a" });
    const afterResolve = statusLine.setContent.mock.calls.at(-1)[0];
    expect(afterResolve).toContain("processing b");
    expect(afterResolve).not.toContain("(+1)");
  });

  test("destroy clears active animation timer", () => {
    const { controller, clearIntervalFn } = createHarness();

    controller.queueStatusLine("processing");
    controller.destroy();

    expect(clearIntervalFn).toHaveBeenCalledTimes(1);
  });
});
