#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function usage() {
  console.log("Usage: node scripts/import-pi-mono.js <pi-mono-source-path> [--target <target-path>]");
}

function shouldSkip(name = "") {
  return name === ".git" || name === "node_modules";
}

function copyRecursive(source, target) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    const entries = fs.readdirSync(source);
    for (const entry of entries) {
      if (shouldSkip(entry)) continue;
      copyRecursive(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function parseArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : [];
  const parsed = {
    source: "",
    target: "",
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const item = String(args[i] || "").trim();
    if (!item) continue;
    if (item === "--help" || item === "-h") {
      parsed.help = true;
      continue;
    }
    if (item === "--target" || item === "-t") {
      const next = String(args[i + 1] || "").trim();
      if (next) parsed.target = next;
      i += 1;
      continue;
    }
    if (!parsed.source) parsed.source = item;
  }
  return parsed;
}

function readGitValue(sourceRoot = "", gitArgs = []) {
  try {
    const res = spawnSync("git", ["-C", sourceRoot, ...gitArgs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (res.error || res.status !== 0) return "";
    return String(res.stdout || "").trim();
  } catch {
    return "";
  }
}

function readGitMetadata(sourceRoot = "") {
  return {
    commit: readGitValue(sourceRoot, ["rev-parse", "HEAD"]),
    branch: readGitValue(sourceRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
    remote: readGitValue(sourceRoot, ["config", "--get", "remote.origin.url"]),
  };
}

function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (parsedArgs.help) {
    usage();
    process.exit(0);
  }
  const sourceArg = parsedArgs.source || "";
  if (!sourceArg) {
    usage();
    process.exit(1);
  }

  const sourceRoot = path.resolve(sourceArg);
  const sourcePackage = path.join(sourceRoot, "package.json");
  if (!fs.existsSync(sourcePackage)) {
    console.error(`Invalid source: missing package.json at ${sourceRoot}`);
    process.exit(2);
  }

  const repoRoot = path.resolve(__dirname, "..");
  const targetRoot = path.resolve(parsedArgs.target || path.join(repoRoot, "src", "code", "pi-mono"));
  const backupRoot = `${targetRoot}.backup-${Date.now()}`;

  if (fs.existsSync(targetRoot)) {
    fs.renameSync(targetRoot, backupRoot);
    console.log(`Backed up existing fork to ${backupRoot}`);
  }

  copyRecursive(sourceRoot, targetRoot);
  const upstream = readGitMetadata(sourceRoot);

  const metadata = {
    imported_at: new Date().toISOString(),
    source_root: sourceRoot,
    target: targetRoot,
    upstream_commit: upstream.commit,
    upstream_branch: upstream.branch,
    upstream_remote: upstream.remote,
  };
  fs.writeFileSync(
    path.join(targetRoot, ".ufoo-import.json"),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );

  console.log(`Imported pi-mono into ${targetRoot}${upstream.commit ? ` @ ${upstream.commit}` : ""}`);
}

main();
