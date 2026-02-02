const net = require("net");
const path = require("path");
const blessed = require("blessed");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const { loadConfig, saveConfig, normalizeLaunchMode, normalizeAgentProvider } = require("../config");
const { socketPath, isRunning } = require("../daemon");

function connectSocket(sockPath) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(sockPath, () => resolve(client));
    client.on("error", reject);
  });
}

function resolveProjectFile(projectRoot, relativePath, fallbackRelativePath) {
  const local = path.join(projectRoot, relativePath);
  if (fs.existsSync(local)) return local;
  return path.join(__dirname, "..", "..", fallbackRelativePath);
}

function startDaemon(projectRoot) {
  const daemonBin = resolveProjectFile(projectRoot, path.join("bin", "ufoo.js"), path.join("bin", "ufoo.js"));
  const child = spawn(process.execPath, [daemonBin, "daemon", "--start"], {
    detached: true,
    stdio: "ignore",
    cwd: projectRoot,
  });
  child.unref();
}

function stopDaemon(projectRoot) {
  const daemonBin = resolveProjectFile(projectRoot, path.join("bin", "ufoo.js"), path.join("bin", "ufoo.js"));
  spawnSync(process.execPath, [daemonBin, "daemon", "--stop"], {
    stdio: "ignore",
    cwd: projectRoot,
  });
}

async function connectWithRetry(sockPath, retries, delayMs) {
  for (let i = 0; i < retries; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const client = await connectSocket(sockPath);
      return client;
    } catch {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

async function runChat(projectRoot) {
  if (!fs.existsSync(path.join(projectRoot, ".ufoo"))) {
    const initScript = resolveProjectFile(projectRoot, path.join("scripts", "init.sh"), path.join("scripts", "init.sh"));
    spawnSync("bash", [initScript, "--modules", "context,bus", "--project", projectRoot], {
      stdio: "inherit",
    });
  }
  if (!isRunning(projectRoot)) {
    startDaemon(projectRoot);
  }

  const daemonBin = resolveProjectFile(projectRoot, path.join("bin", "ufoo.js"), path.join("bin", "ufoo.js"));
  const sock = socketPath(projectRoot);
  let client = null;

  const connectClient = async () => {
    let newClient = await connectWithRetry(sock, 25, 200);
    if (!newClient) {
      // Retry once with a fresh daemon start and longer wait.
      if (!isRunning(projectRoot)) {
        startDaemon(projectRoot);
      }
      newClient = await connectWithRetry(sock, 50, 200);
    }
    return newClient;
  };

  client = await connectClient();
  if (!client) {
    // Check if daemon failed to start
    if (!isRunning(projectRoot)) {
      const logFile = path.join(projectRoot, ".ufoo", "run", "ufoo-daemon.log");
      // eslint-disable-next-line no-console
      console.error("Failed to start ufoo daemon. Check logs at:", logFile);
      throw new Error("Daemon failed to start. Check the daemon log for details.");
    }
    throw new Error("Failed to connect to ufoo daemon (timeout). The daemon may still be starting.");
  }

  const screen = blessed.screen({
    smartCSR: true,
    title: "ufoo chat",
    fullUnicode: true,
    // Allow terminal native copy by not fully grabbing mouse
    // Hold Option/Alt to use native selection in most terminals
    sendFocus: true,
    mouse: false,
    // Allow Ctrl+C to exit even when input grabs keys
    ignoreLocked: ["C-c"],
  });

  const config = loadConfig(projectRoot);
  let launchMode = config.launchMode;
  let agentProvider = config.agentProvider;

  // Dynamic input height settings
  // Layout: topLine(1) + content + bottomLine(1) + dashboard(1)
  const MIN_INPUT_HEIGHT = 4;  // 1 content + 3
  const MAX_INPUT_HEIGHT = 9;  // 6 content + 3
  let currentInputHeight = MIN_INPUT_HEIGHT;

  // Log area (no border for cleaner look)
  const logBox = blessed.log({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%-5",  // Will be adjusted dynamically
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollback: 10000,
    scrollbar: { ch: "│", style: { fg: "cyan" } },
    keys: true,
    vi: true,
    // Enable mouse wheel scrolling in log area (use Option/Alt for native selection)
    mouse: true,
  });

  // Status line just above input
  const statusLine = blessed.box({
    parent: screen,
    bottom: currentInputHeight,
    left: 0,
    width: "100%",
    height: 1,
    style: { fg: "gray" },
    tags: true,
    content: "",
  });
  const pkg = require("../../package.json");
  const bannerText = `{bold}UFOO{/bold} · Multi-Agent Manager{|}v${pkg.version}`;
  statusLine.setContent(bannerText);

  const historyDir = path.join(projectRoot, ".ufoo", "chat");
  const historyFile = path.join(historyDir, "history.jsonl");
  const inputHistoryFile = path.join(historyDir, "input-history.jsonl");

  function appendHistory(entry) {
    fs.mkdirSync(historyDir, { recursive: true });
    fs.appendFileSync(historyFile, `${JSON.stringify(entry)}\n`);
  }

  const SPACED_TYPES = new Set(["user", "reply", "bus", "dispatch", "error"]);
  let lastLogWasSpacer = false;
  let lastLogType = null;
  let hasLoggedAny = false;

  function shouldSpace(type) {
    return SPACED_TYPES.has(type);
  }

  function writeSpacer(writeHistory) {
    if (lastLogWasSpacer || !hasLoggedAny) return;
    logBox.log(" ");
    if (writeHistory) {
      appendHistory({
        ts: new Date().toISOString(),
        type: "spacer",
        text: "",
        meta: {},
      });
    }
    lastLogWasSpacer = true;
    lastLogType = "spacer";
    hasLoggedAny = true;
  }

  function recordLog(type, text, meta = {}, writeHistory = true) {
    if (type !== "spacer" && shouldSpace(type)) {
      writeSpacer(writeHistory);
    }
    logBox.log(text);
    if (writeHistory) {
      appendHistory({
        ts: new Date().toISOString(),
        type,
        text,
        meta,
      });
    }
    lastLogWasSpacer = false;
    lastLogType = type;
    hasLoggedAny = true;
  }

  function logMessage(type, text, meta = {}) {
    recordLog(type, text, meta, true);
  }

  function loadHistory(limit = 2000) {
    try {
      const lines = fs.readFileSync(historyFile, "utf8").trim().split(/\r?\n/).filter(Boolean);
      const items = lines.slice(-limit).map((line) => JSON.parse(line));
      const hasSpacer = items.some((item) => item && item.type === "spacer");
      for (const item of items) {
        if (!item) continue;
        if (item.type === "spacer") {
          writeSpacer(false);
          continue;
        }
        if (!item.text) continue;
        if (hasSpacer) {
          logBox.log(item.text);
          lastLogWasSpacer = false;
          lastLogType = item.type || null;
          hasLoggedAny = true;
        } else {
          recordLog(item.type || "unknown", item.text, item.meta || {}, false);
        }
      }
    } catch {
      // ignore missing/invalid history
    }
  }

  const inputHistory = [];
  let historyIndex = 0;
  let historyDraft = "";

  function appendInputHistory(text) {
    if (!text) return;
    fs.mkdirSync(historyDir, { recursive: true });
    fs.appendFileSync(inputHistoryFile, `${JSON.stringify({ text })}\n`);
  }

  function loadInputHistory(limit = 2000) {
    try {
      const lines = fs.readFileSync(inputHistoryFile, "utf8").trim().split(/\r?\n/).filter(Boolean);
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

  const pendingStatusLines = [];
  const busStatusQueue = [];
  let primaryStatusText = bannerText;

  function formatProcessingText(text) {
    if (!text) return text;
    if (text.includes("{")) return text;
    if (!/processing/i.test(text)) return text;
    return `{yellow-fg}⏳{/yellow-fg} ${text}`;
  }

  function renderStatusLine() {
    let content = primaryStatusText || "";
    if (busStatusQueue.length > 0) {
      const extra = busStatusQueue.length > 1
        ? ` {gray-fg}(+${busStatusQueue.length - 1}){/gray-fg}`
        : "";
      const busText = `${busStatusQueue[0].text}${extra}`;
      content = content
        ? `${content} {gray-fg}·{/gray-fg} ${busText}`
        : busText;
    }
    statusLine.setContent(content);
  }

  function setPrimaryStatus(text) {
    primaryStatusText = text || "";
    renderStatusLine();
  }

  function queueStatusLine(text) {
    const formatted = formatProcessingText(text);
    pendingStatusLines.push(formatted);
    if (pendingStatusLines.length === 1) {
      setPrimaryStatus(formatted);
      screen.render();
    }
  }

  function resolveStatusLine(text) {
    if (pendingStatusLines.length > 0) {
      pendingStatusLines.shift();
    }
    if (pendingStatusLines.length > 0) {
      setPrimaryStatus(pendingStatusLines[0]);
    } else {
      setPrimaryStatus(text || "");
    }
    screen.render();
  }

  function enqueueBusStatus(item) {
    if (!item || !item.text) return;
    const key = item.key || item.text;
    const formatted = formatProcessingText(item.text);
    const existing = busStatusQueue.find((entry) => entry.key === key);
    if (existing) {
      existing.text = formatted;
    } else {
      busStatusQueue.push({ key, text: formatted });
    }
    renderStatusLine();
  }

  function resolveBusStatus(item) {
    if (!item) return;
    const key = item.key || item.text;
    let index = -1;
    if (key) {
      index = busStatusQueue.findIndex((entry) => entry.key === key);
    }
    if (index === -1 && item.text) {
      index = busStatusQueue.findIndex((entry) => entry.text === item.text);
    }
    if (index === -1) return;
    busStatusQueue.splice(index, 1);
    renderStatusLine();
  }

  // Command completion panel
  const completionPanel = blessed.box({
    parent: screen,
    bottom: currentInputHeight - 1,
    left: 0,
    width: "100%",
    height: 0,
    hidden: true,
    border: {
      type: "line",
      top: true,
      left: false,
      right: false,
      bottom: false
    },
    style: {
      border: { fg: "yellow" },
      fg: "white"
      // No bg - uses terminal default background
    },
    padding: {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0
    },
    tags: true,
  });

  // Dashboard at very bottom
  const dashboard = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    style: { fg: "gray" },
    tags: true,
  });

  // Bottom border line for input area (above dashboard)
  const inputBottomLine = blessed.line({
    parent: screen,
    bottom: 1,
    left: 0,
    width: "100%",
    orientation: "horizontal",
    style: { fg: "cyan" },
  });

  // Prompt indicator
  const promptBox = blessed.box({
    parent: screen,
    bottom: 2,
    left: 0,
    width: 2,
    height: currentInputHeight - 3,
    content: ">",
    style: { fg: "cyan" },
  });

  // Input area without left/right border
  const input = blessed.textarea({
    parent: screen,
    bottom: 2,
    left: 2,
    width: "100%-2",
    height: currentInputHeight - 3,
    inputOnFocus: true,
    keys: true,
  });
  // Avoid textarea's extra wrap margin (causes a phantom empty column)
  input.type = "box";

  // Top border line for input area (just above input)
  const inputTopLine = blessed.line({
    parent: screen,
    bottom: currentInputHeight - 1,  // 4-1=3: above input(2) + inputHeight(1)
    left: 0,
    width: "100%",
    orientation: "horizontal",
    style: { fg: "cyan" },
  });

  // Add cursor position tracking
  let cursorPos = 0;
  let preferredCol = null;

  // Get inner width
  function getInnerWidth() {
    const lpos = input.lpos || input._getCoords();
    if (lpos && Number.isFinite(lpos.xl) && Number.isFinite(lpos.xi)) {
      return Math.max(1, lpos.xl - lpos.xi + 1);
    }
    if (typeof input.width === "number") return Math.max(1, input.width);
    if (typeof input.width === "string") {
      const match = input.width.match(/^100%-([0-9]+)$/);
      if (match && typeof screen.width === "number") {
        return Math.max(1, screen.width - parseInt(match[1], 10));
      }
    }
    const promptWidth = typeof promptBox.width === "number" ? promptBox.width : 2;
    if (typeof screen.width === "number") return Math.max(1, screen.width - promptWidth);
    if (typeof screen.cols === "number") return Math.max(1, screen.cols - promptWidth);
    return 1;
  }

  // Count lines considering both wrapping and newlines
  function countLines(text, width) {
    if (width <= 0) return 1;
    const lines = text.split("\n");
    let total = 0;
    for (const line of lines) {
      const lineWidth = input.strWidth(line);
      total += Math.max(1, Math.ceil(lineWidth / width));
    }
    return total;
  }

  function getCursorRowCol(text, pos, width) {
    if (width <= 0) return { row: 0, col: 0 };
    const before = text.slice(0, pos);
    const lines = before.split("\n");
    let row = 0;
    for (let i = 0; i < lines.length - 1; i++) {
      const lineWidth = input.strWidth(lines[i]);
      row += Math.max(1, Math.ceil(lineWidth / width));
    }
    const lastLine = lines[lines.length - 1] || "";
    const lastWidth = input.strWidth(lastLine);
    row += Math.floor(lastWidth / width);
    const col = lastWidth % width;
    return { row, col };
  }

  function getLinePosForCol(line, targetCol) {
    if (targetCol <= 0) return 0;
    let col = 0;
    let offset = 0;
    for (const ch of Array.from(line)) {
      const w = input.strWidth(ch);
      if (col + w > targetCol) return offset;
      col += w;
      offset += ch.length;
    }
    return offset;
  }

  function getCursorPosForRowCol(text, targetRow, targetCol, width) {
    if (width <= 0) return 0;
    const lines = text.split("\n");
    let row = 0;
    let pos = 0;
    for (const line of lines) {
      const lineWidth = input.strWidth(line);
      const wrappedRows = Math.max(1, Math.ceil(lineWidth / width));
      if (targetRow < row + wrappedRows) {
        const rowInLine = targetRow - row;
        const visualCol = rowInLine * width + Math.max(0, targetCol);
        return pos + getLinePosForCol(line, visualCol);
      }
      pos += line.length + 1;
      row += wrappedRows;
    }
    return text.length;
  }

  function resetPreferredCol() {
    preferredCol = null;
  }

  const PASTE_START = "\x1b[200~";
  const PASTE_END = "\x1b[201~";
  let pasteActive = false;
  let pasteBuffer = "";
  let pasteRemainder = "";
  let suppressKeypress = false;
  let suppressReset = null;

  function scheduleSuppressReset() {
    suppressKeypress = true;
    if (suppressReset) clearImmediate(suppressReset);
    suppressReset = setImmediate(() => {
      if (!pasteActive) suppressKeypress = false;
    });
  }

  function normalizePaste(text) {
    if (!text) return "";
    let normalized = text.replace(/\x1b\[200~|\x1b\[201~/g, "");
    normalized = normalized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return normalized;
  }

  function updateDraftFromInput() {
    if (historyIndex === inputHistory.length) {
      historyDraft = input.value;
    }
  }

  function normalizeCommandPrefix() {
    if (!input.value.startsWith("//")) return;
    const match = input.value.match(/^\/{2,}/);
    if (!match) return;
    const extra = match[0].length - 1;
    input.value = `/${input.value.slice(match[0].length)}`;
    cursorPos = Math.max(0, cursorPos - extra);
  }

  function insertTextAtCursor(text) {
    if (!text) return;
    input.value = input.value.slice(0, cursorPos) + text + input.value.slice(cursorPos);
    cursorPos += text.length;
    normalizeCommandPrefix();
    resetPreferredCol();
    resizeInput();
    input._updateCursor();
    screen.render();
    updateDraftFromInput();
  }

  function setInputValue(value) {
    input.value = value || "";
    cursorPos = input.value.length;
    resetPreferredCol();
    resizeInput();
    input._updateCursor();
    screen.render();
  }

  function historyUp() {
    if (inputHistory.length === 0) return false;
    if (historyIndex === inputHistory.length) {
      historyDraft = input.value;
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

  function exitHandler() {
    if (screen && screen.program && typeof screen.program.decrst === "function") {
      screen.program.decrst(2004);
    }
    if (client) {
      client.end();
    }
    process.exit(0);
  }

  // Command completion functions
  function showCompletion(filterText) {
    // Ensure accidental double-prefix doesn't break filtering.
    normalizeCommandPrefix();
    if (filterText !== input.value) {
      filterText = input.value;
    }
    if (filterText.startsWith("//")) {
      filterText = filterText.replace(/^\/+/, "/");
      input.value = filterText;
      cursorPos = Math.min(cursorPos, input.value.length);
    }
    if (!filterText || filterText === "") {
      hideCompletion();
      return;
    }

    // Trim the filterText to handle trailing spaces for main command mode
    // But preserve spaces for subcommand mode detection
    const endsWithSpace = /\s$/.test(filterText);
    const trimmed = filterText.trim();
    if (!trimmed) {
      hideCompletion();
      return;
    }
    filterText = trimmed;

    // Check if we're in subcommand mode
    const parts = filterText.split(/\s+/);
    let commands = [];

    if ((parts.length > 1 || (endsWithSpace && parts.length === 1)) && parts[0].startsWith("/")) {
      // Subcommand mode: "/bus rename"
      const mainCmd = parts[0];
      const subFilter = parts[1] || "";

      // Find the main command
      const mainCmdObj = COMMAND_REGISTRY.find(item =>
        item.cmd.toLowerCase() === mainCmd.toLowerCase()
      );

      if (mainCmdObj && mainCmdObj.subcommands) {
        // Filter subcommands
        commands = mainCmdObj.subcommands
          .filter(sub => sub.cmd.toLowerCase().startsWith(subFilter.toLowerCase()))
          .map(sub => ({ ...sub, isSubcommand: true, parentCmd: mainCmd }));
      }
    } else {
      // Main command mode: "/bus"
      const prefixMatches = COMMAND_REGISTRY.filter(item =>
        item.cmd.toLowerCase().startsWith(filterText.toLowerCase())
      );
      // Also allow fuzzy matches on the command body (e.g. "/b" -> /bus + /ubus)
      let fuzzyMatches = [];
      if (filterText.startsWith("/") && parts.length === 1) {
        const needle = filterText.slice(1).toLowerCase();
        if (needle) {
          fuzzyMatches = COMMAND_REGISTRY.filter(item =>
            item.cmd.toLowerCase().includes(needle)
          );
        }
      }
      const merged = new Map();
      for (const item of prefixMatches) merged.set(item.cmd, item);
      for (const item of fuzzyMatches) merged.set(item.cmd, item);
      commands = Array.from(merged.values());
    }

    if (commands.length === 0) {
      hideCompletion();
      return;
    }

    completionCommands = commands;
    completionActive = true;
    completionIndex = 0;
    completionScrollOffset = 0;

    // Calculate panel height (max 8 visible + 1 for top border)
    const visibleItems = Math.min(8, completionCommands.length);
    completionPanel.height = visibleItems + 1;
    completionPanel.bottom = currentInputHeight - 1;
    completionPanel.hidden = false;

    renderCompletionPanel();
  }

  function hideCompletion() {
    completionActive = false;
    completionCommands = [];
    completionIndex = 0;
    completionScrollOffset = 0;
    completionPanel.hidden = true;
    screen.render();
  }

  function renderCompletionPanel() {
    if (!completionActive || completionCommands.length === 0) return;

    const maxVisible = 8;

    // Adjust scroll offset to keep selected item visible
    if (completionIndex < completionScrollOffset) {
      completionScrollOffset = completionIndex;
    } else if (completionIndex >= completionScrollOffset + maxVisible) {
      completionScrollOffset = completionIndex - maxVisible + 1;
    }

    // Calculate visible slice
    const visibleStart = completionScrollOffset;
    const visibleEnd = Math.min(completionScrollOffset + maxVisible, completionCommands.length);
    const visibleCommands = completionCommands.slice(visibleStart, visibleEnd);

    const lines = visibleCommands.map((item, i) => {
      const actualIndex = visibleStart + i;
      const cmdPart = actualIndex === completionIndex
        ? `{inverse}${item.cmd}{/inverse}`
        : `{cyan-fg}${item.cmd}{/cyan-fg}`;
      const descPart = `{gray-fg}${item.desc}{/gray-fg}`;
      // Use promptBox width (2) to align with input position
      const indent = " ".repeat(promptBox.width || 2);
      return `${indent}${cmdPart}  ${descPart}`;
    });

    completionPanel.setContent(lines.join("\n"));
    screen.render();
  }

  function completionUp() {
    if (completionCommands.length === 0) return;
    completionIndex = completionIndex <= 0
      ? completionCommands.length - 1
      : completionIndex - 1;
    renderCompletionPanel();
  }

  function completionDown() {
    if (completionCommands.length === 0) return;
    completionIndex = completionIndex >= completionCommands.length - 1
      ? 0
      : completionIndex + 1;
    renderCompletionPanel();
  }

  function confirmCompletion() {
    if (!completionActive || completionCommands.length === 0) return;

    const selected = completionCommands[completionIndex];

    if (selected.isSubcommand) {
      // Subcommand: replace the last word with selected subcommand
      const parts = input.value.split(/\s+/);
      parts[parts.length - 1] = selected.cmd;
      input.value = parts.join(" ") + " ";
    } else {
      // Main command
      input.value = selected.cmd + " ";
    }

    cursorPos = input.value.length;
    resetPreferredCol();
    input._updateCursor();
    updateDraftFromInput();

    // If selected command has subcommands, trigger subcommand completion immediately
    if (!selected.isSubcommand && selected.subcommands && selected.subcommands.length > 0) {
      // Don't hide - directly show subcommand completion
      showCompletion(input.value);
    } else {
      // No subcommands - hide completion
      hideCompletion();
    }

    screen.render();
  }

  function handleCompletionKey(ch, key) {
    if (!completionActive) return false;

    if (key.name === "up") {
      completionUp();
      return true;
    }
    if (key.name === "down") {
      completionDown();
      return true;
    }
    if (key.name === "tab") {
      confirmCompletion();
      return true;
    }
    if (key.name === "enter" || key.name === "return") {
      // Enter submits input, doesn't confirm completion
      hideCompletion();
      return false;
    }
    if (key.name === "escape") {
      hideCompletion();
      return true;
    }
    if (ch === " ") {
      // Check if current input is a command that might have subcommands
      const currentInput = input.value.trim();
      if (currentInput.startsWith("/") && !currentInput.includes(" ")) {
        // Let space be inserted, will trigger subcommand completion
        return false;
      }
      hideCompletion();
      return false;
    }
    // Regular character and backspace - don't intercept, let it be handled normally
    // Completion will be updated in the main input handler
    return false;
  }

  // Resize input box based on content
  function resizeInput() {
    const innerWidth = getInnerWidth();
    if (innerWidth <= 0) return;

    const numLines = countLines(input.value, innerWidth);
    const contentHeight = Math.min(MAX_INPUT_HEIGHT - 3, Math.max(1, numLines));
    const targetHeight = contentHeight + 3; // +1 topLine +1 bottomLine +1 dashboard

    if (targetHeight !== currentInputHeight) {
      currentInputHeight = targetHeight;
      input.height = contentHeight;
      promptBox.height = contentHeight;
      inputTopLine.bottom = currentInputHeight - 1;  // Just above input area
    }
    statusLine.bottom = currentInputHeight;
    // Reposition completion panel if active
    if (completionActive) {
      completionPanel.bottom = currentInputHeight - 1;
    }
    // dashboard and inputBottomLine stay fixed at bottom 0 and 1
    logBox.height = Math.max(1, screen.height - currentInputHeight - 1);
  }

  // Override the internal listener to support cursor movement
  input._listener = function(ch, key) {
    if (key && key.ctrl && key.name === "c") {
      exitHandler();
      return;
    }
    if (suppressKeypress) {
      return;
    }
    normalizeCommandPrefix();
    if (key && (key.name === "pageup" || key.name === "pagedown")) {
      const delta = Math.max(1, Math.floor(logBox.height / 2));
      scrollLog(key.name === "pageup" ? -delta : delta);
      return;
    }
    if (focusMode === "dashboard") {
      if (handleDashboardKey(key)) return;
      return;
    }

    // Command completion mode
    if (completionActive) {
      if (handleCompletionKey(ch, key)) return;
    }

    // Treat multi-char input (paste) as insertion, including newlines.
    if (ch && ch.length > 1 && (!key || !key.name || key.name.length !== 1)) {
      insertTextAtCursor(normalizePaste(ch));
      return;
    }
    if (ch && (ch.includes("\n") || ch.includes("\r")) && (!key || (key.name !== "return" && key.name !== "enter"))) {
      insertTextAtCursor(normalizePaste(ch));
      return;
    }
    // Plain enter submits, shift+enter inserts newline
    if (key.name === "return" || key.name === "enter") {
      if (key.shift) {
        // Insert newline at cursor
        insertTextAtCursor("\n");
      } else {
        // Submit
        resetPreferredCol();
        this._done(null, this.value);
      }
      return;
    }

    if (key.name === "left") {
      if (cursorPos > 0) cursorPos--;
      resetPreferredCol();
      this._updateCursor();
      this.screen.render();
      return;
    }

    if (key.name === "right") {
      if (cursorPos < this.value.length) cursorPos++;
      resetPreferredCol();
      this._updateCursor();
      this.screen.render();
      return;
    }

    if (key.name === "home") {
      cursorPos = 0;
      resetPreferredCol();
      this._updateCursor();
      this.screen.render();
      return;
    }

    if (key.name === "end") {
      cursorPos = this.value.length;
      resetPreferredCol();
      this._updateCursor();
      this.screen.render();
      return;
    }

    if (key.name === "up") {
      // Special case: "/" + Up → jump to last command in completion
      if (completionActive && input.value === "/" && cursorPos === 1) {
        completionIndex = completionCommands.length - 1;
        renderCompletionPanel();
        return;
      }
      if (historyUp()) {
        hideCompletion();
        return;
      }
    }
    if (key.name === "down") {
      if (historyDown()) {
        hideCompletion();
        return;
      }
    }
    if (key.name === "up" || key.name === "down") {
      const innerWidth = getInnerWidth();
      if (innerWidth > 0) {
        const { row, col } = getCursorRowCol(this.value, cursorPos, innerWidth);
        if (preferredCol === null) preferredCol = col;
        const totalRows = countLines(this.value, innerWidth);

        // Down at last row -> enter dashboard mode
        if (key.name === "down" && row >= totalRows - 1) {
          enterDashboardMode();
          return;
        }

        const targetRow = key.name === "up"
          ? Math.max(0, row - 1)
          : Math.min(totalRows - 1, row + 1);
        cursorPos = getCursorPosForRowCol(this.value, targetRow, preferredCol, innerWidth);
      }
      this._updateCursor();
      this.screen.render();
      return;
    }

    if (key.name === "escape") {
      this._done(null, null);
      return;
    }

    if (key.name === "backspace") {
      if (cursorPos > 0) {
        this.value = this.value.slice(0, cursorPos - 1) + this.value.slice(cursorPos);
        cursorPos--;
        resetPreferredCol();
        resizeInput();
        this._updateCursor();
        updateDraftFromInput();

        // Update or hide completion after backspace
        if (this.value.startsWith("/")) {
          showCompletion(this.value);
        } else {
          hideCompletion();
        }

        this.screen.render();
      }
      return;
    }

    if (key.name === "delete") {
      if (cursorPos < this.value.length) {
        this.value = this.value.slice(0, cursorPos) + this.value.slice(cursorPos + 1);
        resetPreferredCol();
        resizeInput();
        this._updateCursor();
        this.screen.render();
        updateDraftFromInput();
      }
      return;
    }

    // Insert character at cursor position
    const insertChar = (ch && ch.length === 1)
      ? ch
      : (key && key.name && key.name.length === 1 ? key.name : null);
    if (insertChar && !/^[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]$/.test(insertChar)) {
      this.value = this.value.slice(0, cursorPos) + insertChar + this.value.slice(cursorPos);
      cursorPos++;
      normalizeCommandPrefix();
      resetPreferredCol();
      resizeInput();
      this._updateCursor();
      updateDraftFromInput();

      // Update completion filter if typing after "/"
      if (this.value.startsWith("/")) {
        showCompletion(this.value);
      } else if (completionActive) {
        hideCompletion();
      }

      this.screen.render();
      return;
    }
  };

  // Override cursor update to use our cursor position
  input._updateCursor = function() {
    if (this.screen.focused !== this) return;

    const lpos = this._getCoords();
    if (!lpos) return;

    const innerWidth = getInnerWidth();
    if (innerWidth <= 0) return;

    const { row, col } = getCursorRowCol(this.value, cursorPos, innerWidth);
    const innerHeight = this.height || 1;

    let scrollOffset = this.childBase || 0;
    if (row < scrollOffset) {
      scrollOffset = row;
    } else if (row >= scrollOffset + innerHeight) {
      scrollOffset = row - innerHeight + 1;
    }
    if (scrollOffset !== this.childBase) {
      this.childBase = scrollOffset;
      if (typeof this.scrollTo === "function") {
        this.scrollTo(scrollOffset);
      }
    }

    const displayRow = row - scrollOffset;
    const safeCol = Math.min(Math.max(0, col), innerWidth - 1);
    const cy = lpos.yi + displayRow;
    const cx = lpos.xi + safeCol;

    this.screen.program.cup(cy, cx);
    this.screen.program.showCursor();
  };

  // Reset cursor and height on clear
  const originalClearValue = input.clearValue.bind(input);
  input.clearValue = function() {
    cursorPos = 0;
    resetPreferredCol();
    currentInputHeight = MIN_INPUT_HEIGHT;
    historyIndex = inputHistory.length;
    historyDraft = "";
    hideCompletion();
    const contentHeight = 1; // MIN content height
    input.height = contentHeight;
    promptBox.height = contentHeight;
    inputTopLine.bottom = currentInputHeight - 1;
    statusLine.bottom = currentInputHeight;
    logBox.height = Math.max(1, screen.height - currentInputHeight - 1);
    return originalClearValue();
  };

  let pending = null;

  // Command completion state
  let completionActive = false;
  let completionCommands = [];
  let completionIndex = 0;
  let completionScrollOffset = 0;

  const COMMAND_REGISTRY = [
    { cmd: "/doctor", desc: "Health check diagnostics" },
    { cmd: "/status", desc: "Status display" },
    {
      cmd: "/daemon",
      desc: "Daemon management",
      subcommands: [
        { cmd: "start", desc: "Start daemon" },
        { cmd: "stop", desc: "Stop daemon" },
        { cmd: "restart", desc: "Restart daemon" },
        { cmd: "status", desc: "Daemon status" },
      ]
    },
    { cmd: "/init", desc: "Initialize modules" },
    {
      cmd: "/bus",
      desc: "Event bus operations",
      subcommands: [
        { cmd: "send", desc: "Send message to agent" },
        { cmd: "rename", desc: "Rename agent nickname" },
        { cmd: "list", desc: "List all agents" },
        { cmd: "status", desc: "Bus status" },
      ]
    },
    { cmd: "/ctx", desc: "Context management" },
    { cmd: "/skills", desc: "Skills management" },
    { cmd: "/ubus", desc: "Check bus messages" },
    { cmd: "/uctx", desc: "Context status" },
    { cmd: "/uinit", desc: "Initialize/repair" },
    { cmd: "/ustatus", desc: "Unified status" },
  ];

  // Agent selection state
  let activeAgents = [];
  let activeAgentLabelMap = new Map();
  let agentListWindowStart = 0;
  const MAX_AGENT_WINDOW = 5;
  let selectedAgentIndex = -1;  // -1 = not in dashboard selection mode
  let targetAgent = null;       // Selected agent for direct messaging
  let focusMode = "input";      // "input" or "dashboard"
  let dashboardView = "agents"; // "agents" or "mode"
  let selectedModeIndex = launchMode === "internal" ? 1 : 0;
  const providerOptions = [
    { label: "codex", value: "codex-cli" },
    { label: "claude", value: "claude-cli" },
  ];
  let selectedProviderIndex = agentProvider === "claude-cli" ? 1 : 0;
  let restartInProgress = false;

  function getAgentLabel(agentId) {
    return activeAgentLabelMap.get(agentId) || agentId;
  }

  function clampAgentWindow() {
    if (activeAgents.length === 0) {
      agentListWindowStart = 0;
      return;
    }
    const maxItems = Math.max(1, Math.min(MAX_AGENT_WINDOW, activeAgents.length));
    if (selectedAgentIndex >= 0) {
      if (selectedAgentIndex < agentListWindowStart) {
        agentListWindowStart = selectedAgentIndex;
      } else if (selectedAgentIndex >= agentListWindowStart + maxItems) {
        agentListWindowStart = selectedAgentIndex - maxItems + 1;
      }
    }
    const maxStart = Math.max(0, activeAgents.length - maxItems);
    if (agentListWindowStart > maxStart) agentListWindowStart = maxStart;
    if (agentListWindowStart < 0) agentListWindowStart = 0;
  }

  function send(req) {
    if (!client || client.destroyed) return;
    client.write(`${JSON.stringify(req)}\n`);
  }

  function updatePromptBox() {
    if (targetAgent) {
      const label = getAgentLabel(targetAgent);
      promptBox.setContent(`@${label}>`);
      promptBox.width = label.length + 3;  // @name>
      input.left = promptBox.width;
      input.width = `100%-${promptBox.width}`;
    } else {
      promptBox.setContent(">");
      promptBox.width = 2;
      input.left = 2;
      input.width = "100%-2";
    }
    resizeInput();
    input._updateCursor();
  }

  function focusInput() {
    input.focus();
    input._updateCursor();
  }

  function focusLog() {
    logBox.focus();
    screen.program.hideCursor();
  }

  function scrollLog(offset) {
    logBox.scroll(offset);
    screen.render();
  }

  function setLaunchMode(mode) {
    const next = normalizeLaunchMode(mode);
    if (next === launchMode) return;
    launchMode = next;
    selectedModeIndex = launchMode === "internal" ? 1 : 0;
    saveConfig(projectRoot, { launchMode });
    logMessage("status", `{magenta-fg}⚙{/magenta-fg} Launch mode: ${launchMode}`);
    renderDashboard();
    screen.render();
  }

  function providerLabel(value) {
    return value === "claude-cli" ? "claude" : "codex";
  }

  function setAgentProvider(provider) {
    const next = normalizeAgentProvider(provider);
    if (next === agentProvider) return;
    agentProvider = next;
    selectedProviderIndex = agentProvider === "claude-cli" ? 1 : 0;
    saveConfig(projectRoot, { agentProvider });
    logMessage("status", `{magenta-fg}⚙{/magenta-fg} ufoo-agent: ${providerLabel(agentProvider)}`);
    renderDashboard();
    screen.render();
    void restartDaemon();
  }

  async function restartDaemon() {
    if (restartInProgress) return;
    restartInProgress = true;
    logMessage("status", "{magenta-fg}⚙{/magenta-fg} Restarting daemon...");
    try {
      if (client) {
        client.removeAllListeners();
        try {
          client.end();
        } catch {
          // ignore
        }
      }
      stopDaemon(projectRoot);
      startDaemon(projectRoot);
      const newClient = await connectClient();
      if (newClient) {
        attachClient(newClient);
        logMessage("status", "{green-fg}✓{/green-fg} Daemon reconnected");
      } else {
        logMessage("error", "{red-fg}✗{/red-fg} Failed to reconnect to daemon");
      }
    } finally {
      restartInProgress = false;
    }
  }

  function clearLog() {
    logBox.setContent("");
    if (typeof logBox.scrollTo === "function") {
      logBox.scrollTo(0);
    }
    screen.render();
  }

  function renderDashboard() {
    let content = " ";
    if (focusMode === "dashboard") {
      if (dashboardView === "mode") {
        const modes = ["terminal", "internal"];
        const modeParts = modes.map((mode, i) => {
          if (i === selectedModeIndex) {
            return `{inverse}${mode}{/inverse}`;
          }
          return `{cyan-fg}${mode}{/cyan-fg}`;
        });
        content += `{gray-fg}Mode:{/gray-fg} ${modeParts.join("  ")}`;
        content += "  {gray-fg}│ ←/→ select, Enter confirm, ↓ agent, ↑ back{/gray-fg}";
      } else if (dashboardView === "provider") {
        const providerParts = providerOptions.map((opt, i) => {
          if (i === selectedProviderIndex) {
            return `{inverse}${opt.label}{/inverse}`;
          }
          return `{cyan-fg}${opt.label}{/cyan-fg}`;
        });
        content += `{gray-fg}Agent:{/gray-fg} ${providerParts.join("  ")}`;
        content += "  {gray-fg}│ ←/→ select, Enter confirm, ↑ back{/gray-fg}";
      } else {
        if (activeAgents.length > 0) {
          clampAgentWindow();
          const maxItems = Math.max(1, Math.min(MAX_AGENT_WINDOW, activeAgents.length));
          const start = agentListWindowStart;
          const end = start + maxItems;
          const visibleAgents = activeAgents.slice(start, end);
          const agentParts = visibleAgents.map((agent, i) => {
            const absoluteIndex = start + i;
            const label = getAgentLabel(agent);
            if (absoluteIndex === selectedAgentIndex) {
              return `{inverse}${label}{/inverse}`;
            }
            return `{cyan-fg}${label}{/cyan-fg}`;
          });
          const leftMore = start > 0 ? "{gray-fg}«{/gray-fg} " : "";
          const rightMore = end < activeAgents.length ? " {gray-fg}»{/gray-fg}" : "";
          content += `{gray-fg}Agents:{/gray-fg} ${agentParts.join("  ")}`;
          content = `${content.replace("{gray-fg}Agents:{/gray-fg} ", `{gray-fg}Agents:{/gray-fg} ${leftMore}`)}${rightMore}`;
          content += "  {gray-fg}│ ←/→ select, Enter confirm, ↓ mode, ↑ back{/gray-fg}";
        } else {
          content += "{gray-fg}Agents:{/gray-fg} {cyan-fg}none{/cyan-fg}";
          content += "  {gray-fg}│ ↓ mode, ↑ back{/gray-fg}";
        }
      }
    } else {
      // Normal dashboard display (input mode)
      const agents = activeAgents.length > 0
        ? activeAgents.slice(0, 3).map((id) => getAgentLabel(id)).join(", ") + (activeAgents.length > 3 ? ` +${activeAgents.length - 3}` : "")
        : "none";
      content += `{gray-fg}Agents:{/gray-fg} {cyan-fg}${agents}{/cyan-fg}`;
      content += `  {gray-fg}Mode:{/gray-fg} {cyan-fg}${launchMode}{/cyan-fg}`;
      content += `  {gray-fg}Agent:{/gray-fg} {cyan-fg}${providerLabel(agentProvider)}{/cyan-fg}`;
    }
    dashboard.setContent(content);
  }

  function updateDashboard(status) {
    activeAgents = status.active || [];
    const metaList = Array.isArray(status.active_meta) ? status.active_meta : [];
    activeAgentLabelMap = new Map();
    let fallbackMap = null;
    if (metaList.length === 0 && activeAgents.length > 0) {
      try {
        const busPath = path.join(projectRoot, ".ufoo", "bus", "bus.json");
        const bus = JSON.parse(fs.readFileSync(busPath, "utf8"));
        fallbackMap = new Map();
        for (const [id, meta] of Object.entries(bus.subscribers || {})) {
          if (meta && meta.nickname) fallbackMap.set(id, meta.nickname);
        }
      } catch {
        fallbackMap = null;
      }
    }
    for (const id of activeAgents) {
      const meta = metaList.find((item) => item && item.id === id);
      const label = meta && meta.nickname
        ? meta.nickname
        : (fallbackMap && fallbackMap.get(id)) || id;
      activeAgentLabelMap.set(id, label);
    }
    clampAgentWindow();
    if (focusMode === "dashboard") {
      if (dashboardView === "agents") {
        if (activeAgents.length === 0) {
          selectedAgentIndex = -1;
        } else if (selectedAgentIndex < 0 || selectedAgentIndex >= activeAgents.length) {
          selectedAgentIndex = 0;
        }
        clampAgentWindow();
      }
    }
    renderDashboard();
    screen.render();
  }

  function enterDashboardMode() {
    focusMode = "dashboard";
    dashboardView = "agents";
    selectedAgentIndex = activeAgents.length > 0 ? 0 : -1;
    agentListWindowStart = 0;
    clampAgentWindow();
    selectedModeIndex = launchMode === "internal" ? 1 : 0;
    selectedProviderIndex = agentProvider === "claude-cli" ? 1 : 0;
    screen.grabKeys = true;
    renderDashboard();
    screen.program.hideCursor();
    screen.render();
  }

  function handleDashboardKey(key) {
    if (!key || focusMode !== "dashboard") return false;
    if (dashboardView === "mode") {
      if (key.name === "left") {
        selectedModeIndex = selectedModeIndex <= 0 ? 1 : 0;
        renderDashboard();
        screen.render();
        return true;
      }
      if (key.name === "right") {
        selectedModeIndex = selectedModeIndex >= 1 ? 0 : 1;
        renderDashboard();
        screen.render();
        return true;
      }
      if (key.name === "down") {
        dashboardView = "provider";
        selectedProviderIndex = agentProvider === "claude-cli" ? 1 : 0;
        renderDashboard();
        screen.render();
        return true;
      }
      if (key.name === "up") {
        dashboardView = "agents";
        renderDashboard();
        screen.render();
        return true;
      }
      if (key.name === "enter" || key.name === "return") {
        const modes = ["terminal", "internal"];
        setLaunchMode(modes[selectedModeIndex]);
        exitDashboardMode(false);
        return true;
      }
      if (key.name === "escape") {
        exitDashboardMode(false);
        return true;
      }
      return true;
    }
    if (dashboardView === "provider") {
      if (key.name === "left") {
        selectedProviderIndex = selectedProviderIndex <= 0 ? providerOptions.length - 1 : selectedProviderIndex - 1;
        renderDashboard();
        screen.render();
        return true;
      }
      if (key.name === "right") {
        selectedProviderIndex = selectedProviderIndex >= providerOptions.length - 1 ? 0 : selectedProviderIndex + 1;
        renderDashboard();
        screen.render();
        return true;
      }
      if (key.name === "up") {
        dashboardView = "mode";
        renderDashboard();
        screen.render();
        return true;
      }
      if (key.name === "enter" || key.name === "return") {
        const selected = providerOptions[selectedProviderIndex];
        if (selected) setAgentProvider(selected.value);
        exitDashboardMode(false);
        return true;
      }
      if (key.name === "escape") {
        exitDashboardMode(false);
        return true;
      }
      return true;
    }

    if (key.name === "left") {
      if (activeAgents.length > 0 && selectedAgentIndex > 0) {
        selectedAgentIndex--;
        clampAgentWindow();
        renderDashboard();
        screen.render();
      }
      return true;
    }
    if (key.name === "right") {
      if (activeAgents.length > 0 && selectedAgentIndex < activeAgents.length - 1) {
        selectedAgentIndex++;
        clampAgentWindow();
        renderDashboard();
        screen.render();
      }
      return true;
    }
    if (key.name === "down") {
      dashboardView = "mode";
      selectedModeIndex = launchMode === "internal" ? 1 : 0;
      renderDashboard();
      screen.render();
      return true;
    }
    if (key.name === "up" || key.name === "escape") {
      exitDashboardMode(false);
      return true;
    }
    if (key.name === "enter" || key.name === "return") {
      exitDashboardMode(true);
      return true;
    }
    return false;
  }

  function exitDashboardMode(selectAgent = false) {
    if (selectAgent && selectedAgentIndex >= 0 && selectedAgentIndex < activeAgents.length) {
      targetAgent = activeAgents[selectedAgentIndex];
      updatePromptBox();
    }
    focusMode = "input";
    dashboardView = "agents";
    selectedAgentIndex = -1;
    screen.grabKeys = false;
    renderDashboard();
    focusInput();
    screen.render();
  }

  function clearTargetAgent() {
    targetAgent = null;
    updatePromptBox();
    screen.render();
  }

  function requestStatus() {
    send({ type: "status" });
  }

  const detachClient = () => {
    if (!client) return;
    client.removeAllListeners("data");
    client.removeAllListeners("close");
    try {
      client.end();
      client.destroy();
    } catch {
      // ignore
    }
  };

  const attachClient = (newClient) => {
    if (!newClient) return;
    detachClient();
    client = newClient;
    let buffer = "";
    client.on("data", (data) => {
      buffer += data.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines.filter((l) => l.trim())) {
        try {
        const msg = JSON.parse(line);
        if (msg.type === "status") {
          const data = msg.data || {};
          if (typeof data.phase === "string") {
            const text = data.text || "";
            const item = { key: data.key, text };
            if (data.phase === "start") {
              enqueueBusStatus(item);
            } else if (data.phase === "done" || data.phase === "error") {
              resolveBusStatus(item);
              if (text) {
                const prefix = data.phase === "error"
                  ? "{red-fg}✗{/red-fg}"
                  : "{green-fg}✓{/green-fg}";
                logMessage("status", `${prefix} ${text}`, data);
              }
            } else {
              enqueueBusStatus(item);
            }
            screen.render();
          } else {
            updateDashboard(data);
          }
        } else if (msg.type === "response") {
          const payload = msg.data || {};
          if (payload.reply) {
            resolveStatusLine(`{green-fg}←{/green-fg} ${payload.reply}`);
            logMessage("reply", `{green-fg}←{/green-fg} ${payload.reply}`);
          }
          if (payload.dispatch && payload.dispatch.length > 0) {
            logMessage("dispatch", `{blue-fg}→{/blue-fg} Dispatched to: ${payload.dispatch.map(d => d.target || d).join(", ")}`);
          }
          if (payload.disambiguate && Array.isArray(payload.disambiguate.candidates) && payload.disambiguate.candidates.length > 0) {
            pending = { disambiguate: payload.disambiguate, original: pending?.original };
            resolveStatusLine(`{yellow-fg}?{/yellow-fg} ${payload.disambiguate.prompt || "Choose target:"}`);
            logMessage("disambiguate", `{yellow-fg}?{/yellow-fg} ${payload.disambiguate.prompt || "Choose target:"}`);
            payload.disambiguate.candidates.forEach((c, i) => {
              logMessage("disambiguate", `   {cyan-fg}${i + 1}){/cyan-fg} ${c.agent_id} {gray-fg}— ${c.reason || ""}{/gray-fg}`);
            });
          } else {
            pending = null;
          }
          if (!payload.reply && !payload.disambiguate) {
            resolveStatusLine("{gray-fg}✓{/gray-fg} Done");
          }
          if (msg.opsResults && msg.opsResults.length > 0) {
            logMessage("ops", `{magenta-fg}⚡{/magenta-fg} ${JSON.stringify(msg.opsResults)}`);
          }
          screen.render();
        } else if (msg.type === "bus") {
          const data = msg.data || {};
          const prefix = data.event === "broadcast" ? "{magenta-fg}⇢{/magenta-fg}" : "{blue-fg}↔{/blue-fg}";
          let publisher = data.publisher && data.publisher !== "unknown"
            ? data.publisher
            : (data.event === "broadcast" ? "broadcast" : "bus");

          // Try to parse message as JSON (from internal agents)
          let displayMessage = data.message || "";
          try {
            const parsed = JSON.parse(data.message);
            if (parsed && typeof parsed === "object" && parsed.reply) {
              displayMessage = parsed.reply;
            }
          } catch {
            // Not JSON, use as-is
          }

          // Extract nickname if publisher is in subscriber:id format
          let displayName = publisher;
          if (publisher.includes(":")) {
            // Try to get nickname from activeAgentLabelMap or bus.json
            if (activeAgentLabelMap && activeAgentLabelMap.has(publisher)) {
              displayName = activeAgentLabelMap.get(publisher);
            } else {
              // Fallback: read directly from bus.json
              try {
                const busPath = path.join(projectRoot, ".ufoo", "bus", "bus.json");
                const bus = JSON.parse(fs.readFileSync(busPath, "utf8"));
                const meta = bus.subscribers && bus.subscribers[publisher];
                if (meta && meta.nickname) {
                  displayName = meta.nickname;
                }
              } catch {
                // Keep original publisher ID
              }
            }
          }

          const line = `${prefix} {gray-fg}${displayName}{/gray-fg}: ${displayMessage}`;
          logMessage("bus", line, data);
          if (data.event === "agent_renamed") {
            requestStatus();
          }
          screen.render();
        } else if (msg.type === "error") {
          resolveStatusLine(`{red-fg}✗{/red-fg} Error: ${msg.error}`);
          logMessage("error", `{red-fg}✗{/red-fg} Error: ${msg.error}`);
          screen.render();
        }
      } catch {
        // ignore
      }
    }
  });
    client.on("close", () => {
      client = null;
    });
  };

  attachClient(client);

  input.on("submit", (value) => {
    const text = value.trim();
    input.clearValue();
    screen.render();
    if (!text) {
      input.focus();
      return;
    }
    inputHistory.push(text);
    appendInputHistory(text);
    historyIndex = inputHistory.length;
    historyDraft = "";

    // If target agent is selected, send directly via bus
    if (targetAgent) {
      const label = getAgentLabel(targetAgent);
      logMessage("user", `{cyan-fg}→{/cyan-fg} {magenta-fg}@${label}{/magenta-fg} ${text}`);
      // Use bus send command
      const { spawnSync } = require("child_process");
      spawnSync("ufoo", ["bus", "send", targetAgent, text], { cwd: projectRoot });
      clearTargetAgent();
      input.focus();
      return;
    }

    if (pending && pending.disambiguate) {
      const idx = parseInt(text, 10);
      const choice = pending.disambiguate.candidates[idx - 1];
      if (choice) {
        queueStatusLine(`ufoo-agent processing (assigning ${choice.agent_id})`);
        send({
          type: "prompt",
          text: `Use agent ${choice.agent_id} to handle: ${pending.original || "the request"}`,
        });
        pending = null;
      } else {
        logMessage("error", "Invalid selection.");
      }
    } else {
      pending = { original: text };
      queueStatusLine("ufoo-agent processing");
      send({ type: "prompt", text });
      logMessage("user", `{cyan-fg}→{/cyan-fg} ${text}`);
    }
    input.focus();
  });

  screen.key(["C-c"], exitHandler);

  // Dashboard navigation - use screen.on to capture even when input is focused
  screen.on("keypress", (ch, key) => {
    handleDashboardKey(key);
  });

  screen.key(["tab"], () => {
    if (focusMode === "dashboard") {
      exitDashboardMode(false);
    } else {
      enterDashboardMode();
    }
  });

  screen.key(["C-k", "M-k"], () => {
    clearLog();
  });

  screen.key(["i", "enter"], () => {
    if (focusMode === "dashboard") return;
    if (screen.focused === input) return;
    focusInput();
  });

  // Escape in input mode only clears @target, never exits
  input.key(["escape"], () => {
    if (targetAgent) {
      clearTargetAgent();
    }
  });

  focusInput();
  if (screen.program && typeof screen.program.decset === "function") {
    screen.program.decset(2004);
  }
  if (screen.program) {
    screen.program.on("data", (data) => {
      if (screen.focused !== input || focusMode !== "input") return;
      const chunk = data.toString("utf8");
      if (!pasteActive && !chunk.includes(PASTE_START) && !pasteRemainder.includes(PASTE_START)) {
        const keep = PASTE_START.length - 1;
        pasteRemainder = (pasteRemainder + chunk).slice(-keep);
        return;
      }
      let buffer = pasteRemainder + chunk;
      pasteRemainder = "";
      while (buffer.length > 0) {
        if (!pasteActive) {
          const start = buffer.indexOf(PASTE_START);
          if (start === -1) {
            const keep = PASTE_START.length - 1;
            pasteRemainder = buffer.slice(-keep);
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
    });
  }
  loadHistory();
  loadInputHistory();
  renderDashboard();
  resizeInput();
  requestStatus();
  setInterval(requestStatus, 2000);
  screen.on("resize", () => {
    resizeInput();
    if (completionActive) hideCompletion();
    input._updateCursor();
    screen.render();
  });
  screen.render();
}

module.exports = { runChat };
