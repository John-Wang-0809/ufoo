#!/usr/bin/env node
/* eslint-disable no-console */
const { runCli } = require("../src/cli");
const { runDaemonCli } = require("../src/daemon/run");
const { runChat } = require("../src/chat");
const { runInternalRunner } = require("../src/agent/internalRunner");

const cmd = process.argv[2];

async function main() {
  if (!cmd) {
    await runChat(process.cwd());
    return;
  }
  if (cmd === "daemon") {
    runDaemonCli(process.argv.slice(2));
    return;
  }
  if (cmd === "agent-runner") {
    const agentType = process.argv[3] || "codex";
    await runInternalRunner({ projectRoot: process.cwd(), agentType });
    return;
  }
  if (cmd === "chat") {
    await runChat(process.cwd());
    return;
  }
  await runCli(process.argv);
}

main().catch((err) => {
  const message = err && err.stack ? err.stack : String(err);
  console.error(message);
  process.exitCode = 1;
});
