const fs = require("fs");
const os = require("os");
const path = require("path");
const BusDaemon = require("../../../src/bus/daemon");

function safeName(subscriber) {
  return subscriber.replace(/:/g, "_");
}

function writePending(busDir, subscriber, events) {
  const queueDir = path.join(busDir, "queues", safeName(subscriber));
  fs.mkdirSync(queueDir, { recursive: true });
  const file = path.join(queueDir, "pending.jsonl");
  const lines = events.map((evt) => JSON.stringify(evt)).join("\n");
  fs.writeFileSync(file, `${lines}\n`, "utf8");
}

describe("BusDaemon delivery ownership", () => {
  let tmpDir;
  let busDir;
  let daemonDir;
  let agentsFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ufoo-bus-daemon-"));
    busDir = path.join(tmpDir, "bus");
    daemonDir = path.join(tmpDir, "daemon");
    agentsFile = path.join(tmpDir, "all-agents.json");

    fs.mkdirSync(path.join(busDir, "queues"), { recursive: true });
    fs.mkdirSync(daemonDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("skips delivery for terminal launch mode (owned by notifier)", async () => {
    const subscriber = "codex:abc123";
    fs.writeFileSync(
      agentsFile,
      JSON.stringify({
        agents: {
          [subscriber]: {
            launch_mode: "terminal",
            nickname: "worker",
            status: "active",
          },
        },
      }),
      "utf8"
    );

    writePending(busDir, subscriber, [
      {
        seq: 1,
        event: "message",
        publisher: "sender:1",
        target: subscriber,
        data: { message: "hello" },
      },
    ]);

    const daemon = new BusDaemon(busDir, agentsFile, daemonDir, 2000);
    daemon.injector.inject = jest.fn().mockResolvedValue(undefined);

    await daemon.checkQueues();

    expect(daemon.injector.inject).not.toHaveBeenCalled();
  });

  test("delivers for legacy launch mode (owner unknown)", async () => {
    const subscriber = "codex:def456";
    fs.writeFileSync(
      agentsFile,
      JSON.stringify({
        agents: {
          [subscriber]: {
            launch_mode: "",
            nickname: "legacy",
            status: "active",
          },
        },
      }),
      "utf8"
    );

    writePending(busDir, subscriber, [
      {
        seq: 1,
        event: "message",
        publisher: "sender:1",
        target: subscriber,
        data: { message: "legacy message" },
      },
    ]);

    const daemon = new BusDaemon(busDir, agentsFile, daemonDir, 2000);
    daemon.injector.inject = jest.fn().mockResolvedValue(undefined);

    await daemon.checkQueues();

    expect(daemon.injector.inject).toHaveBeenCalledTimes(1);
    expect(daemon.injector.inject).toHaveBeenCalledWith(subscriber, "legacy message");
  });
});
