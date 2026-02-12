const { EventEmitter } = require("events");
const { createDaemonCoordinator } = require("../../../src/chat/daemonCoordinator");

class FakeClient extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.writes = [];
  }

  write(data) {
    this.writes.push(data);
  }

  end() {
    this.destroyed = true;
  }

  destroy() {
    this.destroyed = true;
  }
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}


describe("chat daemonCoordinator", () => {
  test("throws when daemonTransport connectClient is missing or invalid", () => {
    expect(() => createDaemonCoordinator({ daemonTransport: {} })).toThrow(
      "createDaemonCoordinator requires connectClient, daemonTransport, or daemonConnection"
    );
    expect(() => createDaemonCoordinator({ daemonTransport: { connectClient: true } })).toThrow(
      "createDaemonCoordinator requires connectClient, daemonTransport, or daemonConnection"
    );
  });

  test("throws when no connection source is provided", () => {
    expect(() => createDaemonCoordinator({})).toThrow(
      "createDaemonCoordinator requires connectClient, daemonTransport, or daemonConnection"
    );
  });

  test("delegates connection API to daemonConnection", async () => {
    const daemonConnection = {
      connect: jest.fn().mockResolvedValue(true),
      requestStatus: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      markExit: jest.fn(),
      getState: jest.fn(() => ({ client: { destroyed: false } })),
    };
    const restartDaemon = jest.fn();

    const coordinator = createDaemonCoordinator({
      daemonConnection,
      restartDaemon,
    });

    await coordinator.connect();
    coordinator.requestStatus();
    coordinator.send({ type: "status" });
    coordinator.close();
    coordinator.markExit();
    coordinator.restart();

    expect(daemonConnection.connect).toHaveBeenCalledTimes(1);
    expect(daemonConnection.requestStatus).toHaveBeenCalledTimes(1);
    expect(daemonConnection.send).toHaveBeenCalledWith({ type: "status" });
    expect(daemonConnection.close).toHaveBeenCalledTimes(1);
    expect(daemonConnection.markExit).toHaveBeenCalledTimes(1);
    expect(restartDaemon).toHaveBeenCalledTimes(1);
  });

  test("isConnected reflects daemonConnection state", () => {
    const daemonConnection = {
      connect: jest.fn(),
      requestStatus: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      markExit: jest.fn(),
      getState: jest.fn(() => ({ client: { destroyed: false } })),
    };
    const coordinator = createDaemonCoordinator({ daemonConnection, restartDaemon: jest.fn() });

    expect(coordinator.isConnected()).toBe(true);

    daemonConnection.getState.mockReturnValue({ client: { destroyed: true } });
    expect(coordinator.isConnected()).toBe(false);

    daemonConnection.getState.mockReturnValue({ client: null });
    expect(coordinator.isConnected()).toBe(false);
  });

  test("uses daemonTransport connectClient when provided", async () => {
    const connectClient = jest.fn().mockResolvedValue(new FakeClient());
    const daemonTransport = { connectClient };
    const stopDaemon = jest.fn();
    const startDaemon = jest.fn();
    const coordinator = createDaemonCoordinator({
      projectRoot: "/tmp/project",
      daemonTransport,
      handleMessage: jest.fn(() => false),
      queueStatusLine: jest.fn(),
      resolveStatusLine: jest.fn(),
      logMessage: jest.fn(),
      stopDaemon,
      startDaemon,
    });

    const connected = await coordinator.connect();
    expect(connected).toBe(true);
    expect(connectClient).toHaveBeenCalledTimes(1);
  });

  test("integrates reconnect then restart flow", async () => {
    const first = new FakeClient();
    const second = new FakeClient();
    const third = new FakeClient();
    const connectClient = jest.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(third);
    const handleMessage = jest.fn(() => false);
    const queueStatusLine = jest.fn();
    const resolveStatusLine = jest.fn();
    const logMessage = jest.fn();
    const stopDaemon = jest.fn();
    const startDaemon = jest.fn();

    const coordinator = createDaemonCoordinator({
      projectRoot: "/tmp/project",
      connectClient,
      handleMessage,
      queueStatusLine,
      resolveStatusLine,
      logMessage,
      stopDaemon,
      startDaemon,
    });

    const connected = await coordinator.connect();
    expect(connected).toBe(true);

    first.emit("close");
    await flushPromises();
    await flushPromises();

    expect(queueStatusLine).toHaveBeenCalledWith("Reconnecting to daemon");
    expect(resolveStatusLine).toHaveBeenCalledWith("{gray-fg}✓{/gray-fg} Daemon reconnected");

    await coordinator.restart();

    expect(stopDaemon).toHaveBeenCalledWith("/tmp/project");
    expect(startDaemon).toHaveBeenCalledWith("/tmp/project");
    expect(logMessage).toHaveBeenCalledWith(
      "status",
      "{white-fg}⚙{/white-fg} Restarting daemon..."
    );
    expect(logMessage).toHaveBeenCalledWith(
      "status",
      "{white-fg}✓{/white-fg} Daemon reconnected"
    );
    expect(connectClient).toHaveBeenCalledTimes(3);
    expect(coordinator.isConnected()).toBe(true);
  });

});
