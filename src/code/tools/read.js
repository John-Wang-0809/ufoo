const fs = require("fs");
const { resolveWorkspacePath } = require("./common");

function runReadTool(input = {}, options = {}) {
  try {
    const filePath = String(input.path || input.file || "").trim();
    const { workspaceRoot, resolved } = resolveWorkspacePath(options.workspaceRoot, filePath, options.cwd);
    const startLine = Number.isFinite(input.startLine) ? Math.max(1, Math.floor(input.startLine)) : 1;
    const endLine = Number.isFinite(input.endLine) ? Math.max(startLine, Math.floor(input.endLine)) : 0;
    const maxBytes = Number.isFinite(input.maxBytes) ? Math.max(256, Math.floor(input.maxBytes)) : 200000;

    const raw = fs.readFileSync(resolved, "utf8");
    const lines = raw.split(/\r?\n/);
    const from = startLine - 1;
    const to = endLine > 0 ? endLine : lines.length;
    const selected = lines.slice(from, to);
    let content = selected.join("\n");
    let truncated = false;
    if (Buffer.byteLength(content, "utf8") > maxBytes) {
      content = Buffer.from(content, "utf8").slice(0, maxBytes).toString("utf8");
      truncated = true;
    }

    return {
      ok: true,
      workspaceRoot,
      path: resolved,
      startLine,
      endLine: endLine > 0 ? endLine : lines.length,
      totalLines: lines.length,
      truncated,
      content,
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : "read failed",
    };
  }
}

module.exports = {
  runReadTool,
};
