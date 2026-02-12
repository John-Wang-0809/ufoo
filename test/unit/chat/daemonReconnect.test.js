const { restartDaemonFlow } = require("../../../src/chat/daemonReconnect");

describe("chat daemonReconnect", () => {
  test("restart flow logs success and reconnects", async () => {
    const logMessage = jest.fn();
    const stopDaemon = jest.fn();
    const startDaemon = jest.fn();
    const daemonConnection = {
      close: jest.fn(),
      connect: jest.fn().mockResolvedValue(true),
    };

    const restartDaemon = restartDaemonFlow({
      projectRoot: "/tmp/project",
      stopDaemon,
      startDaemon,
      daemonConnection,
      logMessage,
    });

    await restartDaemon();

    expect(logMessage).toHaveBeenCalledWith(
      "status",
      "{white-fg}⚙{/white-fg} Restarting daemon..."
    );
    expect(stopDaemon).toHaveBeenCalledWith("/tmp/project");
    expect(startDaemon).toHaveBeenCalledWith("/tmp/project");
    expect(daemonConnection.close).toHaveBeenCalledTimes(1);
    expect(daemonConnection.connect).toHaveBeenCalledTimes(1);
    expect(logMessage).toHaveBeenCalledWith(
      "status",
      "{white-fg}✓{/white-fg} Daemon reconnected"
    );
  });

  test("restart flow logs failure when reconnect fails", async () => {
    const logMessage = jest.fn();
    const stopDaemon = jest.fn();
    const startDaemon = jest.fn();
    const daemonConnection = {
      close: jest.fn(),
      connect: jest.fn().mockResolvedValue(false),
    };

    const restartDaemon = restartDaemonFlow({
      projectRoot: "/tmp/project",
      stopDaemon,
      startDaemon,
      daemonConnection,
      logMessage,
    });

    await restartDaemon();

    expect(logMessage).toHaveBeenCalledWith(
      "status",
      "{white-fg}⚙{/white-fg} Restarting daemon..."
    );
    expect(logMessage).toHaveBeenCalledWith(
      "error",
      "{white-fg}✗{/white-fg} Failed to reconnect to daemon"
    );
  });

  test("restart flow guards reentry", async () => {
    const logMessage = jest.fn();
    const stopDaemon = jest.fn();
    const startDaemon = jest.fn();
    let resolveConnect;
    const connectPromise = new Promise((resolve) => {
      resolveConnect = resolve;
    });
    const daemonConnection = {
      close: jest.fn(),
      connect: jest.fn(() => connectPromise),
    };

    const restartDaemon = restartDaemonFlow({
      projectRoot: "/tmp/project",
      stopDaemon,
      startDaemon,
      daemonConnection,
      logMessage,
    });

    const first = restartDaemon();
    const second = restartDaemon();

    expect(stopDaemon).toHaveBeenCalledTimes(1);
    expect(startDaemon).toHaveBeenCalledTimes(1);
    expect(daemonConnection.connect).toHaveBeenCalledTimes(1);

    resolveConnect(true);
    await first;
    await second;
  });
});
