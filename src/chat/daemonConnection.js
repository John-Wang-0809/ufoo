const { IPC_REQUEST_TYPES } = require("../shared/eventContract");

function createDaemonConnection(options = {}) {
  const {
    connectClient,
    handleMessage,
    queueStatusLine,
    resolveStatusLine,
    logMessage,
  } = options;

  let client = null;
  let reconnectPromise = null;
  let exitRequested = false;
  let connectionLostNotified = false;
  const pendingRequests = [];
  const MAX_PENDING_REQUESTS = 50;

  function enqueueRequest(req) {
    if (!req || req.type === IPC_REQUEST_TYPES.STATUS) return;
    pendingRequests.push(req);
    if (pendingRequests.length > MAX_PENDING_REQUESTS) {
      pendingRequests.shift();
    }
  }

  function flushPendingRequests() {
    if (!client || client.destroyed) return;
    while (pendingRequests.length > 0) {
      const req = pendingRequests.shift();
      client.write(`${JSON.stringify(req)}\n`);
    }
  }

  function detachClient(target = client) {
    if (!target) return;
    target.removeAllListeners("data");
    target.removeAllListeners("close");
    target.removeAllListeners("error");
    if (target === client) {
      client = null;
    }
    try {
      target.end();
      target.destroy();
    } catch {
      // ignore
    }
  }

  function attachClient(newClient) {
    if (!newClient) return;
    detachClient();
    client = newClient;
    connectionLostNotified = false;
    let buffer = "";
    client.on("data", (data) => {
      buffer += data.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines.filter((l) => l.trim())) {
        try {
          const msg = JSON.parse(line);
          const shouldStop = handleMessage(msg);
          if (shouldStop) {
            return;
          }
        } catch {
          // ignore
        }
      }
    });
    const handleDisconnect = () => {
      if (client === newClient) {
        client = null;
      }
      if (exitRequested) return;
      if (!connectionLostNotified) {
        connectionLostNotified = true;
        logMessage("status", "{white-fg}✗{/white-fg} Daemon disconnected");
      }
      void ensureConnected();
    };
    client.on("close", handleDisconnect);
    client.on("error", handleDisconnect);
    flushPendingRequests();
  }

  async function ensureConnected() {
    if (client && !client.destroyed) return true;
    if (exitRequested) return false;
    if (reconnectPromise) return reconnectPromise;
    queueStatusLine("Reconnecting to daemon");
    logMessage("status", "{white-fg}⚙{/white-fg} Reconnecting to daemon...");
    reconnectPromise = (async () => {
      const newClient = await connectClient();
      if (!newClient) {
        resolveStatusLine("{gray-fg}✗{/gray-fg} Daemon offline");
        logMessage("error", "{white-fg}✗{/white-fg} Failed to reconnect to daemon");
        return false;
      }
      attachClient(newClient);
      connectionLostNotified = false;
      resolveStatusLine("{gray-fg}✓{/gray-fg} Daemon reconnected");
      requestStatus();
      return true;
    })();
    try {
      return await reconnectPromise;
    } finally {
      reconnectPromise = null;
    }
  }

  async function connect() {
    if (client && !client.destroyed) return true;
    const newClient = await connectClient();
    if (!newClient) return false;
    attachClient(newClient);
    return true;
  }

  function send(req) {
    if (!client || client.destroyed) {
      enqueueRequest(req);
      void ensureConnected();
      return;
    }
    client.write(`${JSON.stringify(req)}\n`);
  }

  function requestStatus() {
    send({ type: IPC_REQUEST_TYPES.STATUS });
  }

  function close() {
    detachClient();
  }

  function markExit() {
    exitRequested = true;
  }

  function getState() {
    return {
      client,
      reconnectPromise,
      pendingRequestCount: pendingRequests.length,
      exitRequested,
      connectionLostNotified,
    };
  }

  return {
    connect,
    send,
    requestStatus,
    close,
    markExit,
    getState,
  };
}

module.exports = {
  createDaemonConnection,
};
