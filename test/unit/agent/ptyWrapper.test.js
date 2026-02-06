/**
 * PtyWrapper 单元测试
 * 测试核心功能而不依赖真实的PTY进程
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

// 测试用的临时目录
const TEST_DIR = path.join(os.tmpdir(), `pty-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

console.log("PTY Wrapper Unit Tests");
console.log("======================\n");

// Test 1: 模块导入
console.log("Test 1: Module Import");
try {
  const PtyWrapper = require("../../../src/agent/ptyWrapper");
  assert.strictEqual(typeof PtyWrapper, "function", "PtyWrapper should be a constructor");
  console.log("✓ PtyWrapper imports successfully\n");
} catch (err) {
  console.error("✗ Import failed:", err.message);
  process.exit(1);
}

// Test 2: 实例化
console.log("Test 2: Instantiation");
try {
  const PtyWrapper = require("../../../src/agent/ptyWrapper");
  const wrapper = new PtyWrapper("echo", ["test"], { cwd: TEST_DIR });

  assert.strictEqual(wrapper.command, "echo");
  assert.deepStrictEqual(wrapper.args, ["test"]);
  assert.strictEqual(wrapper.pty, null, "PTY should be null before spawn");
  assert.strictEqual(wrapper._cleaned, false, "Should not be cleaned initially");

  console.log("✓ PtyWrapper instantiates correctly");
  console.log("✓ Initial state is correct\n");
} catch (err) {
  console.error("✗ Instantiation failed:", err.message);
  process.exit(1);
}

// Test 3: 数据序列化（UTF-8文本）
console.log("Test 3: Data Serialization (UTF-8)");
try {
  const PtyWrapper = require("../../../src/agent/ptyWrapper");
  const wrapper = new PtyWrapper("echo", ["test"]);

  // 测试纯ASCII
  const ascii = wrapper._serializeData("Hello World");
  assert.strictEqual(ascii.text, "Hello World");
  assert.strictEqual(ascii.encoding, "utf8");
  assert.strictEqual(ascii.size, 11);

  // 测试中文
  const chinese = wrapper._serializeData("你好世界");
  assert.strictEqual(chinese.text, "你好世界");
  assert.strictEqual(chinese.encoding, "utf8");
  assert.ok(chinese.size > 0);

  console.log("✓ UTF-8 text serialization works");
  console.log("✓ Chinese characters handled correctly\n");
} catch (err) {
  console.error("✗ UTF-8 serialization failed:", err.message);
  process.exit(1);
}

// Test 4: 数据序列化（Binary/Base64）
console.log("Test 4: Data Serialization (Binary)");
try {
  const PtyWrapper = require("../../../src/agent/ptyWrapper");
  const wrapper = new PtyWrapper("echo", ["test"]);

  // 创建包含无效UTF-8的buffer
  const invalidUtf8 = Buffer.from([0xFF, 0xFE, 0x00, 0x01]);
  const result = wrapper._serializeData(invalidUtf8);

  assert.strictEqual(result.encoding, "base64");
  assert.ok(result.text.length > 0);
  assert.strictEqual(result.size, 4);

  // 验证可以解码回原始数据
  const decoded = Buffer.from(result.text, "base64");
  assert.deepStrictEqual(decoded, invalidUtf8);

  console.log("✓ Binary data encoded as base64");
  console.log("✓ Base64 encoding/decoding works\n");
} catch (err) {
  console.error("✗ Binary serialization failed:", err.message);
  process.exit(1);
}

// Test 5: 日志启用
console.log("Test 5: Logging");
try {
  const PtyWrapper = require("../../../src/agent/ptyWrapper");
  const wrapper = new PtyWrapper("echo", ["test"]);
  const logFile = path.join(TEST_DIR, "test.jsonl");

  wrapper.enableLogging(logFile);
  assert.ok(wrapper.logger, "Logger should be created");

  // 尝试重复启用应该抛错
  try {
    wrapper.enableLogging(logFile);
    console.error("✗ Should throw when logging already enabled");
    process.exit(1);
  } catch (err) {
    assert.ok(err.message.includes("already enabled"));
  }

  wrapper.cleanup();

  console.log("✓ Logging can be enabled");
  console.log("✓ Duplicate enable throws error\n");
} catch (err) {
  console.error("✗ Logging test failed:", err.message);
  process.exit(1);
}

// Test 6: 监控启用
console.log("Test 6: Monitoring");
try {
  const PtyWrapper = require("../../../src/agent/ptyWrapper");
  const wrapper = new PtyWrapper("echo", ["test"]);

  let monitorCalled = false;
  wrapper.enableMonitoring((data) => {
    monitorCalled = true;
  });

  assert.ok(wrapper.monitor, "Monitor should be created");
  assert.strictEqual(typeof wrapper.monitor.onOutput, "function");

  console.log("✓ Monitoring can be enabled");
  console.log("✓ Monitor callback is set\n");
} catch (err) {
  console.error("✗ Monitoring test failed:", err.message);
  process.exit(1);
}

// Test 7: Cleanup 幂等性
console.log("Test 7: Cleanup Idempotency");
try {
  const PtyWrapper = require("../../../src/agent/ptyWrapper");
  const wrapper = new PtyWrapper("echo", ["test"]);
  const logFile = path.join(TEST_DIR, "test2.jsonl");

  wrapper.enableLogging(logFile);

  // 第一次cleanup
  wrapper.cleanup();
  assert.strictEqual(wrapper._cleaned, true);
  assert.strictEqual(wrapper.logger, null);

  // 第二次cleanup应该安全（幂等）
  wrapper.cleanup();
  assert.strictEqual(wrapper._cleaned, true);

  console.log("✓ Cleanup is idempotent");
  console.log("✓ Resources are freed\n");
} catch (err) {
  console.error("✗ Cleanup test failed:", err.message);
  process.exit(1);
}

// 清理测试目录
console.log("Cleaning up test directory...");
try {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  console.log("✓ Test directory cleaned\n");
} catch (err) {
  console.warn("⚠ Failed to clean test directory:", err.message);
}

// 总结
console.log("======================");
console.log("All Unit Tests Passed!");
console.log("======================\n");
