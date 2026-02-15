const Injector = require("../../../src/bus/inject");

describe("Injector guards", () => {
  test("rejects inject for ufoo-code subscribers", async () => {
    const injector = new Injector("/tmp/ufoo-bus", "/tmp/ufoo-agents.json");
    await expect(injector.inject("ufoo-code:abc123", "hello")).rejects.toThrow(
      "Inject disabled for ufoo-code:abc123"
    );
  });
});
