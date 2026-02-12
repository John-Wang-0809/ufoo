const fs = require("fs");

function createInputHistoryController(options = {}) {
  const {
    inputHistoryFile,
    historyDir,
    setInputValue = () => {},
    getInputValue = () => "",
    fsMod = fs,
  } = options;

  if (!inputHistoryFile || !historyDir) {
    throw new Error("createInputHistoryController requires inputHistoryFile and historyDir");
  }

  const inputHistory = [];
  let historyIndex = 0;
  let historyDraft = "";

  function appendInputHistory(text) {
    if (!text) return;
    fsMod.mkdirSync(historyDir, { recursive: true });
    fsMod.appendFileSync(inputHistoryFile, `${JSON.stringify({ text })}\n`);
  }

  function loadInputHistory(limit = 2000) {
    try {
      const raw = fsMod.readFileSync(inputHistoryFile, "utf8");
      const lines = String(raw || "").trim().split(/\r?\n/).filter(Boolean);
      const items = lines.slice(-limit).map((line) => JSON.parse(line));
      for (const item of items) {
        if (item && typeof item.text === "string" && item.text.trim() !== "") {
          inputHistory.push(item.text);
        }
      }
    } catch {
      // ignore missing/invalid history
    }
    historyIndex = inputHistory.length;
  }

  function updateDraftFromInput() {
    if (historyIndex === inputHistory.length) {
      historyDraft = getInputValue();
    }
  }

  function setIndexToEnd() {
    historyIndex = inputHistory.length;
    historyDraft = "";
  }

  function historyUp() {
    if (inputHistory.length === 0) return false;
    if (historyIndex === inputHistory.length) {
      historyDraft = getInputValue();
    }
    if (historyIndex > 0) {
      historyIndex -= 1;
      setInputValue(inputHistory[historyIndex]);
      return true;
    }
    return true;
  }

  function historyDown() {
    if (inputHistory.length === 0) return false;
    if (historyIndex < inputHistory.length - 1) {
      historyIndex += 1;
      setInputValue(inputHistory[historyIndex]);
      return true;
    }
    if (historyIndex === inputHistory.length - 1) {
      historyIndex = inputHistory.length;
      setInputValue(historyDraft || "");
      return true;
    }
    return false;
  }

  function commitSubmittedText(text) {
    if (!text) return;
    inputHistory.push(text);
    appendInputHistory(text);
    setIndexToEnd();
  }

  return {
    loadInputHistory,
    updateDraftFromInput,
    historyUp,
    historyDown,
    commitSubmittedText,
    setIndexToEnd,
    getState: () => ({
      history: [...inputHistory],
      historyIndex,
      historyDraft,
    }),
  };
}

module.exports = {
  createInputHistoryController,
};
