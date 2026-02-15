jest.mock("../../../src/agent/cliRunner", () => ({
  runCliAgent: jest.fn(),
}));

jest.mock("../../../src/agent/normalizeOutput", () => ({
  normalizeCliOutput: jest.fn(),
}));

const { runCliAgent } = require("../../../src/agent/cliRunner");
const { normalizeCliOutput } = require("../../../src/agent/normalizeOutput");
const { handleEvent } = require("../../../src/agent/internalRunner");

describe("agent internalRunner stream forwarding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("forwards stream delta envelopes and done marker", async () => {
    runCliAgent.mockImplementationOnce(async (params) => {
      params.onStreamDelta("hello");
      params.onStreamDelta(" world");
      return { ok: true, output: [{ item: { type: "agent_message", text: "hello world" } }], sessionId: "sess-1" };
    });
    normalizeCliOutput.mockReturnValue("hello world");

    const busSender = {
      enqueue: jest.fn(),
      flush: jest.fn(async () => {}),
    };
    const state = { cliSessionId: null, needsSave: false };
    const evt = { publisher: "chat:1", data: { message: "say hi" } };

    await handleEvent(
      process.cwd(),
      "codex",
      "codex-cli",
      "gpt-5.2-codex",
      "codex:abc",
      "codex-1",
      evt,
      state,
      busSender
    );

    expect(busSender.enqueue).toHaveBeenCalledWith("chat:1", JSON.stringify({ stream: true, delta: "hello" }));
    expect(busSender.enqueue).toHaveBeenCalledWith("chat:1", JSON.stringify({ stream: true, delta: " world" }));
    expect(busSender.enqueue).toHaveBeenCalledWith(
      "chat:1",
      JSON.stringify({ stream: true, done: true, reason: "complete" })
    );
    expect(busSender.enqueue).not.toHaveBeenCalledWith("chat:1", "hello world");
    expect(busSender.flush).toHaveBeenCalled();
  });

  test("falls back to plain reply when no stream delta exists", async () => {
    runCliAgent.mockResolvedValueOnce({ ok: true, output: [{ item: { type: "agent_message", text: "done" } }] });
    normalizeCliOutput.mockReturnValueOnce("done");

    const busSender = {
      enqueue: jest.fn(),
      flush: jest.fn(async () => {}),
    };
    const state = { cliSessionId: null, needsSave: false };
    const evt = { publisher: "chat:2", data: { message: "task" } };

    await handleEvent(
      process.cwd(),
      "codex",
      "codex-cli",
      "gpt-5.2-codex",
      "codex:def",
      "codex-2",
      evt,
      state,
      busSender
    );

    expect(busSender.enqueue).toHaveBeenCalledTimes(1);
    expect(busSender.enqueue).toHaveBeenCalledWith("chat:2", "done");
    expect(busSender.flush).toHaveBeenCalled();
  });

  test("appends error to stream and sends done:error on failure", async () => {
    runCliAgent.mockImplementationOnce(async (params) => {
      params.onStreamDelta("partial");
      return { ok: false, error: "boom" };
    });
    normalizeCliOutput.mockReturnValue("");

    const busSender = {
      enqueue: jest.fn(),
      flush: jest.fn(async () => {}),
    };
    const state = { cliSessionId: null, needsSave: false };
    const evt = { publisher: "chat:3", data: { message: "task" } };

    await handleEvent(
      process.cwd(),
      "codex",
      "codex-cli",
      "gpt-5.2-codex",
      "codex:ghi",
      "codex-3",
      evt,
      state,
      busSender
    );

    expect(busSender.enqueue).toHaveBeenCalledWith("chat:3", JSON.stringify({ stream: true, delta: "partial" }));
    expect(busSender.enqueue).toHaveBeenCalledWith("chat:3", JSON.stringify({ stream: true, delta: "\n" }));
    expect(busSender.enqueue).toHaveBeenCalledWith(
      "chat:3",
      JSON.stringify({ stream: true, delta: "[internal:codex] error: boom" })
    );
    expect(busSender.enqueue).toHaveBeenCalledWith(
      "chat:3",
      JSON.stringify({ stream: true, done: true, reason: "error" })
    );
  });
});
