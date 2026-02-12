const { createTerminalCapabilities } = require("../adapterContract");

function createInternalPtyAdapter(options = {}) {
  const {
    sendRaw = () => {},
    sendResize = () => {},
    requestSnapshot = () => false,
    createAdapter = () => {},
  } = options;

  const capabilities = createTerminalCapabilities({
    supportsInternalQueueLoop: true,
    supportsSocketProtocol: true,
    supportsSubscribeFull: true,
    supportsSubscribeScreen: true,
    supportsSnapshot: true,
  });

  return createAdapter({
    capabilities,
    handlers: {
      send: (data) => {
        sendRaw(data);
        return true;
      },
      sendRaw: (data) => {
        sendRaw(data);
        return true;
      },
      resize: (cols, rows) => {
        sendResize(cols, rows);
        return true;
      },
      snapshot: () => Boolean(requestSnapshot("screen")),
      subscribe: () => Boolean(requestSnapshot("full")),
    },
  });
}

module.exports = {
  createInternalPtyAdapter,
};
