const fs = require("fs");
const path = require("path");

function normalizeWorkspaceRoot(workspaceRoot = "", cwd = process.cwd()) {
  const base = String(workspaceRoot || "").trim();
  return path.resolve(base || cwd || process.cwd());
}

function isPathInside(root, target) {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  if (normalizedRoot === normalizedTarget) return true;
  return normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

function resolveWorkspacePath(workspaceRoot = "", targetPath = "", cwd = process.cwd()) {
  const root = normalizeWorkspaceRoot(workspaceRoot, cwd);
  const requested = String(targetPath || "").trim();
  if (!requested) {
    throw new Error("path is required");
  }
  const resolved = path.resolve(root, requested);
  if (!isPathInside(root, resolved)) {
    throw new Error("path escapes workspace root");
  }
  return {
    workspaceRoot: root,
    requested,
    resolved,
  };
}

function ensureParentDir(filePath = "") {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  normalizeWorkspaceRoot,
  resolveWorkspacePath,
  ensureParentDir,
};
