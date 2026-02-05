const http = require("http");
const EventEmitter = require("events");

/**
 * ufoo-online (Phase 1 scaffold)
 *
 * This is a minimal placeholder for the online relay server.
 * It does NOT implement protocol logic yet.
 * Intended WebSocket path: /ufoo/online (see docs/ufoo-online/PROTOCOL.md)
 */
class OnlineServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 8787;
    this.host = options.host || "127.0.0.1";
    this.server = null;
  }

  start() {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ufoo-online: scaffold\n");
    });

    this.server.listen(this.port, this.host, () => {
      this.emit("listening", { host: this.host, port: this.port });
    });
  }

  stop() {
    if (!this.server) return;
    this.server.close();
    this.server = null;
  }
}

module.exports = OnlineServer;
