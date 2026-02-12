const { createPasteController } = require("../../../src/chat/pasteController");

function createHarness(overrides = {}) {
  const inserted = [];
  const insertTextAtCursor = jest.fn((text) => inserted.push(text));
  const normalizePaste = jest.fn((text) => text.replace(/\r\n/g, "\n"));
  const shouldHandle = jest.fn(() => true);
  const immediates = [];
  const setImmediateFn = jest.fn((fn) => {
    immediates.push(fn);
    return immediates.length - 1;
  });
  const clearImmediateFn = jest.fn((id) => {
    if (id >= 0 && id < immediates.length) immediates[id] = null;
  });

  const controller = createPasteController({
    shouldHandle,
    normalizePaste,
    insertTextAtCursor,
    setImmediateFn,
    clearImmediateFn,
    ...overrides,
  });

  function flushImmediates() {
    while (immediates.length > 0) {
      const fn = immediates.shift();
      if (typeof fn === "function") fn();
    }
  }

  return {
    controller,
    inserted,
    insertTextAtCursor,
    normalizePaste,
    shouldHandle,
    flushImmediates,
  };
}

describe("chat pasteController", () => {
  test("ignores incoming data when shouldHandle is false", () => {
    const { controller, insertTextAtCursor } = createHarness({
      shouldHandle: () => false,
    });

    controller.handleProgramData(Buffer.from("\x1b[200~hello\x1b[201~", "utf8"));

    expect(insertTextAtCursor).not.toHaveBeenCalled();
    expect(controller.isSuppressKeypress()).toBe(false);
  });

  test("parses a complete bracketed paste chunk", () => {
    const { controller, inserted, normalizePaste, flushImmediates } = createHarness();

    controller.handleProgramData(Buffer.from("\x1b[200~a\r\nb\x1b[201~", "utf8"));

    expect(normalizePaste).toHaveBeenCalledWith("a\r\nb");
    expect(inserted).toEqual(["a\nb"]);
    expect(controller.isSuppressKeypress()).toBe(true);

    flushImmediates();
    expect(controller.isSuppressKeypress()).toBe(false);
  });

  test("handles bracketed paste markers split across chunks", () => {
    const { controller, inserted, flushImmediates } = createHarness();

    controller.handleProgramData(Buffer.from("noise\x1b[20", "utf8"));
    controller.handleProgramData(Buffer.from("0~abc", "utf8"));
    controller.handleProgramData(Buffer.from("def\x1b[201~tail", "utf8"));

    expect(inserted).toEqual(["abcdef"]);
    flushImmediates();
    expect(controller.isSuppressKeypress()).toBe(false);
  });
});
