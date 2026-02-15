#!/usr/bin/env node

const { runUfooEngineCli } = require("../src/assistant/ufooEngineCli");

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

(async () => {
  const stdinText = await readStdin();
  const result = await runUfooEngineCli({
    argv: process.argv.slice(2),
    stdinText,
  });
  process.stdout.write(result.output);
  process.exitCode = result.exitCode;
})();
