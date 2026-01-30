#!/usr/bin/env node
/* eslint-disable no-console */
const { runCli } = require("../src/cli");

runCli(process.argv).catch((err) => {
  const message = err && err.stack ? err.stack : String(err);
  console.error(message);
  process.exitCode = 1;
});

