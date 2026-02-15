const { describe, it, expect } = require("@jest/globals");
const {
  decomposeBugFixTask,
  compileSummary,
} = require("../../../src/code/taskDecomposer");

describe("taskDecomposer", () => {
  describe("decomposeBugFixTask", () => {
    it("should decompose bug fix tasks into steps", () => {
      const task = "Fix the rendering bug where messages appear together";
      const steps = decomposeBugFixTask(task);

      expect(steps).toHaveLength(4);
      expect(steps[0].id).toBe("identify");
      expect(steps[0].name).toBe("Identifying the issue");
      expect(steps[0].timeoutMs).toBe(30000);
      expect(steps[0].earlyExit).toBe(true);

      expect(steps[1].id).toBe("locate");
      expect(steps[1].name).toBe("Locating relevant code");

      expect(steps[2].id).toBe("fix");
      expect(steps[2].name).toBe("Applying the fix");

      expect(steps[3].id).toBe("verify");
      expect(steps[3].name).toBe("Verifying the fix");
    });

    it("should use single step for non-bug tasks", () => {
      const task = "Explain how the chat system works";
      const steps = decomposeBugFixTask(task);

      expect(steps).toHaveLength(1);
      expect(steps[0].id).toBe("execute");
      expect(steps[0].name).toBe("Executing task");
      expect(steps[0].timeoutMs).toBe(120000);
    });

    it("should recognize various bug-related keywords", () => {
      const bugTasks = [
        "Fix the authentication issue",
        "The chat doesn't work properly",
        "Something is broken in the UI",
        "There's a problem with rendering",
      ];

      for (const task of bugTasks) {
        const steps = decomposeBugFixTask(task);
        expect(steps.length).toBeGreaterThan(1);
        expect(steps[0].id).toBe("identify");
      }
    });
  });

  describe("compileSummary", () => {
    it("should extract key findings from results", () => {
      const results = [
        {
          step: "identify",
          name: "Identifying the issue",
          result: {
            ok: true,
            output: "Found the issue: screen.render() not called after logging\nThe problem is in src/chat/index.js\nThis causes messages to appear together",
          },
        },
        {
          step: "fix",
          name: "Applying the fix",
          result: {
            ok: true,
            output: "Fixed by adding screen.render() call\nEdited src/chat/index.js line 1281",
          },
        },
      ];

      const summary = compileSummary(results);

      expect(summary).toContain("Found the issue");
      expect(summary).toContain("src/chat/index.js");
      expect(summary).toContain("Fixed");
      expect(summary).not.toContain("Let me think");
      expect(summary).not.toContain("Hmm");
    });

    it("should handle empty results", () => {
      const summary = compileSummary([]);
      expect(summary).toBe("No results");
    });

    it("should filter out verbose thinking", () => {
      const results = [
        {
          step: "identify",
          name: "Identifying the issue",
          result: {
            ok: true,
            output: `Let me think about this...
Hmm, interesting
Now let me look at the code
Actually, wait
Found the problem in src/test.js
The issue is a missing semicolon
Let me verify this`,
          },
        },
      ];

      const summary = compileSummary(results);

      expect(summary).toContain("Found the problem");
      expect(summary).toContain("src/test.js");
      expect(summary).toContain("issue");
      expect(summary).not.toContain("Let me");
      expect(summary).not.toContain("Hmm");
      expect(summary).not.toContain("Actually");
    });
  });
});