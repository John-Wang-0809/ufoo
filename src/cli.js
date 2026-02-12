const path = require("path");
const { spawnSync } = require("child_process");
const net = require("net");
const fs = require("fs");
const { socketPath, isRunning } = require("./daemon");

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

function connectSocket(sockPath) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(sockPath, () => resolve(client));
    client.on("error", reject);
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

async function ensureDaemonRunning(projectRoot) {
  if (isRunning(projectRoot)) return;
  const repoRoot = getPackageRoot();
  run(process.execPath, [path.join(repoRoot, "bin", "ufoo.js"), "daemon", "start"]);
  const sock = socketPath(projectRoot);
  for (let i = 0; i < 30; i += 1) {
    if (fs.existsSync(sock)) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function sendDaemonRequest(projectRoot, payload) {
  const sock = socketPath(projectRoot);
  const client = await connectWithRetry(sock, 25, 200);
  if (!client) {
    throw new Error("Failed to connect to ufoo daemon");
  }
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      try {
        client.destroy();
      } catch {
        // ignore
      }
      reject(new Error("Daemon request timeout"));
    }, 8000);
    const cleanup = () => {
      clearTimeout(timeout);
      client.removeAllListeners();
      try {
        client.end();
      } catch {
        // ignore
      }
    };
    client.on("data", (data) => {
      buffer += data.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.type === "response" || msg.type === "error") {
          cleanup();
          if (msg.type === "error") {
            reject(new Error(msg.error || "Daemon error"));
          } else {
            resolve(msg);
          }
          return;
        }
      }
    });
    client.on("error", (err) => {
      cleanup();
      reject(err);
    });
    client.write(`${JSON.stringify(payload)}\n`);
  });
}

function requireOptional(name) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(name);
  } catch {
    return null;
  }
}

function collectOption(value, previous) {
  const next = Array.isArray(previous) ? previous.slice() : [];
  const parts = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return next.concat(parts);
}

function collectOptionValues(argv, name) {
  const values = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== name) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) continue;
    values.push(value);
    i += 1;
  }
  return values;
}

function resolveOnlineAuthToken(opts) {
  if (!opts) return "";
  if (opts.authToken) return opts.authToken;
  let tokens = null;
  try {
    // eslint-disable-next-line global-require
    tokens = require("./online/tokens");
  } catch {
    return "";
  }
  const filePath = opts.tokenFile || tokens.defaultTokensPath();
  let entry = null;
  if (opts.subscriber) entry = tokens.getToken(filePath, opts.subscriber);
  if (!entry && opts.nickname) entry = tokens.getTokenByNickname(filePath, opts.nickname);
  if (!entry) return "";
  return entry.token_hash || entry.token || "";
}

function onlineAuthHeaders(opts) {
  const token = resolveOnlineAuthToken(opts);
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
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
      .version(pkg.version, "-v, --version", "Display version with banner");

    program
      .command("doctor")
      .description("Run repo doctor checks")
      .action(() => {
        const repoRoot = getPackageRoot();
        const RepoDoctor = require("./doctor");
        const doctor = new RepoDoctor(repoRoot);
        const ok = doctor.run();
        if (!ok) process.exitCode = 1;
      });
    program
      .command("status")
      .description("Show project status (banner, unread bus, open decisions)")
      .action(async () => {
        const StatusDisplay = require("./status");
        const status = new StatusDisplay(process.cwd());
        await status.show();
      });
    program
      .command("daemon")
      .description("Start/stop ufoo daemon")
      .option("--start", "Start daemon")
      .option("--stop", "Stop daemon")
      .option("--status", "Check daemon status")
      .action((opts) => {
        const repoRoot = getPackageRoot();
        const args = ["daemon"];
        if (opts.start) args.push("start");
        else if (opts.stop) args.push("stop");
        else if (opts.status) args.push("status");
        run(process.execPath, [path.join(repoRoot, "bin", "ufoo.js"), ...args]);
      });
    program
      .command("chat")
      .description("Launch ufoo chat UI")
      .action(() => {
        const repoRoot = getPackageRoot();
        run(process.execPath, [path.join(repoRoot, "bin", "ufoo.js"), "chat"]);
      });
    program
      .command("resume")
      .description("Resume agent sessions (optional nickname)")
      .argument("[nickname]", "Nickname or subscriber ID to resume")
      .action(async (nickname) => {
        try {
          const projectRoot = process.cwd();
          await ensureDaemonRunning(projectRoot);
          const resp = await sendDaemonRequest(projectRoot, {
            type: "resume_agents",
            target: nickname || "",
          });
          const reply = resp?.data?.reply || "Resume requested";
          console.log(reply);
          if (resp?.data?.resume?.resumed?.length) {
            resp.data.resume.resumed.forEach((item) => {
              const label = item.nickname ? ` (${item.nickname})` : "";
              console.log(`  - ${item.agent}${label}`);
            });
          }
        } catch (err) {
          console.error(err.message || String(err));
          process.exitCode = 1;
        }
      });

    program
      .command("init")
      .description("Initialize modules in a project")
      .option("--modules <list>", "Comma-separated modules (context,bus,resources)", "context")
      .option("--project <dir>", "Target project directory", process.cwd())
      .action(async (opts) => {
        const UfooInit = require("./init");
        const repoRoot = getPackageRoot();
        const init = new UfooInit(repoRoot);
        try {
          await init.init(opts);
        } catch (err) {
          console.error(err.message);
          process.exitCode = 1;
        }
      });

    const skills = program.command("skills").description("Manage skills templates");
    skills
      .command("list")
      .description("List available skills")
      .action(() => {
        const SkillsManager = require("./skills");
        const repoRoot = getPackageRoot();
        const manager = new SkillsManager(repoRoot);
        const skillsList = manager.list();
        skillsList.forEach((skill) => console.log(skill));
      });
    skills
      .command("install")
      .description("Install one skill or all skills")
      .argument("<name>", "Skill name or 'all'")
      .option("--target <dir>", "Install target directory")
      .option("--codex", "Install into ~/.codex/skills")
      .option("--agents", "Install into ~/.agents/skills")
      .action(async (name, opts) => {
        const SkillsManager = require("./skills");
        const repoRoot = getPackageRoot();
        const manager = new SkillsManager(repoRoot);
        try {
          await manager.install(name, opts);
        } catch (err) {
          console.error(err.message);
          process.exitCode = 1;
        }
      });

    const online = program.command("online").description("ufoo online helpers");
    online
      .command("server")
      .description("Start ufoo-online relay server")
      .option("--port <port>", "Listen port", "8787")
      .option("--host <host>", "Listen host", "127.0.0.1")
      .option("--token-file <path>", "Token file for auth validation")
      .option("--idle-timeout <ms>", "Idle timeout in ms", "30000")
      .option("--insecure", "Allow any token (dev only)")
      .option("--tls-cert <path>", "TLS certificate file")
      .option("--tls-key <path>", "TLS private key file")
      .action(async (opts) => {
        const OnlineServer = require("./online/server");
        const server = new OnlineServer({
          host: opts.host,
          port: parseInt(opts.port, 10),
          tokenFile: opts.tokenFile || undefined,
          idleTimeoutMs: parseInt(opts.idleTimeout, 10),
          insecure: opts.insecure || false,
          tlsCert: opts.tlsCert || null,
          tlsKey: opts.tlsKey || null,
        });
        try {
          const isTls = !!(opts.tlsCert && opts.tlsKey);
          const wsProto = isTls ? "wss" : "ws";
          const httpProto = isTls ? "https" : "http";
          await server.start();
          console.log(`ufoo-online relay listening on ${opts.host}:${server.port}`);
          console.log(`  WebSocket: ${wsProto}://${opts.host}:${server.port}/ufoo/online`);
          console.log(`  HTTP API:  ${httpProto}://${opts.host}:${server.port}/ufoo/online/rooms`);
          console.log(`             ${httpProto}://${opts.host}:${server.port}/ufoo/online/channels`);
          if (server.insecure) console.log(`  Auth: INSECURE mode (any token accepted)`);
          if (isTls) console.log(`  TLS: enabled`);
        } catch (err) {
          console.error(err.message || String(err));
          process.exitCode = 1;
        }
      });
    online
      .command("token")
      .description("Generate and store a ufoo-online token")
      .argument("<subscriber>", "Subscriber ID (e.g., claude-code:abc123)")
      .option("--nickname <name>", "Nickname for this agent")
      .option("--server <url>", "Online server URL")
      .option("--file <path>", "Tokens file path")
      .action((subscriber, opts) => {
        try {
          const { generateToken, setToken, defaultTokensPath } = require("./online/tokens");
          const filePath = opts.file || defaultTokensPath();
          const token = generateToken();
          const entry = setToken(filePath, subscriber, token, opts.server || "", {
            nickname: opts.nickname || "",
          });
          console.log(JSON.stringify({
            subscriber,
            token,
            token_hash: entry.token_hash,
            server: entry.server,
            nickname: entry.nickname,
            file: filePath,
          }, null, 2));
        } catch (err) {
          console.error(err.message || String(err));
          process.exitCode = 1;
        }
      });

    online
      .command("room")
      .description("Manage online rooms (HTTP)")
      .argument("<action>", "create|list")
      .option("--server <url>", "Online server base URL (http://host:port)")
      .option("--auth-token <token>", "Bearer token for HTTP auth (token or token_hash)")
      .option("--token-file <path>", "Token file path for auth lookup")
      .option("--subscriber <id>", "Subscriber ID to resolve token")
      .option("--nickname <name>", "Nickname to resolve token")
      .option("--name <room>", "Room name (optional)")
      .option("--type <type>", "Room type (public|private)")
      .option("--password <pwd>", "Room password (private only)")
      .action(async (action, opts) => {
        const base = opts.server || "http://127.0.0.1:8787";
        const endpoint = `${base.replace(/\/$/, "")}/ufoo/online/rooms`;
        try {
          const authHeaders = onlineAuthHeaders(opts);
          if (action === "list") {
            const res = await fetch(endpoint, {
              headers: { ...authHeaders },
            });
            const data = await res.json();
            console.log(JSON.stringify(data, null, 2));
            return;
          }
          if (action === "create") {
            const payload = {
              name: opts.name,
              type: opts.type,
              password: opts.password,
            };
            if (!payload.type) {
              console.error("online room create requires --type");
              process.exitCode = 1;
              return;
            }
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            console.log(JSON.stringify(data, null, 2));
            return;
          }
          console.error("online room requires action create|list");
          process.exitCode = 1;
        } catch (err) {
          console.error(err.message || String(err));
          process.exitCode = 1;
        }
      });

    online
      .command("channel")
      .description("Manage online channels (HTTP)")
      .argument("<action>", "create|list")
      .option("--server <url>", "Online server base URL (http://host:port)")
      .option("--auth-token <token>", "Bearer token for HTTP auth (token or token_hash)")
      .option("--token-file <path>", "Token file path for auth lookup")
      .option("--subscriber <id>", "Subscriber ID to resolve token")
      .option("--nickname <name>", "Nickname to resolve token")
      .option("--name <name>", "Channel name (unique)")
      .option("--type <type>", "Channel type (world|public)")
      .action(async (action, opts) => {
        const base = opts.server || "http://127.0.0.1:8787";
        const endpoint = `${base.replace(/\/$/, "")}/ufoo/online/channels`;
        try {
          const authHeaders = onlineAuthHeaders(opts);
          if (action === "list") {
            const res = await fetch(endpoint, {
              headers: { ...authHeaders },
            });
            const data = await res.json();
            console.log(JSON.stringify(data, null, 2));
            return;
          }
          if (action === "create") {
            const payload = {
              name: opts.name,
              type: opts.type,
            };
            if (!payload.name) {
              console.error("online channel create requires --name");
              process.exitCode = 1;
              return;
            }
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            console.log(JSON.stringify(data, null, 2));
            return;
          }
          console.error("online channel requires action create|list");
          process.exitCode = 1;
        } catch (err) {
          console.error(err.message || String(err));
          process.exitCode = 1;
        }
      });

    online
      .command("connect")
      .description("Connect to ufoo-online relay (long-running)")
      .requiredOption("--nickname <name>", "Agent nickname")
      .option("--url <url>", "WebSocket URL", "ws://127.0.0.1:8787/ufoo/online")
      .option("--subscriber <id>", "Subscriber ID (auto-generated if omitted)")
      .option("--token <tok>", "Auth token")
      .option("--token-hash <hash>", "Auth token hash")
      .option("--token-file <path>", "Token file path")
      .option("--world <name>", "World name", "default")
      .option("--ping-ms <ms>", "Keepalive ping interval (ms)")
      .option("--join <channel>", "Join channel after connect")
      .option("--room <room>", "Join private room (enables bus/decisions/wake sync)")
      .option("--room-password <pwd>", "Room password")
      .option("--interval <ms>", "Bus sync poll interval in ms", "1500")
      .option("--allow-insecure-ws", "Allow ws:// to non-localhost (insecure)")
      .option("--trust-remote", "Trust all private-room members for bus/decisions/wake sync")
      .option("--allow-from <subscriberId>", "Allow bus/decisions/wake from subscriber ID (repeatable)", collectOption)
      .action(async (opts) => {
        const OnlineConnect = require("./online/bridge");
        const conn = new OnlineConnect({
          projectRoot: process.cwd(),
          nickname: opts.nickname,
          subscriberId: opts.subscriber || "",
          url: opts.url,
          token: opts.token || "",
          tokenHash: opts.tokenHash || "",
          tokenFile: opts.tokenFile || "",
          world: opts.world,
          pingMs: opts.pingMs ? parseInt(opts.pingMs, 10) : 0,
          channel: opts.join || "",
          room: opts.room || "",
          roomPassword: opts.roomPassword || "",
          pollIntervalMs: opts.interval ? parseInt(opts.interval, 10) : 1500,
          allowInsecureWs: !!opts.allowInsecureWs,
          trustRemote: !!opts.trustRemote,
          allowFrom: opts.allowFrom || [],
        });
        try {
          await conn.start();
        } catch (err) {
          console.error(err.message || String(err));
          process.exitCode = 1;
        }
      });

    online
      .command("send")
      .description("Send a message to a channel or room via outbox")
      .requiredOption("--nickname <name>", "Agent nickname (must match a running connect)")
      .requiredOption("--text <message>", "Message text")
      .option("--channel <name>", "Target channel")
      .option("--room <id>", "Target room")
      .action((opts) => {
        const { send } = require("./online/runner");
        send(opts.nickname, {
          text: opts.text,
          channel: opts.channel || "",
          room: opts.room || "",
        });
      });

    online
      .command("inbox")
      .description("View ufoo-online inbox for a nickname")
      .argument("<nickname>", "Agent nickname")
      .option("--clear", "Clear the inbox")
      .option("--unread", "Show unread messages only")
      .action((nickname, opts) => {
        const { checkInbox } = require("./online/runner");
        try {
          checkInbox(nickname, { clear: opts.clear, unread: opts.unread });
        } catch (err) {
          console.error(err.message || String(err));
          process.exitCode = 1;
        }
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
        const EventBus = require("./bus");
        const eventBus = new EventBus(process.cwd());
        const parsedInterval = parseInt(interval, 10);
        eventBus
          .alert(subscriber, Number.isFinite(parsedInterval) ? parsedInterval : 2, {
            notify: opts.notify,
            daemon: opts.daemon,
            stop: opts.stop,
            title: opts.title !== false,
            bell: opts.bell !== false,
          })
          .catch((err) => {
            console.error(err.message);
            process.exitCode = 1;
          });
      });
    bus
      .command("listen")
      .description("Foreground listener for incoming messages")
      .argument("[subscriber]", "Subscriber ID")
      .option("--from-beginning", "Print existing queued messages first")
      .option("--reset", "Truncate pending queue before listening")
      .option("--auto-join", "Auto-join bus to get subscriber ID")
      .action((subscriber, opts) => {
        const EventBus = require("./bus");
        const eventBus = new EventBus(process.cwd());
        eventBus
          .listen(subscriber, {
            fromBeginning: opts.fromBeginning,
            reset: opts.reset,
            autoJoin: opts.autoJoin,
          })
          .catch((err) => {
            console.error(err.message);
            process.exitCode = 1;
          });
      });
    bus
      .command("daemon")
      .description("Start/stop daemon that auto-injects /bus into terminals")
      .option("--interval <n>", "Poll interval in seconds", "2")
      .option("--daemon", "Run in background")
      .option("--stop", "Stop running daemon")
      .option("--status", "Check daemon status")
      .action((opts) => {
        const EventBus = require("./bus");
        const eventBus = new EventBus(process.cwd());
        (async () => {
          try {
            const interval = parseInt(opts.interval, 10) * 1000 || 2000;
            if (opts.stop) {
              await eventBus.daemon("stop");
            } else if (opts.status) {
              await eventBus.daemon("status");
            } else {
              await eventBus.daemon("start", { background: opts.daemon, interval });
            }
          } catch (err) {
            console.error(err.message);
            process.exitCode = 1;
          }
        })();
      });
    bus
      .command("inject")
      .description("Inject /bus into a Terminal.app tab by subscriber ID")
      .argument("<subscriber>", "Subscriber ID to inject into")
      .action((subscriber) => {
        const EventBus = require("./bus");
        const eventBus = new EventBus(process.cwd());
        (async () => {
          try {
            await eventBus.inject(subscriber);
          } catch (err) {
            console.error(err.message);
            process.exitCode = 1;
          }
        })();
      });
    bus
      .command("wake")
      .description("Wake an agent (inject /ubus into its terminal)")
      .argument("<target>", "Subscriber ID or nickname")
      .option("--reason <reason>", "Wake reason")
      .option("--no-shake", "Disable window shake")
      .action((target, opts) => {
        const EventBus = require("./bus");
        const eventBus = new EventBus(process.cwd());
        (async () => {
          try {
            await eventBus.wake(target, { reason: opts.reason || "remote", shake: opts.shake !== false });
          } catch (err) {
            console.error(err.message || String(err));
            process.exitCode = 1;
          }
        })();
      });
    bus
      .command("activate")
      .description("Activate (focus) the terminal/tmux window of an agent")
      .argument("<agent-id>", "Agent ID or nickname to activate")
      .action((agentId) => {
        const AgentActivator = require("./bus/activate");
        const activator = new AgentActivator(process.cwd());
        (async () => {
          try {
            await activator.activate(agentId);
          } catch (err) {
            console.error(err.message);
            process.exitCode = 1;
          }
        })();
      });
    bus
      .command("run", { isDefault: true })
      .description("Run bus commands (join, check, send, status, etc.)")
      .allowUnknownOption(true)
      .argument("<args...>", "Arguments passed to bus module")
      .action(async (args) => {
        const EventBus = require("./bus");
        const eventBus = new EventBus(process.cwd());
        const cmd = args[0];
        const cmdArgs = args.slice(1);

        try {
          switch (cmd) {
            case "init":
              await eventBus.init();
              break;
            case "join":
              {
                const subscriber = await eventBus.join(cmdArgs[0], cmdArgs[1], cmdArgs[2]);
                if (subscriber) console.log(subscriber);
              }
              break;
            case "leave":
              await eventBus.leave(cmdArgs[0]);
              break;
            case "send":
              {
                // 自动 join（如果还没有 join）并获取 subscriber ID
                const publisher = await eventBus.ensureJoined();
                await eventBus.send(cmdArgs[0], cmdArgs[1], publisher);
              }
              break;
            case "broadcast":
              {
                // 自动 join（如果还没有 join）并获取 subscriber ID
                const publisher = await eventBus.ensureJoined();
                await eventBus.broadcast(cmdArgs[0], publisher);
              }
              break;
            case "wake":
              {
                const publisher = await eventBus.ensureJoined();
                await eventBus.wake(cmdArgs[0], { publisher, reason: "remote" });
              }
              break;
            case "check":
              await eventBus.check(cmdArgs[0]);
              break;
            case "ack":
              await eventBus.ack(cmdArgs[0]);
              break;
            case "consume":
              await eventBus.consume(cmdArgs[0], cmdArgs.includes("--from-beginning"));
              break;
            case "status":
              await eventBus.status();
              break;
            case "resolve":
              await eventBus.resolve(cmdArgs[0], cmdArgs[1]);
              break;
            case "rename":
              await eventBus.rename(cmdArgs[0], cmdArgs[1]);
              break;
            case "whoami":
              await eventBus.whoami();
              break;
            default:
              console.error(`Unknown bus subcommand: ${cmd}`);
              process.exitCode = 1;
          }
        } catch (err) {
          console.error(err.message);
          process.exitCode = 1;
        }
      });

    program
      .command("ctx")
      .description("Project context commands (doctor|lint|decisions)")
      .argument("[subcmd]", "Subcommand (doctor|lint|decisions)", "doctor")
      .allowUnknownOption(true)
      .argument("[subargs...]", "Subcommand args")
      .action(async (subcmd, subargs = []) => {
        const DecisionsManager = require("./context/decisions");
        const ContextDoctor = require("./context/doctor");
        const cwd = process.cwd();

        try {
          switch (subcmd) {
            case "doctor": {
              const doctor = new ContextDoctor(cwd);
              const mode = subargs.includes("--project") ? "project" : "protocol";
              const projectPath = mode === "project" ? subargs[subargs.indexOf("--project") + 1] : null;
              await doctor.run({ mode, projectPath });
              break;
            }
            case "lint": {
              const doctor = new ContextDoctor(cwd);
              const mode = subargs.includes("--project") ? "project" : "protocol";
              const projectPath = mode === "project" ? subargs[subargs.indexOf("--project") + 1] : null;
              if (mode === "project") {
                doctor.lintProject(projectPath);
              } else {
                doctor.lintProtocol();
              }
              break;
            }
            case "decisions": {
              const manager = new DecisionsManager(cwd);
              const opts = {};

              if (subargs[0] === "index" || subargs.includes("--index")) {
                manager.writeIndex();
                break;
              }
              if (subargs[0] === "new") {
                const create = { title: "", author: "", status: "", nickname: "" };
                for (let i = 1; i < subargs.length; i++) {
                  const arg = subargs[i];
                  if (arg === "--author") {
                    create.author = subargs[++i] || "";
                    continue;
                  }
                  if (arg === "--status") {
                    create.status = subargs[++i] || "";
                    continue;
                  }
                  if (arg === "--nickname") {
                    create.nickname = subargs[++i] || "";
                    continue;
                  }
                  if (!arg.startsWith("-")) {
                    create.title = create.title ? `${create.title} ${arg}` : arg;
                    continue;
                  }
                }
                manager.createDecision(create);
                break;
              }

              // Parse options
              for (let i = 0; i < subargs.length; i++) {
                if (subargs[i] === "-n") opts.num = parseInt(subargs[++i]);
                if (subargs[i] === "-s") opts.status = subargs[++i];
                if (subargs[i] === "-l") opts.listOnly = true;
                if (subargs[i] === "-a") opts.all = true;
                if (subargs[i] === "-d") {
                  manager.decisionsDir = subargs[++i];
                  manager.contextDir = path.dirname(manager.decisionsDir);
                  manager.indexFile = path.join(manager.contextDir, "decisions.jsonl");
                }
              }

              if (opts.listOnly) {
                manager.list({ status: opts.status || "open" });
              } else {
                manager.show({
                  status: opts.status || "open",
                  num: opts.num || 1,
                  all: opts.all || false,
                });
              }
              break;
            }
            default:
              console.error(
                chalk.red(
                  `Unknown ctx subcommand: ${subcmd}. Supported: doctor, lint, decisions`
                )
              );
              process.exitCode = 1;
          }
        } catch (err) {
          console.error(chalk.red(`Error: ${err.message}`));
          process.exitCode = 1;
        }
      });

    program.addHelpText(
      "after",
      `\nNotes:\n  - If 'ufoo' isn't in PATH, run it via ${chalk.cyan(
        "./bin/ufoo"
      )} (repo) or install globally via npm.\n  - For bus notifications inside Codex, prefer ${chalk.cyan(
        "ufoo bus alert"
      )} / ${chalk.cyan("ufoo bus listen")} (no IME issues).\n`
    );

    // 检查是否是 --version 或 -V 参数
    if (argv.includes("--version") || argv.includes("-V")) {
      const { showUfooBanner } = require("./utils/banner");
      showUfooBanner({ version: pkg.version });
      return;
    }

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
    console.log("  ufoo status");
    console.log("  ufoo daemon --start|--stop|--status");
    console.log("  ufoo chat");
    console.log("  ufoo resume [nickname]");
    console.log("  ufoo init [--modules <list>] [--project <dir>]");
    console.log("  ufoo skills list");
    console.log("  ufoo skills install <name|all> [--target <dir> | --codex | --agents]");
    console.log("  ufoo online server [--port 8787] [--host 127.0.0.1] [--token-file <path>]");
    console.log("  ufoo online token <subscriber> [--nickname <name>] [--server <url>] [--file <path>]");
    console.log("  ufoo online room create [--name <room>] --type public|private [--password <pwd>] [--server <url>]");
    console.log("  ufoo online room list [--server <url>]");
    console.log("  ufoo online channel create --name <name> [--type world|public] [--server <url>]");
    console.log("  ufoo online channel list [--server <url>]");
    console.log("  ufoo online connect --nickname <name> [--join <ch>] [--room <id> --room-password <pwd>] [...]");
    console.log("  ufoo online send --nickname <name> --text <msg> [--channel <ch>] [--room <id>]");
    console.log("  ufoo online inbox <nickname> [--clear] [--unread]");
    console.log("  ufoo bus wake <target> [--reason <reason>] [--no-shake]");
    console.log("  ufoo bus <args...>    (JS bus implementation)");
    console.log("  ufoo ctx <subcmd> ... (doctor|lint|decisions)");
    console.log("");
    console.log("Notes:");
    console.log("  - For Codex notifications, use ufoo bus alert / ufoo bus listen");
  };

  if (cmd === "" || cmd === "--help" || cmd === "-h") {
    help();
    return;
  }

  if (cmd === "--version" || cmd === "-V") {
    const { showUfooBanner } = require("./utils/banner");
    showUfooBanner({ version: pkg.version });
    return;
  }

  if (cmd === "doctor") {
    const RepoDoctor = require("./doctor");
    const doctor = new RepoDoctor(repoRoot);
    const ok = doctor.run();
    if (!ok) process.exitCode = 1;
    return;
  }
  if (cmd === "status") {
    const StatusDisplay = require("./status");
    const status = new StatusDisplay(process.cwd());
    status.show().catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
    return;
  }
  if (cmd === "daemon") {
    run(process.execPath, [path.join(repoRoot, "bin", "ufoo.js"), "daemon", ...rest]);
    return;
  }
  if (cmd === "chat") {
    run(process.execPath, [path.join(repoRoot, "bin", "ufoo.js"), "chat"]);
    return;
  }
  if (cmd === "resume") {
    const nickname = rest[0] || "";
    (async () => {
      try {
        const projectRoot = process.cwd();
        await ensureDaemonRunning(projectRoot);
        const resp = await sendDaemonRequest(projectRoot, {
          type: "resume_agents",
          target: nickname,
        });
        const reply = resp?.data?.reply || "Resume requested";
        console.log(reply);
      } catch (err) {
        console.error(err.message || String(err));
        process.exitCode = 1;
      }
    })();
    return;
  }
  if (cmd === "init") {
    const UfooInit = require("./init");
    const init = new UfooInit(repoRoot);

    const getOpt = (name, def) => {
      const i = rest.indexOf(name);
      if (i === -1) return def;
      if (i + 1 >= rest.length) throw new Error(`Missing value for ${name}`);
      return rest[i + 1];
    };

    const opts = {
      modules: getOpt("--modules", "context"),
      project: getOpt("--project", process.cwd()),
    };

    init.init(opts).catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
    return;
  }
  if (cmd === "skills") {
    const SkillsManager = require("./skills");
    const manager = new SkillsManager(repoRoot);
    const sub = rest[0] || "";

    if (sub === "list") {
      const skillsList = manager.list();
      skillsList.forEach((skill) => console.log(skill));
      return;
    }
    if (sub === "install") {
      const name = rest[1];
      if (!name) throw new Error("skills install requires <name|all>");

      const options = {};
      for (let i = 2; i < rest.length; i++) {
        if (rest[i] === "--target" && i + 1 < rest.length) {
          options.target = rest[i + 1];
          i++;
        } else if (rest[i] === "--codex") {
          options.codex = true;
        } else if (rest[i] === "--agents") {
          options.agents = true;
        }
      }

      manager.install(name, options).catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
      });
      return;
    }
    help();
    process.exitCode = 1;
    return;
  }
  if (cmd === "online") {
    const sub = rest[0] || "";
    if (sub === "server") {
      const getOpt = (name) => {
        const i = rest.indexOf(name);
        if (i === -1) return "";
        return rest[i + 1] || "";
      };
      const hasFlag = (name) => rest.includes(name);
      const OnlineServer = require("./online/server");
      const tlsCert = getOpt("--tls-cert") || null;
      const tlsKey = getOpt("--tls-key") || null;
      const server = new OnlineServer({
        host: getOpt("--host") || "127.0.0.1",
        port: parseInt(getOpt("--port") || "8787", 10),
        tokenFile: getOpt("--token-file") || undefined,
        idleTimeoutMs: parseInt(getOpt("--idle-timeout") || "30000", 10),
        insecure: hasFlag("--insecure"),
        tlsCert,
        tlsKey,
      });
      const isTls = !!(tlsCert && tlsKey);
      const wsProto = isTls ? "wss" : "ws";
      const httpProto = isTls ? "https" : "http";
      server.start().then(() => {
        console.log(`ufoo-online relay listening on ${server.host}:${server.port}`);
        console.log(`  WebSocket: ${wsProto}://${server.host}:${server.port}/ufoo/online`);
        console.log(`  HTTP API:  ${httpProto}://${server.host}:${server.port}/ufoo/online/rooms`);
        console.log(`             ${httpProto}://${server.host}:${server.port}/ufoo/online/channels`);
        if (server.insecure) console.log(`  Auth: INSECURE mode (any token accepted)`);
        if (isTls) console.log(`  TLS: enabled`);
      }).catch((err) => {
        console.error(err.message || String(err));
        process.exitCode = 1;
      });
      return;
    }
    if (sub === "token") {
      const subscriber = rest[1];
      if (!subscriber) {
        console.error("online token requires <subscriber>");
        process.exitCode = 1;
        return;
      }
      const getOpt = (name) => {
        const i = rest.indexOf(name);
        if (i === -1) return "";
        return rest[i + 1] || "";
      };
      try {
        const { generateToken, setToken, defaultTokensPath } = require("./online/tokens");
        const filePath = getOpt("--file") || defaultTokensPath();
        const token = generateToken();
        const entry = setToken(filePath, subscriber, token, getOpt("--server"), {
          nickname: getOpt("--nickname"),
        });
        console.log(JSON.stringify({
          subscriber,
          token,
          token_hash: entry.token_hash,
          server: entry.server,
          nickname: entry.nickname,
          file: filePath,
        }, null, 2));
      } catch (err) {
        console.error(err.message || String(err));
        process.exitCode = 1;
      }
      return;
    }
    if (sub === "room") {
      const action = rest[1] || "";
      const getOpt = (name) => {
        const i = rest.indexOf(name);
        if (i === -1) return "";
        return rest[i + 1] || "";
      };
      const base = getOpt("--server") || "http://127.0.0.1:8787";
      const endpoint = `${base.replace(/\/$/, "")}/ufoo/online/rooms`;
      const authHeaders = onlineAuthHeaders({
        authToken: getOpt("--auth-token"),
        tokenFile: getOpt("--token-file"),
        subscriber: getOpt("--subscriber"),
        nickname: getOpt("--nickname"),
      });
      (async () => {
        try {
          if (action === "list") {
            const res = await fetch(endpoint, { headers: authHeaders });
            const data = await res.json();
            console.log(JSON.stringify(data, null, 2));
            return;
          }
          if (action === "create") {
            const payload = {
              name: getOpt("--name"),
              type: getOpt("--type"),
              password: getOpt("--password"),
            };
            if (!payload.type) {
              console.error("online room create requires --type");
              process.exitCode = 1;
              return;
            }
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            console.log(JSON.stringify(data, null, 2));
            return;
          }
          console.error("online room requires action create|list");
          process.exitCode = 1;
        } catch (err) {
          console.error(err.message || String(err));
          process.exitCode = 1;
        }
      })();
      return;
    }
    if (sub === "channel") {
      const action = rest[1] || "";
      const getOpt = (name) => {
        const i = rest.indexOf(name);
        if (i === -1) return "";
        return rest[i + 1] || "";
      };
      const base = getOpt("--server") || "http://127.0.0.1:8787";
      const endpoint = `${base.replace(/\/$/, "")}/ufoo/online/channels`;
      const authHeaders = onlineAuthHeaders({
        authToken: getOpt("--auth-token"),
        tokenFile: getOpt("--token-file"),
        subscriber: getOpt("--subscriber"),
        nickname: getOpt("--nickname"),
      });
      (async () => {
        try {
          if (action === "list") {
            const res = await fetch(endpoint, { headers: authHeaders });
            const data = await res.json();
            console.log(JSON.stringify(data, null, 2));
            return;
          }
          if (action === "create") {
            const payload = {
              name: getOpt("--name"),
              type: getOpt("--type") || "public",
            };
            if (!payload.name) {
              console.error("online channel create requires --name");
              process.exitCode = 1;
              return;
            }
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            console.log(JSON.stringify(data, null, 2));
            return;
          }
          console.error("online channel requires action create|list");
          process.exitCode = 1;
        } catch (err) {
          console.error(err.message || String(err));
          process.exitCode = 1;
        }
      })();
      return;
    }
    if (sub === "connect") {
      const getOpt = (name) => {
        const i = rest.indexOf(name);
        if (i === -1) return "";
        return rest[i + 1] || "";
      };
      const hasFlag = (name) => rest.includes(name);
      const nickname = getOpt("--nickname");
      if (!nickname) {
        console.error("online connect requires --nickname");
        process.exitCode = 1;
        return;
      }
      const allowFrom = collectOptionValues(rest, "--allow-from")
        .reduce((acc, value) => collectOption(value, acc), []);
      const OnlineConnect = require("./online/bridge");
      const conn = new OnlineConnect({
        projectRoot: process.cwd(),
        nickname,
        subscriberId: getOpt("--subscriber"),
        url: getOpt("--url") || "ws://127.0.0.1:8787/ufoo/online",
        token: getOpt("--token"),
        tokenHash: getOpt("--token-hash"),
        tokenFile: getOpt("--token-file"),
        world: getOpt("--world") || "default",
        pingMs: getOpt("--ping-ms") ? parseInt(getOpt("--ping-ms"), 10) : 0,
        channel: getOpt("--join"),
        room: getOpt("--room"),
        roomPassword: getOpt("--room-password"),
        pollIntervalMs: getOpt("--interval") ? parseInt(getOpt("--interval"), 10) : 1500,
        allowInsecureWs: hasFlag("--allow-insecure-ws"),
        trustRemote: hasFlag("--trust-remote"),
        allowFrom,
      });
      conn.start().catch((err) => {
        console.error(err.message || String(err));
        process.exitCode = 1;
      });
      return;
    }
    if (sub === "send") {
      const getOpt = (name) => {
        const i = rest.indexOf(name);
        if (i === -1) return "";
        return rest[i + 1] || "";
      };
      const nickname = getOpt("--nickname");
      const text = getOpt("--text");
      if (!nickname || !text) {
        console.error("online send requires --nickname and --text");
        process.exitCode = 1;
        return;
      }
      const { send } = require("./online/runner");
      send(nickname, {
        text,
        channel: getOpt("--channel"),
        room: getOpt("--room"),
      });
      return;
    }
    if (sub === "inbox") {
      const nickname = rest[1];
      if (!nickname || nickname.startsWith("--")) {
        console.error("online inbox requires <nickname>");
        process.exitCode = 1;
        return;
      }
      const { checkInbox } = require("./online/runner");
      try {
        checkInbox(nickname, {
          clear: rest.includes("--clear"),
          unread: rest.includes("--unread"),
        });
      } catch (err) {
        console.error(err.message || String(err));
        process.exitCode = 1;
      }
      return;
    }
    help();
    process.exitCode = 1;
    return;
  }
  if (cmd === "bus") {
    const sub = rest[0] || "";
    if (sub === "alert") {
      const EventBus = require("./bus");
      const eventBus = new EventBus(process.cwd());
      const args = rest.slice(1);
      const subscriber = args[0];
      let interval = 2;
      let idx = 1;
      if (args[1] && /^[0-9]+$/.test(args[1])) {
        interval = parseInt(args[1], 10);
        idx = 2;
      }
      const options = {
        notify: args.includes("--notify"),
        daemon: args.includes("--daemon"),
        stop: args.includes("--stop"),
        title: !args.includes("--no-title"),
        bell: !args.includes("--no-bell"),
      };
      eventBus
        .alert(subscriber, interval, options)
        .catch((err) => {
          console.error(err.message);
          process.exitCode = 1;
        });
      return;
    }
    if (sub === "listen") {
      const EventBus = require("./bus");
      const eventBus = new EventBus(process.cwd());
      const args = rest.slice(1);
      const subscriber = args.find((arg) => !arg.startsWith("--"));
      const options = {
        fromBeginning: args.includes("--from-beginning"),
        reset: args.includes("--reset"),
        autoJoin: args.includes("--auto-join"),
      };
      eventBus
        .listen(subscriber, options)
        .catch((err) => {
          console.error(err.message);
          process.exitCode = 1;
        });
      return;
    }
    if (sub === "daemon") {
      // 使用 JavaScript daemon
      const EventBus = require("./bus");
      const eventBus = new EventBus(process.cwd());

      (async () => {
        try {
          const hasStop = rest.includes("--stop");
          const hasStatus = rest.includes("--status");
          const hasDaemon = rest.includes("--daemon");
          const intervalIdx = rest.indexOf("--interval");
          const interval = intervalIdx !== -1 ? parseInt(rest[intervalIdx + 1], 10) * 1000 : 2000;

          if (hasStop) {
            await eventBus.daemon("stop");
          } else if (hasStatus) {
            await eventBus.daemon("status");
          } else {
            await eventBus.daemon("start", { background: hasDaemon, interval });
          }
        } catch (err) {
          console.error(err.message);
          process.exitCode = 1;
        }
      })();
      return;
    }
    if (sub === "inject") {
      // 使用 JavaScript inject
      const EventBus = require("./bus");
      const eventBus = new EventBus(process.cwd());

      (async () => {
        try {
          const subscriber = rest[1];
          if (!subscriber) {
            throw new Error("inject requires <subscriber-id>");
          }
          await eventBus.inject(subscriber);
        } catch (err) {
          console.error(err.message);
          process.exitCode = 1;
        }
      })();
      return;
    }
    if (sub === "wake") {
      const EventBus = require("./bus");
      const eventBus = new EventBus(process.cwd());
      (async () => {
        try {
          const target = rest[1];
          if (!target) throw new Error("wake requires <subscriber-id|nickname>");
          const reasonIdx = rest.indexOf("--reason");
          const reason = reasonIdx !== -1 ? rest[reasonIdx + 1] : "remote";
          const shake = !rest.includes("--no-shake");
          await eventBus.wake(target, { reason, shake });
        } catch (err) {
          console.error(err.message || String(err));
          process.exitCode = 1;
        }
      })();
      return;
    }

    // Use JavaScript EventBus module for core commands
    const EventBus = require("./bus");
    const eventBus = new EventBus(process.cwd());

    (async () => {
      try {
        const cmdArgs = rest.slice(1);
        switch (sub) {
          case "init":
            await eventBus.init();
            break;
          case "join":
            {
              const subscriber = await eventBus.join(cmdArgs[0], cmdArgs[1], cmdArgs[2]);
              if (subscriber) console.log(subscriber);
            }
            break;
          case "leave":
            await eventBus.leave(cmdArgs[0]);
            break;
          case "send":
            {
              // 自动 join（如果还没有 join）并获取 subscriber ID
              const publisher = await eventBus.ensureJoined();
              await eventBus.send(cmdArgs[0], cmdArgs[1], publisher);
            }
            break;
          case "broadcast":
            {
              // 自动 join（如果还没有 join）并获取 subscriber ID
              const publisher = await eventBus.ensureJoined();
              await eventBus.broadcast(cmdArgs[0], publisher);
            }
            break;
          case "wake":
            {
              const publisher = await eventBus.ensureJoined();
              await eventBus.wake(cmdArgs[0], { publisher, reason: "remote" });
            }
            break;
          case "check":
            await eventBus.check(cmdArgs[0]);
            break;
          case "ack":
            await eventBus.ack(cmdArgs[0]);
            break;
          case "consume":
            await eventBus.consume(cmdArgs[0], cmdArgs.includes("--from-beginning"));
            break;
          case "status":
            await eventBus.status();
            break;
          case "resolve":
            await eventBus.resolve(cmdArgs[0], cmdArgs[1]);
            break;
          case "rename":
            await eventBus.rename(cmdArgs[0], cmdArgs[1]);
            break;
          case "whoami":
            await eventBus.whoami();
            break;
          default:
            console.error(`Unknown bus subcommand: ${sub}`);
            process.exitCode = 1;
        }
      } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
      }
    })();
    return;
  }
  if (cmd === "ctx") {
    const sub = rest[0] || "doctor";
    const subargs = rest.slice(1);
    const DecisionsManager = require("./context/decisions");
    const ContextDoctor = require("./context/doctor");
    const cwd = process.cwd();

    (async () => {
      try {
        switch (sub) {
          case "doctor": {
            const doctor = new ContextDoctor(cwd);
            const mode = subargs.includes("--project") ? "project" : "protocol";
            const projectPath = mode === "project" ? subargs[subargs.indexOf("--project") + 1] : null;
            await doctor.run({ mode, projectPath });
            break;
          }
          case "lint": {
            const doctor = new ContextDoctor(cwd);
            const mode = subargs.includes("--project") ? "project" : "protocol";
            const projectPath = mode === "project" ? subargs[subargs.indexOf("--project") + 1] : null;
            if (mode === "project") {
              doctor.lintProject(projectPath);
            } else {
              doctor.lintProtocol();
            }
            break;
          }
          case "decisions": {
            const manager = new DecisionsManager(cwd);
            const opts = {};

            for (let i = 0; i < subargs.length; i++) {
              if (subargs[i] === "-n") opts.num = parseInt(subargs[++i]);
              if (subargs[i] === "-s") opts.status = subargs[++i];
              if (subargs[i] === "-l") opts.listOnly = true;
              if (subargs[i] === "-a") opts.all = true;
              if (subargs[i] === "-d") manager.decisionsDir = subargs[++i];
              if (subargs[i] === "--nickname") opts.nickname = subargs[++i];
            }

            if (opts.listOnly) {
              manager.list({ status: opts.status || "open" });
            } else {
              manager.show({
                status: opts.status || "open",
                num: opts.num || 1,
                all: opts.all || false,
              });
            }
            break;
          }
          default:
            throw new Error(`Unknown ctx subcommand: ${sub}`);
        }
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    })();
    return;
  }

  help();
  process.exitCode = 1;
}

module.exports = { runCli };
