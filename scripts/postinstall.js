/* eslint-disable no-console */
const path = require("path");
const fs = require("fs");
const os = require("os");

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

// Collect all skill sources from package
function collectSkillSources(pkgRoot) {
  const sources = [];

  // Top-level SKILLS/
  const topSkills = path.join(pkgRoot, "SKILLS");
  if (fs.existsSync(topSkills)) {
    for (const entry of fs.readdirSync(topSkills, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const skillMd = path.join(topSkills, entry.name, "SKILL.md");
        if (fs.existsSync(skillMd)) {
          sources.push({ name: entry.name, dir: path.join(topSkills, entry.name), md: skillMd });
        }
      }
    }
  }

  // modules/*/SKILLS/
  const modulesDir = path.join(pkgRoot, "modules");
  if (fs.existsSync(modulesDir)) {
    for (const mod of fs.readdirSync(modulesDir, { withFileTypes: true })) {
      if (!mod.isDirectory()) continue;
      const modSkills = path.join(modulesDir, mod.name, "SKILLS");
      if (!fs.existsSync(modSkills)) continue;
      for (const entry of fs.readdirSync(modSkills, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillMd = path.join(modSkills, entry.name, "SKILL.md");
        if (fs.existsSync(skillMd)) {
          sources.push({ name: entry.name, dir: path.join(modSkills, entry.name), md: skillMd });
        }
      }
    }
  }

  return sources;
}

function forceSymlink(target, linkPath) {
  try {
    const existing = fs.lstatSync(linkPath);
    if (existing.isSymbolicLink() || existing.isFile() || existing.isDirectory()) {
      fs.rmSync(linkPath, { recursive: true, force: true });
    }
  } catch {
    // doesn't exist — fine
  }
  fs.symlinkSync(target, linkPath);
}

// Install ufoo skills as Claude Code slash commands (~/.claude/commands/<name>.md)
// and as skill directories (~/.claude/skills/<name>/)
try {
  const pkgRoot = path.resolve(__dirname, "..");
  const home = os.homedir();
  const sources = collectSkillSources(pkgRoot);

  if (sources.length > 0) {
    // Slash commands: ~/.claude/commands/<name>.md -> SKILL.md
    const commandsDir = path.join(home, ".claude", "commands");
    fs.mkdirSync(commandsDir, { recursive: true });

    let installed = 0;
    for (const { name, md } of sources) {
      forceSymlink(md, path.join(commandsDir, `${name}.md`));
      installed += 1;
    }
    console.log(`[postinstall] Installed ${installed} ufoo command(s) to ${commandsDir}`);
  }
} catch (err) {
  // Non-fatal — skills can be installed manually via `ufoo skills install`
  console.log(`[postinstall] Skipped skills install: ${err.message}`);
}
