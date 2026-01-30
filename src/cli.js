const path = require("path");
const { spawnSync } = require("child_process");

function getPackageRoot() {
  return path.resolve(__dirname, "..");
}

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    ...options,
  });
  if (res.error) throw res.error;
  if (typeof res.status === "number" && res.status !== 0) {
    const e = new Error(`${cmd} exited with code ${res.status}`);
    e.code = res.status;
    throw e;
  }
}

function getPackageScript(rel) {
  return path.join(getPackageRoot(), rel);
}

function requireOptional(name) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(name);
  } catch {
    return null;
  }
}

async function runCli(argv) {
  const pkg = require(path.resolve(getPackageRoot(), "package.json"));

  const commander = requireOptional("commander");
  const chalk = requireOptional("chalk") || { cyan: (s) => s, red: (s) => s };

  if (commander && commander.Command) {
    const { Command } = commander;
    const program = new Command();

    program
      .name("ufoo")
      .description("ufoo CLI (wrapper-first; prefers project-local scripts).")
      .version(pkg.version);

    program
      .command("doctor")
      .description("Run repo doctor checks")
      .action(() => {
        const repoRoot = getPackageRoot();
        run("bash", [path.join(repoRoot, "scripts/doctor.sh")]);
      });

    program
      .command("init")
      .description("Initialize modules in a project")
      .option("--modules <list>", "Comma-separated modules (context,bus,resources)", "context")
      .option("--project <dir>", "Target project directory", process.cwd())
      .action((opts) => {
        const repoRoot = getPackageRoot();
        run("bash", [
          path.join(repoRoot, "scripts/init.sh"),
          "--modules",
          opts.modules,
          "--project",
          opts.project,
        ]);
      });

    const skills = program.command("skills").description("Manage skills templates");
    skills
      .command("list")
      .description("List available skills")
      .action(() => {
        const repoRoot = getPackageRoot();
        run("bash", [path.join(repoRoot, "scripts/skills.sh"), "list"]);
      });
    skills
      .command("install")
      .description("Install one skill or all skills")
      .argument("<name>", "Skill name or 'all'")
      .option("--target <dir>", "Install target directory")
      .option("--codex", "Install into ~/.codex/skills")
      .option("--agents", "Install into ~/.agents/skills")
      .action((name, opts) => {
        const repoRoot = getPackageRoot();
        const args = [path.join(repoRoot, "scripts/skills.sh"), "install", name];
        if (opts.target) args.push("--target", opts.target);
        if (opts.codex) args.push("--codex");
        if (opts.agents) args.push("--agents");
        run("bash", args);
      });

    const bus = program.command("bus").description("Project bus commands");
    bus
      .command("alert")
      .description("Start/stop background notification daemon")
      .argument("<subscriber>", "Subscriber ID (e.g., claude-code:abc123)")
      .argument("[interval]", "Poll interval in seconds", "2")
      .option("--notify", "Enable macOS Notification Center")
      .option("--daemon", "Run in background")
      .option("--stop", "Stop running alert for this subscriber")
      .option("--no-title", "Disable terminal title badge")
      .option("--no-bell", "Disable terminal bell")
      .allowUnknownOption(true)
      .action((subscriber, interval, opts) => {
        const script = getPackageScript("scripts/bus-alert.sh");
        const args = [script, subscriber, interval];
        if (opts.notify) args.push("--notify");
        if (opts.daemon) args.push("--daemon");
        if (opts.stop) args.push("--stop");
        if (opts.title === false) args.push("--no-title");
        if (opts.bell === false) args.push("--no-bell");
        run("bash", args);
      });
    bus
      .command("listen")
      .description("Foreground listener for incoming messages")
      .argument("<subscriber>", "Subscriber ID")
      .option("--from-beginning", "Print existing queued messages first")
      .option("--reset", "Truncate pending queue before listening")
      .option("--auto-join", "Auto-join bus to get subscriber ID")
      .action((subscriber, opts) => {
        const script = getPackageScript("scripts/bus-listen.sh");
        const args = [script, subscriber];
        if (opts.fromBeginning) args.push("--from-beginning");
        if (opts.reset) args.push("--reset");
        if (opts.autoJoin) args.push("--auto-join");
        run("bash", args);
      });
    bus
      .command("daemon")
      .description("Start/stop daemon that auto-injects /bus into terminals")
      .option("--interval <n>", "Poll interval in seconds", "2")
      .option("--daemon", "Run in background")
      .option("--stop", "Stop running daemon")
      .option("--status", "Check daemon status")
      .action((opts) => {
        const script = getPackageScript("scripts/bus-daemon.sh");
        const args = [script];
        if (opts.interval) args.push("--interval", opts.interval);
        if (opts.daemon) args.push("--daemon");
        if (opts.stop) args.push("--stop");
        if (opts.status) args.push("--status");
        run("bash", args);
      });
    bus
      .command("inject")
      .description("Inject /bus into a Terminal.app tab by subscriber ID")
      .argument("<subscriber>", "Subscriber ID to inject into")
      .action((subscriber) => {
        const script = getPackageScript("scripts/bus-inject.sh");
        run("bash", [script, subscriber]);
      });
    bus
      .command("run", { isDefault: true })
      .description("Run bus.sh commands (join, check, send, status, etc.)")
      .allowUnknownOption(true)
      .argument("<args...>", "Arguments passed to scripts/bus.sh")
      .action((args) => {
        const script = getPackageScript("scripts/bus.sh");
        run("bash", [script, ...args]);
      });

    program
      .command("ctx")
      .description("Project ctx commands (delegates to ./scripts/context-*.sh)")
      .argument("[subcmd]", "Subcommand (doctor|lint|decisions)", "doctor")
      .allowUnknownOption(true)
      .argument("[subargs...]", "Subcommand args")
      .action((subcmd, subargs = []) => {
        const map = {
          doctor: "scripts/context-doctor.sh",
          lint: "scripts/context-lint.sh",
          decisions: "scripts/context-decisions.sh",
        };
        const rel = map[subcmd];
        if (!rel) {
          console.error(
            chalk.red(
              `Unknown ctx subcommand: ${subcmd}. Supported: ${Object.keys(map).join(", ")}`
            )
          );
          process.exitCode = 1;
          return;
        }
        const script = getPackageScript(rel);
        run("bash", [script, ...subargs]);
      });

    program.addHelpText(
      "after",
      `\nNotes:\n  - If 'ufoo' isn't in PATH, run it via ${chalk.cyan(
        "./bin/ufoo"
      )} (repo) or install globally via npm.\n  - For bus notifications inside Codex, prefer ${chalk.cyan(
        "scripts/bus-alert.sh"
      )} / ${chalk.cyan("scripts/bus-listen.sh")} (no IME issues).\n`
    );

    await program.parseAsync(argv);
    return;
  }

  // Dependency-free fallback parser (good for local testing without npm install).
  const cmd = argv[2] || "";
  const rest = argv.slice(3);
  const repoRoot = getPackageRoot();

  const help = () => {
    console.log(`ufoo ${pkg.version}`);
    console.log("");
    console.log("Usage:");
    console.log("  ufoo doctor");
    console.log("  ufoo init [--modules <list>] [--project <dir>]");
    console.log("  ufoo skills list");
    console.log("  ufoo skills install <name|all> [--target <dir> | --codex | --agents]");
    console.log("  ufoo bus <args...>    (delegates to ./scripts/bus.sh)");
    console.log("  ufoo ctx <subcmd> ... (doctor|lint|decisions)");
    console.log("");
    console.log("Notes:");
    console.log("  - For Codex notifications, use scripts/bus-alert.sh / scripts/bus-listen.sh");
  };

  if (cmd === "" || cmd === "--help" || cmd === "-h") {
    help();
    return;
  }

  if (cmd === "doctor") {
    run("bash", [path.join(repoRoot, "scripts/doctor.sh")]);
    return;
  }
  if (cmd === "init") {
    const getOpt = (name, def) => {
      const i = rest.indexOf(name);
      if (i === -1) return def;
      if (i + 1 >= rest.length) throw new Error(`Missing value for ${name}`);
      return rest[i + 1];
    };
    run("bash", [
      path.join(repoRoot, "scripts/init.sh"),
      "--modules",
      getOpt("--modules", "context"),
      "--project",
      getOpt("--project", process.cwd()),
    ]);
    return;
  }
  if (cmd === "skills") {
    const sub = rest[0] || "";
    if (sub === "list") {
      run("bash", [path.join(repoRoot, "scripts/skills.sh"), "list"]);
      return;
    }
    if (sub === "install") {
      const name = rest[1];
      if (!name) throw new Error("skills install requires <name|all>");
      run("bash", [path.join(repoRoot, "scripts/skills.sh"), "install", ...rest.slice(1)]);
      return;
    }
    help();
    process.exitCode = 1;
    return;
  }
  if (cmd === "bus") {
    const sub = rest[0] || "";
    if (sub === "alert") {
      run("bash", [getPackageScript("scripts/bus-alert.sh"), ...rest.slice(1)]);
      return;
    }
    if (sub === "listen") {
      run("bash", [getPackageScript("scripts/bus-listen.sh"), ...rest.slice(1)]);
      return;
    }
    if (sub === "daemon") {
      run("bash", [getPackageScript("scripts/bus-daemon.sh"), ...rest.slice(1)]);
      return;
    }
    if (sub === "inject") {
      run("bash", [getPackageScript("scripts/bus-inject.sh"), ...rest.slice(1)]);
      return;
    }
    run("bash", [getPackageScript("scripts/bus.sh"), ...rest]);
    return;
  }
  if (cmd === "ctx") {
    const sub = rest[0] || "doctor";
    const map = {
      doctor: "scripts/context-doctor.sh",
      lint: "scripts/context-lint.sh",
      decisions: "scripts/context-decisions.sh",
    };
    const rel = map[sub];
    if (!rel) throw new Error(`Unknown ctx subcommand: ${sub}`);
    run("bash", [getPackageScript(rel), ...rest.slice(1)]);
    return;
  }

  help();
  process.exitCode = 1;
}

module.exports = { runCli };
