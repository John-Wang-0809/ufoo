const fs = require("fs");
const { resolveWorkspacePath, ensureParentDir } = require("./common");

function runWriteTool(input = {}, options = {}) {
  try {
    const filePath = String(input.path || input.file || "").trim();
    const content = String(input.content || "");
    const mode = String(input.mode || "").trim().toLowerCase();
    const append = mode === "append" || input.append === true;
    const { workspaceRoot, resolved } = resolveWorkspacePath(options.workspaceRoot, filePath, options.cwd);
    ensureParentDir(resolved);
    if (append) {
      fs.appendFileSync(resolved, content, "utf8");
    } else {
      fs.writeFileSync(resolved, content, "utf8");
    }
    const stat = fs.statSync(resolved);
    return {
      ok: true,
      workspaceRoot,
      path: resolved,
      mode: append ? "append" : "overwrite",
      bytes: stat.size,
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : "write failed",
    };
  }
}

module.exports = {
  runWriteTool,
};
