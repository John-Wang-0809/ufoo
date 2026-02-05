/**
 * OnlineClient (Phase 1 scaffold)
 *
 * Placeholder for future WebSocket client implementation.
 *
 * Planned responsibilities:
 *  - establish connection (HTTP placeholder; WebSocket later)
 *  - perform hello/auth
 *  - forward local bus events to remote
 *  - receive remote events and inject into local bus
 */
class OnlineClient {
  constructor(options = {}) {
    this.url = options.url || "http://127.0.0.1:8787";
    this.subscriberId = options.subscriberId || null;
  }

  async connect() {
    throw new Error("OnlineClient not implemented (Phase 1 scaffold)");
  }
}

module.exports = OnlineClient;
