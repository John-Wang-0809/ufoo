const { createInputHistoryController } = require("../../../src/chat/inputHistoryController");

describe("chat inputHistoryController", () => {
  test("requires file path and dir", () => {
    expect(() => createInputHistoryController({})).toThrow(
      /requires inputHistoryFile and historyDir/
    );
  });

  test("loadInputHistory reads and filters entries", () => {
    const setInputValue = jest.fn();
    let currentValue = "";
    const fsMod = {
      readFileSync: jest.fn(() =>
        `${JSON.stringify({ text: "one" })}\n` +
        `${JSON.stringify({ text: "   " })}\n` +
        `${JSON.stringify({ text: "two" })}\n`
      ),
      mkdirSync: jest.fn(),
      appendFileSync: jest.fn(),
    };

    const controller = createInputHistoryController({
      inputHistoryFile: "/tmp/history.jsonl",
      historyDir: "/tmp",
      setInputValue,
      getInputValue: () => currentValue,
      fsMod,
    });

    controller.loadInputHistory();
    const state = controller.getState();

    expect(state.history).toEqual(["one", "two"]);
    expect(state.historyIndex).toBe(2);
  });

  test("historyUp/historyDown preserve draft and navigate", () => {
    let currentValue = "draft";
    const setInputValue = jest.fn((value) => {
      currentValue = value;
    });
    const fsMod = {
      readFileSync: jest.fn(() =>
        `${JSON.stringify({ text: "one" })}\n${JSON.stringify({ text: "two" })}\n`
      ),
      mkdirSync: jest.fn(),
      appendFileSync: jest.fn(),
    };

    const controller = createInputHistoryController({
      inputHistoryFile: "/tmp/history.jsonl",
      historyDir: "/tmp",
      setInputValue,
      getInputValue: () => currentValue,
      fsMod,
    });

    controller.loadInputHistory();

    expect(controller.historyUp()).toBe(true);
    expect(setInputValue).toHaveBeenLastCalledWith("two");

    expect(controller.historyUp()).toBe(true);
    expect(setInputValue).toHaveBeenLastCalledWith("one");

    expect(controller.historyDown()).toBe(true);
    expect(setInputValue).toHaveBeenLastCalledWith("two");

    expect(controller.historyDown()).toBe(true);
    expect(setInputValue).toHaveBeenLastCalledWith("draft");

    expect(controller.historyDown()).toBe(false);
  });

  test("commitSubmittedText appends to history and file", () => {
    const fsMod = {
      readFileSync: jest.fn(() => ""),
      mkdirSync: jest.fn(),
      appendFileSync: jest.fn(),
    };

    const controller = createInputHistoryController({
      inputHistoryFile: "/tmp/history.jsonl",
      historyDir: "/tmp",
      setInputValue: jest.fn(),
      getInputValue: jest.fn(() => ""),
      fsMod,
    });

    controller.commitSubmittedText("hello");

    const state = controller.getState();
    expect(state.history).toEqual(["hello"]);
    expect(state.historyIndex).toBe(1);
    expect(state.historyDraft).toBe("");
    expect(fsMod.mkdirSync).toHaveBeenCalledWith("/tmp", { recursive: true });
    expect(fsMod.appendFileSync).toHaveBeenCalledWith(
      "/tmp/history.jsonl",
      `${JSON.stringify({ text: "hello" })}\n`
    );
  });

  test("setIndexToEnd clears draft", () => {
    let currentValue = "x";
    const controller = createInputHistoryController({
      inputHistoryFile: "/tmp/history.jsonl",
      historyDir: "/tmp",
      setInputValue: jest.fn((value) => {
        currentValue = value;
      }),
      getInputValue: () => currentValue,
      fsMod: {
        readFileSync: jest.fn(() => `${JSON.stringify({ text: "one" })}\n`),
        mkdirSync: jest.fn(),
        appendFileSync: jest.fn(),
      },
    });

    controller.loadInputHistory();
    controller.historyUp();
    controller.setIndexToEnd();

    const state = controller.getState();
    expect(state.historyIndex).toBe(state.history.length);
    expect(state.historyDraft).toBe("");
  });
});
