const {
  submitTask,
  runOnce,
  listResults,
} = require("./runtime");
const { runUcodeCoreAgent } = require("./agent");

function parseArgs(argv = []) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const out = {
    command: String(args[0] || "").trim().toLowerCase(),
    json: false,
    tool: "",
    argsJson: "",
    workspace: "",
    max: 1,
    num: 20,
    taskId: "",
  };

  for (let i = 1; i < args.length; i += 1) {
    const item = String(args[i] || "").trim();
    if (!item) continue;
    if (item === "--json") {
      out.json = true;
      continue;
    }
    if (item === "--tool") {
      out.tool = String(args[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (item === "--args-json") {
      out.argsJson = String(args[i + 1] || "");
      i += 1;
      continue;
    }
    if (item === "--workspace") {
      out.workspace = String(args[i + 1] || "").trim();
      i += 1;
      continue;
    }
    if (item === "--max") {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed)) out.max = parsed;
      i += 1;
      continue;
    }
    if (item === "--num") {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed)) out.num = parsed;
      i += 1;
      continue;
    }
    if (item === "--task-id") {
      out.taskId = String(args[i + 1] || "").trim();
      i += 1;
      continue;
    }
  }
  return out;
}

function usage() {
  return [
    "ucode-core native runtime CLI",
    "",
    "Commands:",
    "  submit --tool <read|write|edit|bash> --args-json <json> [--workspace <path>] [--task-id <id>]",
    "  run-once [--max <n>] [--workspace <path>]",
    "  list [--num <n>]",
    "",
    "Flags:",
    "  --json    Output JSON",
  ].join("\n");
}

function parseArgsJson(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    throw new Error("invalid --args-json payload");
  }
}

async function runUcodeCoreCli({
  argv = process.argv.slice(2),
  projectRoot = process.cwd(),
} = {}) {
  const options = parseArgs(argv);
  const cmd = options.command || "help";

  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    return { exitCode: 0, output: `${usage()}\n` };
  }

  if (cmd === "agent") {
    await runUcodeCoreAgent({
      workspaceRoot: projectRoot,
    });
    return { exitCode: 0, output: "" };
  }

  if (cmd === "submit") {
    if (!options.tool) {
      return { exitCode: 1, output: "missing --tool\n" };
    }
    let args = {};
    try {
      args = parseArgsJson(options.argsJson);
    } catch (err) {
      return { exitCode: 1, output: `${err.message}\n` };
    }
    const task = submitTask(projectRoot, {
      tool: options.tool,
      args,
      workspace_root: options.workspace || "",
      task_id: options.taskId || "",
    });
    if (options.json) {
      return { exitCode: 0, output: `${JSON.stringify({ ok: true, task })}\n` };
    }
    return { exitCode: 0, output: `submitted ${task.task_id}\n` };
  }

  if (cmd === "run-once") {
    const result = runOnce(projectRoot, {
      maxTasks: options.max,
      workspaceRoot: options.workspace || "",
    });
    if (options.json) {
      return { exitCode: 0, output: `${JSON.stringify({ ok: true, ...result })}\n` };
    }
    return { exitCode: 0, output: `processed ${result.processed}, offset=${result.offset}\n` };
  }

  if (cmd === "list") {
    const rows = listResults(projectRoot, { num: options.num });
    if (options.json) {
      return { exitCode: 0, output: `${JSON.stringify({ ok: true, results: rows })}\n` };
    }
    const lines = rows.map((row) => `${row.task_id || "-"} ${row.tool || "-"} ${row.ok === false ? "error" : "ok"}`);
    return { exitCode: 0, output: `${lines.join("\n")}${lines.length ? "\n" : ""}` };
  }

  return { exitCode: 1, output: `unknown command: ${cmd}\n` };
}

module.exports = {
  parseArgs,
  usage,
  parseArgsJson,
  runUcodeCoreCli,
};
