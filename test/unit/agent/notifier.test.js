const fs = require("fs");
const os = require("os");
const path = require("path");
const AgentNotifier = require("../../../src/agent/notifier");

function safeName(subscriber) {
  return subscriber.replace(/:/g, "_");
}

function writePending(projectRoot, subscriber, events) {
  const pendingFile = path.join(
    projectRoot,
    ".ufoo",
    "bus",
    "queues",
    safeName(subscriber),
    "pending.jsonl"
  );
  fs.mkdirSync(path.dirname(pendingFile), { recursive: true });
  fs.writeFileSync(
    pendingFile,
    `${events.map((evt) => JSON.stringify(evt)).join("\n")}\n`,
    "utf8"
  );
  return pendingFile;
}

describe("AgentNotifier delivery strategy", () => {
  let projectRoot = "";

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ufoo-notifier-"));
    fs.mkdirSync(path.join(projectRoot, ".ufoo", "agent"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, ".ufoo", "agent", "all-agents.json"), JSON.stringify({ agents: {} }, null, 2));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  test("ufoo-code skips notifier injection and keeps pending queue", async () => {
    const subscriber = "ufoo-code:abc123";
    const pendingFile = writePending(projectRoot, subscriber, [
      {
        seq: 1,
        event: "message",
        publisher: "ufoo-agent",
        target: subscriber,
        data: { message: "hello" },
      },
    ]);

    const notifier = new AgentNotifier(projectRoot, subscriber);
    notifier.injector = {
      inject: jest.fn().mockResolvedValue(undefined),
      readTty: jest.fn(() => ""),
    };

    const delivered = await notifier.deliverPending();

    expect(delivered).toBe(0);
    expect(notifier.injector.inject).not.toHaveBeenCalled();
    expect(fs.readFileSync(pendingFile, "utf8")).toContain("hello");
  });

  test("non-ufoo-code drains pending and injects message text", async () => {
    const subscriber = "codex:abc123";
    const pendingFile = writePending(projectRoot, subscriber, [
      {
        seq: 1,
        event: "message",
        publisher: "ufoo-agent",
        target: subscriber,
        data: { message: "legacy payload" },
      },
    ]);

    const notifier = new AgentNotifier(projectRoot, subscriber);
    notifier.injector = {
      inject: jest.fn().mockResolvedValue(undefined),
      readTty: jest.fn(() => ""),
    };
    notifier.eventBus = {
      send: jest.fn().mockResolvedValue({ ok: true }),
    };

    const delivered = await notifier.deliverPending();

    expect(delivered).toBe(1);
    expect(notifier.injector.inject).toHaveBeenCalledTimes(1);
    expect(notifier.injector.inject).toHaveBeenCalledWith(subscriber, "legacy payload");
    expect(fs.existsSync(pendingFile)).toBe(false);
  });
});
