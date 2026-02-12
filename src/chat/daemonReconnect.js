function resolveDaemonConnection(daemonConnection) {
  return typeof daemonConnection === "function" ? daemonConnection() : daemonConnection;
}

function restartDaemonFlow(options = {}) {
  const {
    projectRoot,
    stopDaemon,
    startDaemon,
    daemonConnection,
    logMessage,
  } = options;

  let restartInProgress = false;

  return async function restartDaemon() {
    if (restartInProgress) return;
    restartInProgress = true;
    logMessage("status", "{white-fg}⚙{/white-fg} Restarting daemon...");
    try {
      const connection = resolveDaemonConnection(daemonConnection);
      if (connection) {
        connection.close();
      }
      stopDaemon(projectRoot);
      startDaemon(projectRoot);
      const connected = connection ? await connection.connect() : false;
      if (connected) {
        logMessage("status", "{white-fg}✓{/white-fg} Daemon reconnected");
      } else {
        logMessage("error", "{white-fg}✗{/white-fg} Failed to reconnect to daemon");
      }
    } finally {
      restartInProgress = false;
    }
  };
}

module.exports = {
  restartDaemonFlow,
};
