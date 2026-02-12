const { DAEMON_TRANSPORT_DEFAULTS } = require("./daemonTransportDefaults");

function createDaemonTransport(options = {}) {
  const {
    projectRoot,
    sockPath,
    isRunning = () => true,
    startDaemon = () => {},
    connectWithRetry = async () => null,
    primaryRetries = DAEMON_TRANSPORT_DEFAULTS.primaryRetries,
    secondaryRetries = DAEMON_TRANSPORT_DEFAULTS.secondaryRetries,
    retryDelayMs = DAEMON_TRANSPORT_DEFAULTS.retryDelayMs,
    restartDelayMs = DAEMON_TRANSPORT_DEFAULTS.restartDelayMs,
  } = options;

  async function connectClient() {
    let client = await connectWithRetry(sockPath, primaryRetries, retryDelayMs);
    if (!client) {
      // Retry once with a fresh daemon start and longer wait.
      if (!isRunning(projectRoot)) {
        startDaemon(projectRoot);
        await new Promise((resolve) => setTimeout(resolve, restartDelayMs));
      }
      client = await connectWithRetry(sockPath, secondaryRetries, retryDelayMs);
    }
    return client;
  }

  return {
    connectClient,
  };
}

module.exports = {
  createDaemonTransport,
};
