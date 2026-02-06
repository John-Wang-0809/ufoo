/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

function run(args) {
  const bin = path.join(__dirname, "..", "bin", "ufoo.js");
  const res = spawnSync(process.execPath, [bin, ...args], {
    stdio: "ignore",
  });
  return res.status === 0;
}

function tryInstall(args, label) {
  try {
    run(args);
  } catch (err) {
    console.warn(`[postinstall] ${label} failed: ${err.message || String(err)}`);
  }
}

// Fix node-pty spawn-helper permissions on macOS (both arm64 and x64)
function fixNodePtyPermissions() {
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
        // Check if executable bit is missing
        if ((stats.mode & 0o111) === 0) {
          fs.chmodSync(spawnHelperPath, 0o755);
          console.log(`[postinstall] Fixed node-pty spawn-helper permissions (${platform})`);
        }
      }
    } catch {
      // Silently ignore errors - not critical for non-macOS or if node-pty not installed
    }
  }
}

fixNodePtyPermissions();

const skills = ["ufoo", "ubus", "uctx"];

for (const skill of skills) {
  tryInstall(["skills", "install", skill, "--codex"], `install ${skill} skill (codex)`);
  tryInstall(["skills", "install", skill], `install ${skill} skill (claude)`);
}
