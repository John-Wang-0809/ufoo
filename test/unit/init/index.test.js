const fs = require("fs");
const path = require("path");
const UfooInit = require("../../../src/init");

describe("UfooInit markdown handling", () => {
  const testRoot = "/tmp/ufoo-init-test";
  const repoRoot = path.join(testRoot, "repo");
  const projectRoot = path.join(testRoot, "project");
  const templatePath = path.join(repoRoot, "modules", "AGENTS.template.md");
  let init;
  let logSpy;
  let warnSpy;
  let errorSpy;

  function read(filePath) {
    return fs.readFileSync(filePath, "utf8");
  }

  beforeEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(templatePath), { recursive: true });
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.writeFileSync(templatePath, "<!-- ufoo -->\nTemplate Block\n<!-- /ufoo -->\n", "utf8");

    init = new UfooInit(repoRoot);
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (fs.existsSync(testRoot)) {
      fs.rmSync(testRoot, { recursive: true, force: true });
    }
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("ensureAgentsFiles should create default AGENTS.md and CLAUDE.md when absent", () => {
    init.ensureAgentsFiles(projectRoot);

    const agentsFile = path.join(projectRoot, "AGENTS.md");
    const claudeFile = path.join(projectRoot, "CLAUDE.md");

    expect(fs.existsSync(agentsFile)).toBe(true);
    expect(fs.existsSync(claudeFile)).toBe(true);
    expect(read(claudeFile)).toBe("AGENTS.md\n");
    expect(read(agentsFile)).toContain("`CLAUDE.md` points to this file");
  });

  test("ensureAgentsFiles should preserve existing CLAUDE.md symlink", () => {
    const agentsFile = path.join(projectRoot, "AGENTS.md");
    const claudeFile = path.join(projectRoot, "CLAUDE.md");
    fs.writeFileSync(agentsFile, "ORIGINAL AGENTS CONTENT\n", "utf8");
    fs.symlinkSync("AGENTS.md", claudeFile);

    init.ensureAgentsFiles(projectRoot);

    expect(fs.lstatSync(claudeFile).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(claudeFile)).toBe("AGENTS.md");
    expect(read(agentsFile)).toBe("ORIGINAL AGENTS CONTENT\n");
  });

  test("injectAgentsTemplate should inject once into symlink source file", () => {
    const agentsFile = path.join(projectRoot, "AGENTS.md");
    const claudeFile = path.join(projectRoot, "CLAUDE.md");
    fs.writeFileSync(agentsFile, "# AGENTS\n", "utf8");
    fs.symlinkSync("AGENTS.md", claudeFile);

    init.injectAgentsTemplate(projectRoot);
    init.injectAgentsTemplate(projectRoot);

    const content = read(agentsFile);
    const marker = "<!-- ufoo-template -->";
    const markerCount = (content.match(new RegExp(marker, "g")) || []).length;
    expect(markerCount).toBe(2);
    expect(content).toContain("Template Block");
  });

  test("injectAgentsTemplate should inject into both files when CLAUDE.md is separate file", () => {
    const agentsFile = path.join(projectRoot, "AGENTS.md");
    const claudeFile = path.join(projectRoot, "CLAUDE.md");
    fs.writeFileSync(agentsFile, "# AGENTS\n", "utf8");
    fs.writeFileSync(claudeFile, "# CLAUDE\n", "utf8");

    init.injectAgentsTemplate(projectRoot);

    expect(read(agentsFile)).toContain("Template Block");
    expect(read(claudeFile)).toContain("Template Block");
  });
});
