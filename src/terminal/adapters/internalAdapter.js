const { createInternalPtyAdapter } = require("./internalPtyAdapter");
const { createInternalQueueAdapter } = require("./internalQueueAdapter");

function createInternalAdapter(options = {}) {
  if (options.usePty) {
    return createInternalPtyAdapter(options);
  }
  return createInternalQueueAdapter(options);
}

module.exports = {
  createInternalAdapter,
};
