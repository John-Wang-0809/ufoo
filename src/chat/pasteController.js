function createPasteController(options = {}) {
  const {
    shouldHandle = () => true,
    normalizePaste = (text) => text,
    insertTextAtCursor = () => {},
    setImmediateFn = setImmediate,
    clearImmediateFn = clearImmediate,
  } = options;

  const PASTE_START = "\x1b[200~";
  const PASTE_END = "\x1b[201~";
  let pasteActive = false;
  let pasteBuffer = "";
  let pasteRemainder = "";
  let suppressKeypress = false;
  let suppressReset = null;

  function keepMarkerPrefixTail(text, marker) {
    const max = Math.min(marker.length - 1, text.length);
    for (let len = max; len > 0; len -= 1) {
      if (text.endsWith(marker.slice(0, len))) {
        return text.slice(-len);
      }
    }
    return "";
  }

  function scheduleSuppressReset() {
    suppressKeypress = true;
    if (suppressReset) clearImmediateFn(suppressReset);
    suppressReset = setImmediateFn(() => {
      if (!pasteActive) suppressKeypress = false;
    });
  }

  function handleProgramData(data) {
    if (!shouldHandle()) return;
    let buffer = pasteRemainder + data.toString("utf8");
    pasteRemainder = "";
    while (buffer.length > 0) {
      if (!pasteActive) {
        const start = buffer.indexOf(PASTE_START);
        if (start === -1) {
          pasteRemainder = keepMarkerPrefixTail(buffer, PASTE_START);
          return;
        }
        buffer = buffer.slice(start + PASTE_START.length);
        pasteActive = true;
        pasteBuffer = "";
        scheduleSuppressReset();
        continue;
      }
      const end = buffer.indexOf(PASTE_END);
      if (end === -1) {
        pasteBuffer += buffer;
        scheduleSuppressReset();
        return;
      }
      pasteBuffer += buffer.slice(0, end);
      buffer = buffer.slice(end + PASTE_END.length);
      pasteActive = false;
      scheduleSuppressReset();
      const normalized = normalizePaste(pasteBuffer);
      pasteBuffer = "";
      if (normalized) insertTextAtCursor(normalized);
    }
  }

  function isSuppressKeypress() {
    return suppressKeypress;
  }

  return {
    handleProgramData,
    isSuppressKeypress,
  };
}

module.exports = {
  createPasteController,
};
