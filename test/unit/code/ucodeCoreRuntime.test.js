const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  submitTask,
  runOnce,
  listResults,
  loadState,
  runUcodeCoreCli,
} = require("../../../src/code");

describe("ucode-core runtime queue", () => {
  test("submit + runOnce + list produces result entries", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ufoo-ucode-runtime-"));
    fs.writeFileSync(path.join(root, "hello.txt"), "hello\n", "utf8");

    const submitted = submitTask(root, {
      tool: "read",
      args: { path: "hello.txt" },
    });
    expect(submitted.task_id).toBeTruthy();

    const ran = runOnce(root, { maxTasks: 5 });
    expect(ran.processed).toBe(1);
    expect(ran.results[0].ok).toBe(true);
    expect(ran.results[0].output.content).toContain("hello");

    const rows = listResults(root, { num: 10 });
    expect(rows.length).toBe(1);
    expect(rows[0].task_id).toBe(submitted.task_id);
    expect(loadState(root).offset).toBe(1);

    fs.rmSync(root, { recursive: true, force: true });
  });

  test("runUcodeCoreCli supports submit/run-once/list JSON flow", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ufoo-ucode-runtime-cli-"));
    fs.writeFileSync(path.join(root, "x.txt"), "x\n", "utf8");

    const submit = await runUcodeCoreCli({
      argv: ["submit", "--tool", "read", "--args-json", "{\"path\":\"x.txt\"}", "--json"],
      projectRoot: root,
    });
    expect(submit.exitCode).toBe(0);
    const submitPayload = JSON.parse(submit.output);
    expect(submitPayload.ok).toBe(true);

    const run = await runUcodeCoreCli({
      argv: ["run-once", "--max", "10", "--json"],
      projectRoot: root,
    });
    expect(run.exitCode).toBe(0);
    const runPayload = JSON.parse(run.output);
    expect(runPayload.ok).toBe(true);
    expect(runPayload.processed).toBe(1);

    const list = await runUcodeCoreCli({
      argv: ["list", "--num", "10", "--json"],
      projectRoot: root,
    });
    expect(list.exitCode).toBe(0);
    const listPayload = JSON.parse(list.output);
    expect(listPayload.ok).toBe(true);
    expect(Array.isArray(listPayload.results)).toBe(true);
    expect(listPayload.results.length).toBe(1);
    expect(listPayload.results[0].output.content).toContain("x");

    fs.rmSync(root, { recursive: true, force: true });
  });
});
