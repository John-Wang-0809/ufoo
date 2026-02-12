const {
  COMMAND_REGISTRY,
  buildCommandRegistry,
  parseCommand,
  parseAtTarget,
} = require("../../../src/chat/commands");

describe("chat command helpers", () => {
  test("COMMAND_REGISTRY keeps priority order for launch/bus/ctx", () => {
    const cmds = COMMAND_REGISTRY.map((item) => item.cmd);
    expect(cmds.indexOf("/launch")).toBeLessThan(cmds.indexOf("/bus"));
    expect(cmds.indexOf("/bus")).toBeLessThan(cmds.indexOf("/ctx"));
  });

  test("buildCommandRegistry sorts subcommands alphabetically", () => {
    const tree = {
      "/z": { desc: "z", children: { beta: { desc: "" }, alpha: { desc: "" } } },
    };
    const registry = buildCommandRegistry(tree);
    expect(registry).toHaveLength(1);
    expect(registry[0].subcommands.map((s) => s.cmd)).toEqual(["alpha", "beta"]);
  });

  test("parseCommand handles quoted args", () => {
    expect(parseCommand("hello")).toBeNull();
    expect(parseCommand("/launch codex \"nickname with space\"")).toEqual({
      command: "launch",
      args: ["codex", "nickname with space"],
    });
  });

  test("parseAtTarget extracts target and optional message", () => {
    expect(parseAtTarget("hello")).toBeNull();
    expect(parseAtTarget("@codex")).toEqual({ target: "codex", message: "" });
    expect(parseAtTarget("@codex hi there")).toEqual({ target: "codex", message: "hi there" });
  });
});
