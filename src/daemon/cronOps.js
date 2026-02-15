const {
  createCronScheduler,
  parseIntervalMs,
  formatIntervalMs,
} = require("../chat/cronScheduler");

function splitTargets(value = "") {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCronTargets(op = {}) {
  const fromArray = Array.isArray(op.targets)
    ? op.targets.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return Array.from(new Set(fromArray));

  const merged = [
    op.target,
    op.agent,
    op.to,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(",");

  return Array.from(new Set(splitTargets(merged)));
}

function resolveCronOperation(op = {}) {
  const raw = String(op.operation || op.op || op.command || "").trim().toLowerCase();
  if (raw) return raw;
  if (op.list === true) return "list";
  if (op.stop === true) return "stop";
  if (op.id || op.task_id || op.taskId) return "stop";
  return "start";
}

function resolveCronIntervalMs(op = {}) {
  const numeric = Number(op.interval_ms ?? op.intervalMs);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }

  const everyRaw = String(op.every || op.interval || op.ms || "").trim();
  if (!everyRaw) return 0;
  return parseIntervalMs(everyRaw);
}

function resolveCronPrompt(op = {}) {
  return String(op.prompt || op.message || op.msg || "").trim();
}

function resolveCronTaskId(op = {}) {
  return String(op.id || op.task_id || op.taskId || "").trim();
}

function formatCronTask(task = {}) {
  return {
    id: String(task.id || ""),
    intervalMs: Number(task.intervalMs) || 0,
    interval: formatIntervalMs(task.intervalMs || 0),
    targets: Array.isArray(task.targets) ? task.targets.slice() : [],
    prompt: String(task.prompt || ""),
    createdAt: Number(task.createdAt) || 0,
    lastRunAt: Number(task.lastRunAt) || 0,
    tickCount: Number(task.tickCount) || 0,
    summary: String(task.summary || ""),
  };
}

function createDaemonCronController(options = {}) {
  const {
    dispatch = async () => {},
    log = () => {},
    setIntervalFn,
    clearIntervalFn,
    nowFn,
  } = options;

  const scheduler = createCronScheduler({
    dispatch: ({ taskId, target, message }) => {
      try {
        Promise.resolve(dispatch({ taskId, target, message })).catch((err) => {
          const detail = err && err.message ? err.message : String(err || "dispatch failed");
          log(`cron dispatch failed task=${taskId} target=${target}: ${detail}`);
        });
      } catch (err) {
        const detail = err && err.message ? err.message : String(err || "dispatch failed");
        log(`cron dispatch failed task=${taskId} target=${target}: ${detail}`);
      }
    },
    setIntervalFn,
    clearIntervalFn,
    nowFn,
  });

  function listTasks() {
    return scheduler.listTasks().map(formatCronTask);
  }

  function handleCronOp(op = {}) {
    const operation = resolveCronOperation(op);

    if (operation === "list" || operation === "ls") {
      const tasks = listTasks();
      return {
        action: "cron",
        operation: "list",
        ok: true,
        count: tasks.length,
        tasks,
      };
    }

    if (operation === "stop" || operation === "rm" || operation === "remove") {
      const id = resolveCronTaskId(op);
      if (!id) {
        return {
          action: "cron",
          operation: "stop",
          ok: false,
          error: "cron stop requires id or all",
        };
      }

      if (id === "all") {
        const stopped = scheduler.stopAll();
        return {
          action: "cron",
          operation: "stop",
          ok: true,
          id: "all",
          stopped,
        };
      }

      const ok = scheduler.stopTask(id);
      if (!ok) {
        return {
          action: "cron",
          operation: "stop",
          ok: false,
          id,
          error: `cron task not found: ${id}`,
        };
      }

      return {
        action: "cron",
        operation: "stop",
        ok: true,
        id,
        stopped: 1,
      };
    }

    if (operation !== "start" && operation !== "add" && operation !== "create") {
      return {
        action: "cron",
        operation,
        ok: false,
        error: `unsupported cron operation: ${operation}`,
      };
    }

    const intervalMs = resolveCronIntervalMs(op);
    if (!Number.isFinite(intervalMs) || intervalMs < 1000) {
      return {
        action: "cron",
        operation: "start",
        ok: false,
        error: "invalid cron interval (min 1s)",
      };
    }

    const targets = normalizeCronTargets(op);
    if (targets.length === 0) {
      return {
        action: "cron",
        operation: "start",
        ok: false,
        error: "cron start requires at least one target",
      };
    }

    const prompt = resolveCronPrompt(op);
    if (!prompt) {
      return {
        action: "cron",
        operation: "start",
        ok: false,
        error: "cron start requires prompt",
      };
    }

    const task = scheduler.addTask({
      intervalMs,
      targets,
      prompt,
    });

    if (!task) {
      return {
        action: "cron",
        operation: "start",
        ok: false,
        error: "failed to create cron task",
      };
    }

    return {
      action: "cron",
      operation: "start",
      ok: true,
      task: formatCronTask(task),
    };
  }

  function stopAll() {
    return scheduler.stopAll();
  }

  return {
    handleCronOp,
    listTasks,
    stopAll,
  };
}

module.exports = {
  createDaemonCronController,
  normalizeCronTargets,
  resolveCronOperation,
  resolveCronIntervalMs,
  resolveCronPrompt,
  resolveCronTaskId,
  formatCronTask,
};
