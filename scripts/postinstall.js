/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");

// Fix node-pty spawn-helper permissions on macOS (both arm64 and x64)
const platforms = ["darwin-arm64", "darwin-x64"];

for (const platform of platforms) {
  try {
    const spawnHelperPath = path.join(
      __dirname,
      "..",
      "node_modules",
      "node-pty",
      "prebuilds",
      platform,
      "spawn-helper"
    );

    if (fs.existsSync(spawnHelperPath)) {
      const stats = fs.statSync(spawnHelperPath);
      if ((stats.mode & 0o111) === 0) {
        fs.chmodSync(spawnHelperPath, 0o755);
        console.log(`[postinstall] Fixed node-pty spawn-helper permissions (${platform})`);
      }
    }
  } catch {
    // Silently ignore - not critical for non-macOS or if node-pty not installed
  }
}
