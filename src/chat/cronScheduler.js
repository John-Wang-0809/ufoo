function parseIntervalMs(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return 0;
  const match = text.match(/^(\d+)(ms|s|m|h)?$/);
  if (!match) return 0;
  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const unit = match[2] || "s";
  if (unit === "ms") return amount;
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return 0;
}

function formatIntervalMs(ms = 0) {
  const value = Number(ms) || 0;
  if (value <= 0) return "0s";
  if (value % (60 * 60 * 1000) === 0) return `${value / (60 * 60 * 1000)}h`;
  if (value % (60 * 1000) === 0) return `${value / (60 * 1000)}m`;
  if (value % 1000 === 0) return `${value / 1000}s`;
  return `${value}ms`;
}

function sanitizeSummaryText(value = "") {
  return String(value || "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeTask(task = {}) {
  const id = String(task.id || "");
  const interval = formatIntervalMs(task.intervalMs || 0);
  const targets = Array.isArray(task.targets) ? task.targets.join("+") : "";
  const promptRaw = sanitizeSummaryText(task.prompt || "");
  const prompt = promptRaw.length > 24 ? `${promptRaw.slice(0, 24)}...` : promptRaw;
  return `${id}@${interval}->${targets}: ${prompt || "(empty)"}`;
}

function createCronScheduler(options = {}) {
  const {
    dispatch = () => {},
    onChange = () => {},
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    nowFn = () => Date.now(),
  } = options;

  let seq = 0;
  const tasks = [];

  function notifyChange() {
    try {
      onChange();
    } catch {
      // ignore observer errors
    }
  }

  function addTask({ intervalMs = 0, targets = [], prompt = "" } = {}) {
    const safeInterval = Number.parseInt(intervalMs, 10);
    const safeTargets = Array.isArray(targets)
      ? targets.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const safePrompt = String(prompt || "").trim();
    if (!Number.isFinite(safeInterval) || safeInterval <= 0) return null;
    if (safeTargets.length === 0) return null;
    if (!safePrompt) return null;

    const id = `c${++seq}`;
    const task = {
      id,
      intervalMs: safeInterval,
      targets: Array.from(new Set(safeTargets)),
      prompt: safePrompt,
      createdAt: nowFn(),
      lastRunAt: 0,
      tickCount: 0,
      timer: null,
    };

    task.timer = setIntervalFn(() => {
      task.lastRunAt = nowFn();
      task.tickCount += 1;
      for (const target of task.targets) {
        try {
          dispatch({
            taskId: task.id,
            target,
            message: task.prompt,
          });
        } catch {
          // ignore single-dispatch errors
        }
      }
    }, task.intervalMs);

    tasks.push(task);
    notifyChange();
    return {
      ...task,
      summary: summarizeTask(task),
    };
  }

  function listTasks() {
    return tasks.map((task) => ({
      id: task.id,
      intervalMs: task.intervalMs,
      targets: task.targets.slice(),
      prompt: task.prompt,
      createdAt: task.createdAt,
      lastRunAt: task.lastRunAt,
      tickCount: task.tickCount,
      summary: summarizeTask(task),
    }));
  }

  function stopTask(taskId = "") {
    const id = String(taskId || "").trim();
    if (!id) return false;
    const idx = tasks.findIndex((task) => task.id === id);
    if (idx < 0) return false;
    const task = tasks[idx];
    if (task && task.timer) {
      clearIntervalFn(task.timer);
    }
    tasks.splice(idx, 1);
    notifyChange();
    return true;
  }

  function stopAll() {
    if (tasks.length === 0) return 0;
    const count = tasks.length;
    while (tasks.length > 0) {
      const task = tasks.pop();
      if (task && task.timer) {
        clearIntervalFn(task.timer);
      }
    }
    notifyChange();
    return count;
  }

  return {
    addTask,
    listTasks,
    stopTask,
    stopAll,
  };
}

module.exports = {
  parseIntervalMs,
  formatIntervalMs,
  summarizeTask,
  createCronScheduler,
};
