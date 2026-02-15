#!/usr/bin/env node

const { runUcodeCoreCli } = require("../src/code/cli");

(async () => {
  const argv = process.argv.slice(2);
  const result = await runUcodeCoreCli({ argv, projectRoot: process.cwd() });
  if (result && typeof result.output === "string" && result.output) {
    process.stdout.write(result.output);
  }
  process.exit(typeof result.exitCode === "number" ? result.exitCode : 0);
})().catch((err) => {
  process.stderr.write(`${err && err.message ? err.message : "ucode-core failed"}\n`);
  process.exit(1);
});
