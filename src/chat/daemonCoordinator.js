const { createDaemonConnection } = require("./daemonConnection");
const { restartDaemonFlow } = require("./daemonReconnect");

function createDaemonCoordinator(options = {}) {
  const {
    projectRoot,
    daemonTransport,
    connectClient,
    handleMessage,
    queueStatusLine,
    resolveStatusLine,
    logMessage,
    stopDaemon,
    startDaemon,
    daemonConnection,
    restartDaemon,
  } = options;

  const connectClientFn = connectClient
    || (daemonTransport && typeof daemonTransport.connectClient === "function"
      ? daemonTransport.connectClient.bind(daemonTransport)
      : null);

  if (!daemonConnection && !connectClientFn) {
    throw new Error("createDaemonCoordinator requires connectClient, daemonTransport, or daemonConnection");
  }

  const connection = daemonConnection || createDaemonConnection({
    connectClient: connectClientFn,
    handleMessage,
    queueStatusLine,
    resolveStatusLine,
    logMessage,
  });

  const restart = restartDaemon || restartDaemonFlow({
    projectRoot,
    stopDaemon,
    startDaemon,
    daemonConnection: connection,
    logMessage,
  });

  function isConnected() {
    if (!connection || typeof connection.getState !== "function") return false;
    const state = connection.getState();
    return Boolean(state && state.client && !state.client.destroyed);
  }

  return {
    connect: () => connection.connect(),
    requestStatus: () => connection.requestStatus(),
    send: (req) => connection.send(req),
    restart: () => restart(),
    close: () => connection.close(),
    markExit: () => connection.markExit(),
    isConnected,
    getState: () => (typeof connection.getState === "function" ? connection.getState() : null),
  };
}

module.exports = {
  createDaemonCoordinator,
};
