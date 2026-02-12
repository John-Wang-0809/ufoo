"use strict";

async function runBusCoreCommand(eventBus, cmd, cmdArgs = []) {
  switch (cmd) {
    case "init":
      await eventBus.init();
      return {};
    case "join":
      return {
        subscriber: await eventBus.join(cmdArgs[0], cmdArgs[1], cmdArgs[2]),
      };
    case "leave":
      await eventBus.leave(cmdArgs[0]);
      return {};
    case "send":
      {
        const publisher = await eventBus.ensureJoined();
        await eventBus.send(cmdArgs[0], cmdArgs[1], publisher);
      }
      return {};
    case "broadcast":
      {
        const publisher = await eventBus.ensureJoined();
        await eventBus.broadcast(cmdArgs[0], publisher);
      }
      return {};
    case "wake":
      {
        const publisher = await eventBus.ensureJoined();
        await eventBus.wake(cmdArgs[0], { publisher, reason: "remote" });
      }
      return {};
    case "check":
      await eventBus.check(cmdArgs[0]);
      return {};
    case "ack":
      await eventBus.ack(cmdArgs[0]);
      return {};
    case "consume":
      await eventBus.consume(cmdArgs[0], cmdArgs.includes("--from-beginning"));
      return {};
    case "status":
      await eventBus.status();
      return {};
    case "resolve":
      await eventBus.resolve(cmdArgs[0], cmdArgs[1]);
      return {};
    case "rename":
      await eventBus.rename(cmdArgs[0], cmdArgs[1]);
      return {};
    case "whoami":
      await eventBus.whoami();
      return {};
    default:
      throw new Error(`Unknown bus subcommand: ${cmd}`);
  }
}

module.exports = { runBusCoreCommand };
