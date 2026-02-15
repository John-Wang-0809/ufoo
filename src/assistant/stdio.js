const { runAssistantAgentTask } = require("./agent");

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.resume();
  });
}

async function runAssistantStdio() {
  const startedAt = Date.now();
  try {
    const input = await readStdin();
    const line = String(input || "")
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find(Boolean);

    if (!line) {
      process.stdout.write(
        `${JSON.stringify({
          ok: false,
          summary: "",
          artifacts: [],
          logs: [],
          error: "missing request payload",
          metrics: { duration_ms: Date.now() - startedAt },
        })}\n`
      );
      process.exitCode = 1;
      return;
    }

    const payload = JSON.parse(line);
    const result = await runAssistantAgentTask(payload);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (err) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        summary: "",
        artifacts: [],
        logs: [],
        error: err && err.message ? err.message : "assistant stdio failed",
        metrics: { duration_ms: Date.now() - startedAt },
      })}\n`
    );
    process.exitCode = 1;
  }
}

module.exports = { runAssistantStdio };
